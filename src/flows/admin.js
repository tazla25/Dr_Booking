// src/flows/admin.js
// Handles the doctor/compounder conversation flow.
// Called by handler.js when session step is in ADMIN_*/LOGIN_*/REGISTER_*/INVITE_* states.
//
// v11 changes:
//   - /admin and /login now both start a phone+password login flow (LOGIN_PHONE → LOGIN_PASSWORD)
//   - Registration now has a REGISTER_PASSWORD step after REGISTER_CHAMBER
//   - /back command lets users go to the previous step in any flow
//   - Errors no longer clear the session — user can retry the current step
//   - Rate limiter only counts INVALID_PASSWORD failures, not system errors
const {
  // handleAdminAuth is intentionally NOT imported — it is the legacy
  // magic-link flow that was replaced by authenticateUser (phone + password)
  // in v11. Kept exported from adminService.js only for backward-compat
  // with external callers; the bot no longer uses it. (BUG-009)
  authenticateUser,
  registerDoctor,
  inviteCompounder,
} = require('../services/adminService');
const { getSession, setSession, clearSession } = require('../bot/session');
const { getMessage } = require('../utils/messages');
const {
  validateName,
  validatePhone,
  validateMedicalRegNumber,
  validateSpecialization,
  validateAddress,
  validatePassword,
} = require('../utils/validators');
const logger = require('../utils/logger');
const prisma = require('../database/prisma');

const MAX_PASSWORD_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── /back command support ────────────────────────────────────────────
// Maps each step to its predecessor so /back can navigate.
const PREVIOUS_STEP = {
  REGISTER_PHONE: 'REGISTER_NAME',
  REGISTER_MEDICAL_REG: 'REGISTER_PHONE',
  REGISTER_SPECIALIZATION: 'REGISTER_MEDICAL_REG',
  REGISTER_CHAMBER: 'REGISTER_SPECIALIZATION',
  REGISTER_PASSWORD: 'REGISTER_CHAMBER',
  LOGIN_PASSWORD: 'LOGIN_PHONE',
  FORGOT_OTP: 'FORGOT_PHONE',
  FORGOT_NEW_PASSWORD: 'FORGOT_OTP',
  // COMPOUNDER_SET_PASSWORD and FORGOT_PHONE have no previous step
};

// Friendly step names for the "↩️ went back to" message
const STEP_LABELS = {
  REGISTER_NAME: 'Name',
  REGISTER_PHONE: 'Phone',
  REGISTER_MEDICAL_REG: 'Medical Reg. Number',
  REGISTER_SPECIALIZATION: 'Specialization',
  REGISTER_CHAMBER: 'Chamber Address',
  REGISTER_PASSWORD: 'Password',
  LOGIN_PHONE: 'Phone Number',
  LOGIN_PASSWORD: 'Password',
};

/**
 * Get the message key for asking the user to enter a value for a given step.
 */
function getAskMessageKey(step) {
  if (step.startsWith('REGISTER_')) {
    return 'REGISTER_ASK_' + step.replace('REGISTER_', '');
  }
  if (step === 'LOGIN_PHONE') return 'LOGIN_ASK_PHONE';
  if (step === 'LOGIN_PASSWORD') return 'LOGIN_ASK_PASSWORD';
  return null;
}

/**
 * Handle an admin message based on current session step.
 *
 * v11: replaces magic-link login with phone+password. The /admin and /login
 * commands both start the LOGIN_PHONE step. After password verification,
 * a one-time dashboard link is generated and returned to the user.
 *
 * @param {Object|null} bot - the bot instance (for sending notifications)
 * @param {string} chatId
 * @param {string} text
 * @param {string} _scheduleId
 * @param {boolean} _isCallback
 * @param {string|null} _callbackData
 * @param {string} lang
 */
async function handleAdminFlow(bot, chatId, text, _scheduleId, _isCallback = false, _callbackData = null, lang = 'bn') {
  const session = await getSession(chatId);

  // ── /back command — go to previous step ───────────────────────────
  const lowerText = (text || '').toLowerCase().trim();
  if (lowerText === '/back' || lowerText === 'back' || lowerText === '↩️') {
    const currentStep = session.step;
    const prevStep = PREVIOUS_STEP[currentStep];
    if (prevStep) {
      await setSession(chatId, { step: prevStep });
      const askKey = getAskMessageKey(prevStep);
      if (askKey) {
        const label = STEP_LABELS[prevStep] || prevStep;
        return getMessage(lang, 'BACK_TO_PREVIOUS', label) + '\n\n' + getMessage(lang, askKey);
      }
    }
    return getMessage(lang, 'BACK_NO_PREVIOUS');
  }

  // ── /login flow (or /admin alias) — start phone+password login ────
  // Both /admin and /login trigger the LOGIN_PHONE step. The legacy magic-link
  // /admin flow is removed — login always requires phone + password now.
  if (session.step === 'ADMIN_START' || text === '/admin' || text === '/login') {
    await setSession(chatId, { step: 'LOGIN_PHONE' });
    return getMessage(lang, 'LOGIN_ASK_PHONE');
  }

  // ── LOGIN_PHONE step — user entered their phone number ────────────
  if (session.step === 'LOGIN_PHONE') {
    const phone = validatePhone(text);
    if (!phone) return getMessage(lang, 'LOGIN_INVALID_PHONE');
    // Look up user — if not found, show helpful message immediately
    const user = await prisma.adminUser.findUnique({
      where: { phone },
      include: {
        ownedDoctor: true,
        delegatedDoctor: { include: { ownerAdmin: true } },
      },
    });
    if (!user) return getMessage(lang, 'LOGIN_USER_NOT_FOUND');
    if (user.isActive === false) return getMessage(lang, 'VERIFICATION_SUSPENDED_LOGIN');
    if (!user.passwordHash) return getMessage(lang, 'LOGIN_NO_PASSWORD');
    // Stash the phone and ask for password
    await setSession(chatId, { step: 'LOGIN_PASSWORD', loginPhone: phone, loginAttempts: 0 });
    return getMessage(lang, 'LOGIN_ASK_PASSWORD');
  }

  // ── LOGIN_PASSWORD step — user entered their password ─────────────
  if (session.step === 'LOGIN_PASSWORD') {
    const s = await getSession(chatId);
    const phone = s.loginPhone;
    if (!phone) {
      // Lost the stashed phone — restart the flow
      await setSession(chatId, { step: 'LOGIN_PHONE' });
      return getMessage(lang, 'LOGIN_ASK_PHONE');
    }

    // NEW-001 fix: brute-force protection is enforced via the FailedLogin
    // table, NOT via the in-session loginAttempts counter. The previous
    // code called clearSession() on lockout, which wiped loginAttempts
    // and let the user immediately /login again for 5 fresh attempts.
    // The DB check is keyed on phone + attemptedAt, so the lockout
    // survives session resets and applies across chat windows.
    const lockoutCutoff = new Date(Date.now() - LOCKOUT_MS);
    let recentFailures;
    try {
      recentFailures = await prisma.failedLogin.count({
        where: { email: phone, attemptedAt: { gte: lockoutCutoff } },
      });
    } catch (err) {
      // If the failed_logins table doesn't exist (migration not run), fall
      // back to allowing the attempt — better than blocking all logins.
      logger.warn({ err: err.message }, 'Failed to query failed_logins for lockout check');
      recentFailures = 0;
    }

    if (recentFailures >= MAX_PASSWORD_ATTEMPTS) {
      const remainMin = Math.ceil(LOCKOUT_MS / 60000);
      // Clear the bot session so the user must restart with /login after
      // the lockout expires — but the lockout itself is enforced by the
      // DB count above, not by session state, so they can't dodge it by
      // starting a new session.
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
      return getMessage(lang, 'LOGIN_RATE_LIMITED', remainMin);
    }

    const result = await authenticateUser(phone, text);

    if (result.ok && result.dashboardUrl) {
      // Login successful — clear session and any prior failed_login rows
      // for this phone so a fresh lockout window starts.
      try {
        await prisma.failedLogin.deleteMany({ where: { email: phone } });
      } catch (err) {
        logger.warn({ err: err.message }, 'Failed to clear failed_logins after successful login');
      }
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
      return getMessage(lang, 'LOGIN_SUCCESS', result.dashboardUrl);
    }

    // On failure: record to the FailedLogin table so the lockout is
    // enforced even if the session is later cleared.
    if (result.reason === 'INVALID_PASSWORD') {
      try {
        await prisma.failedLogin.create({
          data: { email: phone, ipAddress: undefined },
        });
      } catch (err) {
        logger.warn({ err: err.message }, 'Failed to record failed_login');
      }
      return getMessage(lang, 'LOGIN_INVALID_PASSWORD');
    }
    if (result.reason === 'USER_NOT_FOUND') {
      // Phone was deleted between step 1 and step 2 (race) — restart
      return getMessage(lang, 'LOGIN_USER_NOT_FOUND');
    }
    if (result.reason === 'NO_PASSWORD') {
      await setSession(chatId, { step: 'LOGIN_PHONE' });
      return getMessage(lang, 'LOGIN_NO_PASSWORD');
    }
    if (result.reason === 'PENDING') return getMessage(lang, 'VERIFICATION_PENDING_LOGIN');
    if (result.reason === 'REJECTED') return getMessage(lang, 'VERIFICATION_REJECTED_LOGIN');
    if (result.reason === 'SUSPENDED') return getMessage(lang, 'VERIFICATION_SUSPENDED_LOGIN');
    if (result.reason === 'LINK_FAILED') return getMessage(lang, 'ADMIN_LINK_FAILED');
    // Generic fallback
    return getMessage(lang, 'ERROR');
  }

  // ── Doctor registration flow (/register) ──────────────────────────
  if (session.step === 'REGISTER_NAME') {
    const name = validateName(text);
    if (!name) return getMessage(lang, 'REGISTER_INVALID_NAME');
    await setSession(chatId, { step: 'REGISTER_PHONE', regName: name });
    return getMessage(lang, 'REGISTER_ASK_PHONE');
  }

  if (session.step === 'REGISTER_PHONE') {
    const phone = validatePhone(text);
    if (!phone) return getMessage(lang, 'REGISTER_INVALID_PHONE');
    // Check for duplicates
    const existing = await prisma.adminUser.findUnique({ where: { phone } });
    if (existing) return getMessage(lang, 'REGISTER_ALREADY_EXISTS');
    await setSession(chatId, { step: 'REGISTER_MEDICAL_REG', regPhone: phone });
    return getMessage(lang, 'REGISTER_ASK_MEDICAL_REG');
  }

  if (session.step === 'REGISTER_MEDICAL_REG') {
    const reg = validateMedicalRegNumber(text);
    if (!reg) return getMessage(lang, 'REGISTER_INVALID_MEDICAL_REG');
    const existing = await prisma.adminUser.findUnique({ where: { medicalRegNumber: reg } });
    if (existing) return getMessage(lang, 'REGISTER_ALREADY_EXISTS');
    await setSession(chatId, { step: 'REGISTER_SPECIALIZATION', regMedReg: reg });
    return getMessage(lang, 'REGISTER_ASK_SPECIALIZATION');
  }

  if (session.step === 'REGISTER_SPECIALIZATION') {
    const spec = validateSpecialization(text);
    if (!spec) return getMessage(lang, 'REGISTER_INVALID_SPECIALIZATION');
    await setSession(chatId, { step: 'REGISTER_CHAMBER', regSpec: spec });
    return getMessage(lang, 'REGISTER_ASK_CHAMBER');
  }

  if (session.step === 'REGISTER_CHAMBER') {
    // Bug fix (v11): use dedicated validateAddress for chamber, and the
    // matching REGISTER_INVALID_CHAMBER message key (was INVALID_NAME which
    // showed a confusing "name not valid" error to the user — BUG-005).
    const chamber = validateAddress(text);
    if (!chamber) return getMessage(lang, 'REGISTER_INVALID_CHAMBER');
    await setSession(chatId, { step: 'REGISTER_PASSWORD', regChamber: chamber });
    return getMessage(lang, 'REGISTER_ASK_PASSWORD');
  }

  if (session.step === 'REGISTER_PASSWORD') {
    const password = validatePassword(text);
    if (!password) return getMessage(lang, 'REGISTER_INVALID_PASSWORD');

    // Hash the password (bcryptjs — pure JS, no native compile on Render)
    const bcrypt = require('bcryptjs');
    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(password, 10);
    } catch (err) {
      logger.error({ err: err.message }, 'bcrypt hash failed during registration');
      // Don't clear session — let user retry the password step
      return getMessage(lang, 'ERROR');
    }

    const s = await getSession(chatId);
    try {
      await registerDoctor({
        name: s.regName,
        phone: s.regPhone,
        medicalRegNumber: s.regMedReg,
        specialization: s.regSpec,
        chamberAddress: s.regChamber,
        whatsappNumber: chatId,
        passwordHash,
      });
      // Notify super admins via the bot
      await notifySuperAdminsOfNewRegistration(bot, s.regName, s.regPhone, s.regMedReg, s.regSpec, chatId);
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
      return getMessage(lang, 'REGISTER_SUCCESS_PENDING');
    } catch (err) {
      logger.error({ err: err.message, code: err.code }, 'Doctor registration failed');
      // Bug fix (v11): DON'T clear session — let user retry or fix their input
      if (err.code === 'DUPLICATE_PHONE') {
        return getMessage(lang, 'REGISTER_ALREADY_EXISTS') + '\n\n' + getMessage(lang, 'REGISTER_ASK_PHONE');
      }
      if (err.code === 'DUPLICATE_REG') {
        return getMessage(lang, 'REGISTER_ALREADY_EXISTS') + '\n\n' + getMessage(lang, 'REGISTER_ASK_MEDICAL_REG');
      }
      if (err.code === 'DUPLICATE_WHATSAPP') {
        return '⚠️ এই WhatsApp নম্বর ইতিমধ্যে অন্য অ্যাকাউন্টের সাথে যুক্ত।\n\nযদি আপনার আগের অ্যাকাউন্ট থাকে, /login দিয়ে লগইন করুন।';
      }
      if (err.code === 'DB_ERROR') {
        return '⚠️ ডাটাবেস সমস্যা। অ্যাডমিনের সাথে যোগাযোগ করুন।';
      }
      // Generic error — keep session so user can retry
      return getMessage(lang, 'ERROR');
    }
  }

  // ── Feature 2: Password reset flow (/forgot) ──────────────────────
  if (session.step === 'FORGOT_PHONE') {
    const phone = validatePhone(text);
    if (!phone) return getMessage(lang, 'FORGOT_INVALID_PHONE');

    const user = await prisma.adminUser.findUnique({ where: { phone } });
    if (!user) return getMessage(lang, 'FORGOT_USER_NOT_FOUND');

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const bcrypt = require('bcryptjs');
    const otpHash = await bcrypt.hash(otp, 10);

    // Store OTP hash + expiry in session (10 min validity)
    await setSession(chatId, {
      step: 'FORGOT_OTP',
      forgotPhone: phone,
      forgotOtpHash: otpHash,
      forgotOtpExpiry: Date.now() + 10 * 60 * 1000,
    });

    // Send OTP to the user via WhatsApp.
    // BUG-002 hardening: the user just messaged the bot in the FORGOT_PHONE
    // step, so the 24-hour conversation window is open — bot.sendMessage()
    // (which delegates to WhatsApp Cloud API text messages) will work.
    // If it does fail for any reason (network blip, recipient phone not in
    // allowed list during testing, etc.), fall back to a pre-approved
    // template message the same way reminderJob.js does.
    try {
      await bot.sendMessage(
        chatId,
        `🔢 আপনার OTP: ${otp}\n\nএই OTP ১০ মিনিটের জন্য বৈধ।`
      );
    } catch (err) {
      logger.warn({ err: err.message, chatId }, 'Free-text OTP send failed — trying template fallback');
      const isWindowError =
        String(err.message || '').includes('24-hour') ||
        String(err.message || '').includes('window') ||
        String(err.message || '').includes('not in allowed list');
      if (
        isWindowError &&
        bot._platform &&
        typeof bot._platform.sendTemplate === 'function'
      ) {
        try {
          // Requires the `otp_reset` template to be approved in Meta Business Manager.
          await bot._platform.sendTemplate(chatId, 'otp_reset', lang === 'en' ? 'en' : 'bn', [
            { type: 'body', parameters: [{ type: 'text', text: otp }] },
          ]);
          logger.info({ chatId }, 'Sent OTP via template fallback');
        } catch (templateErr) {
          logger.error({ err: templateErr.message, chatId }, 'Template OTP send also failed');
          return getMessage(lang, 'ERROR');
        }
      } else {
        logger.error({ err: err.message, chatId }, 'OTP send failed (no template fallback available)');
        return getMessage(lang, 'ERROR');
      }
    }

    return getMessage(lang, 'FORGOT_OTP_SENT');
  }

  if (session.step === 'FORGOT_OTP') {
    const s = await getSession(chatId);

    // Check expiry
    if (Date.now() > (s.forgotOtpExpiry || 0)) {
      await setSession(chatId, { step: 'FORGOT_PHONE' });
      return getMessage(lang, 'FORGOT_OTP_EXPIRED');
    }

    // Verify OTP using bcrypt compare
    const bcrypt = require('bcryptjs');
    let valid;
    try {
      valid = await bcrypt.compare((text || '').trim(), s.forgotOtpHash);
    } catch (err) {
      logger.error({ err: err.message }, 'bcrypt compare failed for OTP');
      return getMessage(lang, 'ERROR');
    }

    if (!valid) return getMessage(lang, 'FORGOT_OTP_INVALID');

    // OTP verified — move to new password step
    await setSession(chatId, { step: 'FORGOT_NEW_PASSWORD' });
    return getMessage(lang, 'FORGOT_ASK_NEW_PASSWORD');
  }

  if (session.step === 'FORGOT_NEW_PASSWORD') {
    const password = validatePassword(text);
    if (!password) return getMessage(lang, 'REGISTER_INVALID_PASSWORD');

    const bcrypt = require('bcryptjs');
    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(password, 10);
    } catch (err) {
      logger.error({ err: err.message }, 'bcrypt hash failed during password reset');
      return getMessage(lang, 'ERROR');
    }

    const s = await getSession(chatId);
    try {
      await prisma.adminUser.update({
        where: { phone: s.forgotPhone },
        data: { passwordHash },
      });
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
      return getMessage(lang, 'FORGOT_SUCCESS');
    } catch (err) {
      logger.error({ err: err.message, code: err.code }, 'Password reset failed');
      // Don't clear session — let user retry
      return getMessage(lang, 'ERROR');
    }
  }

  // ── Compounder invitation flow (/invite) ──────────────────────────
  if (session.step === 'INVITE_PHONE') {
    const phone = validatePhone(text);
    if (!phone) return getMessage(lang, 'INVITE_INVALID_PHONE');
    const s = await getSession(chatId);
    try {
      await inviteCompounder({ doctorAdminId: s.inviterDoctorAdminId, compounderPhone: phone });
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
      return getMessage(lang, 'INVITE_SUCCESS', phone);
    } catch (err) {
      if (err.code === 'DUPLICATE_PHONE') {
        return getMessage(lang, 'INVITE_ALREADY_EXISTS');
      }
      logger.error({ err: err.message }, 'Compounder invitation failed');
      // Don't clear session — user can retry
      return getMessage(lang, 'ERROR');
    }
  }

  // ── Feature 4: Compounder password setup (after /link) ───────────
  // Triggered by handler.js /link command when compounder has no passwordHash.
  if (session.step === 'COMPOUNDER_SET_PASSWORD') {
    const password = validatePassword(text);
    if (!password) return getMessage(lang, 'REGISTER_INVALID_PASSWORD');

    const bcrypt = require('bcryptjs');
    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(password, 10);
    } catch (err) {
      logger.error({ err: err.message }, 'bcrypt hash failed during compounder password setup');
      return getMessage(lang, 'ERROR');
    }

    const s = await getSession(chatId);
    try {
      await prisma.adminUser.update({
        where: { id: s.compounderId },
        data: { passwordHash },
      });
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
      return getMessage(lang, 'COMPOUNDER_PASSWORD_SET');
    } catch (err) {
      logger.error({ err: err.message, code: err.code }, 'Compounder password set failed');
      // Don't clear session — let user retry
      return getMessage(lang, 'ERROR');
    }
  }

  return getMessage(lang, 'ERROR');
}

/**
 * Send a notification to all super admins about a new doctor registration.
 * Bug 8 fix: now actually sends messages via the bot instance.
 */
async function notifySuperAdminsOfNewRegistration(bot, name, phone, reg, spec, _chatId) {
  try {
    const superAdmins = await prisma.adminUser.findMany({
      where: {
        role: 'SUPER_ADMIN',
        isActive: true,
        OR: [
          { whatsappNumber: { not: null } },
          { phone: { not: null } },
        ],
      },
    });

    if (superAdmins.length === 0) {
      logger.warn('No super admins with whatsappNumber found to notify');
      return;
    }

    const message =
      `📋 *New Doctor Registration*\n\n` +
      `👤 Name: ${name}\n` +
      `📱 Phone: ${phone}\n` +
      `🏥 Medical Reg: ${reg}\n` +
      `🩺 Specialization: ${spec}\n\n` +
      `Approve in the dashboard → Verify Doctors.`;

    for (const admin of superAdmins) {
      try {
        // Prefer whatsappNumber; fall back to phone for legacy accounts
        const target = admin.whatsappNumber || admin.phone;
        if (!target) continue;
        await bot.sendMessage(target, message);
        logger.info({ superAdminId: admin.id, target }, 'Notified super admin of new registration');
      } catch (sendErr) {
        logger.error({ superAdminId: admin.id, err: sendErr.message }, 'Failed to send notification to super admin');
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to fetch super admins for notification');
  }
}

module.exports = { handleAdminFlow };
