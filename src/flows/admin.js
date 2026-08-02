// src/flows/admin.js
// Handles the compounder/admin conversation flow.
// Called by handler.js when session step is in ADMIN_* states.
const {
  handleAdminAuth,
} = require('../services/adminService');
const { getSession, setSession, clearSession } = require('../bot/session');
const { getMessage } = require('../utils/messages');
const logger = require('../utils/logger');
const prisma = require('../database/prisma');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Handle an admin message based on current session step.
 */
async function handleAdminFlow(chatId, text, scheduleId, isCallback = false, callbackData = null, lang = 'bn') {
  const session = await getSession(chatId);

  // Rate limit check
  const ip = String(chatId);
  const endpoint = 'admin_login';
  const now = new Date();

  try {
    // Delete expired entries sporadically
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

  if (session.step === 'ADMIN_START' || text === '/admin') {
    const authResult = await handleAdminAuth(chatId);
    if (!authResult) {
      return '❌ You are not registered as an admin. Contact support.';
    }

    const { adminUser, magicLink } = authResult;

    // Reset rate limit on success
    await prisma.rateLimitEntry.delete({
      where: { ip_endpoint: { ip, endpoint } }
    }).catch(() => {});

    await setSession(chatId, { step: 'ADMIN_DASHBOARD', doctorId: adminUser.doctorId });

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

  return getMessage(lang, 'ERROR');
}

module.exports = { handleAdminFlow };
