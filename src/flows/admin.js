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
  handleAdminAuth,
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
    const attempts = (s.loginAttempts || 0) + 1;

    // Rate limit check
    if (attempts > MAX_PASSWORD_ATTEMPTS) {
      const remainMin = Math.ceil(LOCKOUT_MS / 60000);
      // Reset session so user has to start over after lockout
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
      return getMessage(lang, 'LOGIN_RATE_LIMITED', remainMin);
    }

    const result = await authenticateUser(s.loginPhone, text);

    if (result.ok && result.dashboardUrl) {
      // Login successful — clear session and return the dashboard URL
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
      return getMessage(lang, 'LOGIN_SUCCESS', result.dashboardUrl);
    }

    // On failure, increment attempt counter and stay on LOGIN_PASSWORD
    // (don't clear session — user can retry)
    await setSession(chatId, { loginAttempts: attempts });

    if (result.reason === 'INVALID_PASSWORD') {
      return getMessage(lang, 'LOGIN_INVALID_PASSWORD');
    }
    if (result.reason === 'USER_NOT_FOUND') {
      // Phone was deleted between step 1 and step 2 (race) — restart
      await setSession(chatId, { step: 'LOGIN_PHONE' });
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
    // Bug fix (v11): use dedicated validateAddress, not validateName
    const chamber = validateAddress(text);
    if (!chamber) return getMessage(lang, 'INVALID_NAME');
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

    // Send OTP to the user via WhatsApp (the bot is already talking to them)
    try {
      await bot.sendMessage(
        chatId,
        `🔢 আপনার OTP: ${otp}\n\nএই OTP ১০ মিনিটের জন্য বৈধ।`
      );
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to send OTP via WhatsApp');
      return getMessage(lang, 'ERROR');
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
