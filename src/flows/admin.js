// src/flows/admin.js
// Handles the doctor/compounder conversation flow.
// Called by handler.js when session step is in ADMIN_* states.
//
// Phase 1 reform:
//   - /admin     → magic-link login for existing verified users
//   - /register  → new doctor onboarding (PENDING → super admin approves)
//   - /invite    → verified doctor invites a compounder by phone
const {
  handleAdminAuth,
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
} = require('../utils/validators');
const logger = require('../utils/logger');
const prisma = require('../database/prisma');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Handle an admin message based on current session step.
 */
async function handleAdminFlow(chatId, text, scheduleId, isCallback = false, callbackData = null, lang = 'bn') {
  const session = await getSession(chatId);

  // Rate limit check (only for the /admin login attempt, not for registration steps)
  const ip = String(chatId);
  const endpoint = 'admin_login';
  const now = new Date();

  try {
    if (Math.random() < 0.2) {
      await prisma.rateLimitEntry.deleteMany({
        where: { expiresAt: { lt: now } }
      });
    }

    let entry = await prisma.rateLimitEntry.upsert({
      where: { ip_endpoint: { ip, endpoint } },
      update: { hits: { increment: 1 } },
      create: {
        ip,
        endpoint,
        hits: 1,
        expiresAt: new Date(now.getTime() + LOCKOUT_MS)
      }
    });

    if (entry.hits > MAX_ATTEMPTS) {
      if (entry.expiresAt < now) {
         entry = await prisma.rateLimitEntry.update({
           where: { ip_endpoint: { ip, endpoint } },
           data: { hits: 1, expiresAt: new Date(now.getTime() + LOCKOUT_MS) }
         });
      } else {
         const remainMin = Math.ceil((entry.expiresAt.getTime() - now.getTime()) / 60000);
         return getMessage(lang, 'LOCKOUT', remainMin);
      }
    }
  } catch (error) {
    logger.error('Rate limit error:', error);
  }

  // ── /admin login flow ──────────────────────────────────────────────
  if (session.step === 'ADMIN_START' || text === '/admin') {
    const authResult = await handleAdminAuth(chatId);
    if (!authResult) {
      return getMessage(lang, 'ERROR');
    }

    const { adminUser, magicLink, reason } = authResult;

    // If verification gate failed, show appropriate message
    if (!magicLink) {
      if (reason === 'PENDING') return getMessage(lang, 'VERIFICATION_PENDING_LOGIN');
      if (reason === 'REJECTED') return getMessage(lang, 'VERIFICATION_REJECTED_LOGIN');
      if (reason === 'SUSPENDED') return getMessage(lang, 'VERIFICATION_SUSPENDED_LOGIN');
      return getMessage(lang, 'ERROR');
    }

    // Reset rate limit on success
    await prisma.rateLimitEntry.delete({
      where: { ip_endpoint: { ip, endpoint } }
    }).catch(() => {});

    await setSession(chatId, { step: 'ADMIN_DASHBOARD', doctorId: adminUser.ownedDoctor?.id || adminUser.delegatedDoctorId });

    return {
        text: `✅ *লগইন সফল!*\n\nড্যাশবোর্ড ওপেন করতে নিচের বাটনে ক্লিক করুন:`,
        options: {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🖥️ Open Web Dashboard', url: magicLink }]
                ]
            }
        }
    };
  }

  // Step 2: Admin Dashboard actions
  if (session.step === 'ADMIN_DASHBOARD') {
     return `✅ You are logged in. Open the Web Dashboard to manage patients. Use /admin to get a new link.`;
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
    const chamber = validateName(text); // re-use name validator (min 2 chars)
    if (!chamber) return getMessage(lang, 'INVALID_NAME');
    const s = await getSession(chatId);
    try {
      await registerDoctor({
        name: s.regName,
        phone: s.regPhone,
        medicalRegNumber: s.regMedReg,
        specialization: s.regSpec,
        chamberAddress: chamber,
        telegramChatId: chatId,
      });
      // Notify super admins
      await notifySuperAdminsOfNewRegistration(s.regName, s.regPhone, s.regMedReg, s.regSpec, chatId);
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
      return getMessage(lang, 'REGISTER_SUCCESS_PENDING');
    } catch (err) {
      logger.error({ err: err.message }, 'Doctor registration failed');
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
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
      await clearSession(chatId);
      await setSession(chatId, { step: 'IDLE', lang });
      return getMessage(lang, 'ERROR');
    }
  }

  return getMessage(lang, 'ERROR');
}

/**
 * Send a notification to all super admins about a new doctor registration.
 */
async function notifySuperAdminsOfNewRegistration(name, phone, reg, spec, chatId) {
  try {
    const superAdmins = await prisma.adminUser.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true, telegramChatId: { not: null } },
    });
    // We can't directly call bot.sendMessage here (no bot instance in this module).
    // The notification will be sent via a separate job or webhook. For now, just log it.
    logger.info(
      { name, phone, reg, spec, registeredFromChatId: chatId, superAdminCount: superAdmins.length },
      'New doctor registration — super admins should review'
    );
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to notify super admins');
  }
}

module.exports = { handleAdminFlow };
