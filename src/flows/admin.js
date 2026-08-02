// src/flows/admin.js
// Handles the compounder/admin conversation flow.
// Called by handler.js when session step is in ADMIN_* states.
const {
  verifyAdminPin,
  getTodaysPatients,
  updateAppointmentStatus,
} = require('../services/adminService');
const { getSession, setSession, clearSession } = require('../bot/session');
const { validateAdminPin } = require('../utils/validators');
const { getMessage } = require('../utils/messages');
const logger = require('../utils/logger');

// Simple in-memory rate limiting for admin PIN attempts
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Handle an admin message based on current session step.
 *
 * @param {string} chatId
 * @param {string} text - raw message text from compounder
 * @param {string} scheduleId - the schedule to manage (from session)
 * @param {boolean} isCallback - whether this is from a callback query
 * @param {string} callbackData - the callback data string
 * @param {string} lang - the user's language
 * @returns {Promise<string|Object>} reply message or object with options
 */
async function handleAdminFlow(chatId, text, scheduleId, isCallback = false, callbackData = null, lang = 'bn') {
  const session = await getSession(chatId);

  // Step 1: Waiting for PIN
  if (session.step === 'ADMIN_AWAITING_PIN') {
    if (isCallback) return null; // Must type PIN

    // Rate limit check
    const attempts = loginAttempts.get(chatId);
    if (attempts && attempts.count >= MAX_ATTEMPTS) {
      const elapsed = Date.now() - attempts.lastAttempt;
      if (elapsed < LOCKOUT_MS) {
        const remainMin = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
        return getMessage(lang, 'LOCKOUT', remainMin);
      }
      loginAttempts.delete(chatId);
    }

    const pin = validateAdminPin(text);
    if (!pin) return getMessage(lang, 'ADMIN_INVALID_PIN');

    const adminData = await verifyAdminPin(pin, chatId);
    if (!adminData) {
      // Track failed attempt
      const current = loginAttempts.get(chatId) || { count: 0, lastAttempt: 0 };
      loginAttempts.set(chatId, { count: current.count + 1, lastAttempt: Date.now() });
      return getMessage(lang, 'ADMIN_INVALID_PIN');
    }

    // Reset attempts on success
    loginAttempts.delete(chatId);

    const actualScheduleId = adminData.schedule_id;
    if (!actualScheduleId) {
        return "⚠️ এই ডাক্তারের জন্য কোনো শিডিউল সেট করা নেই।";
    }

    // Generate Magic Link via Dashboard API
    const baseUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
    let magicLink;
    try {
      const response = await fetch(`${baseUrl}/api/auth/generate-magic-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BOT_API_SECRET}`
        },
        body: JSON.stringify({ telegramChatId: String(chatId) })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate magic link');
      }
      magicLink = data.magicLink;
    } catch (error) {
      logger.error({ err: error.message }, 'Error generating magic link');
      return '⚠️ ড্যাশবোর্ড লিঙ্ক তৈরি করতে সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
    }

    // Set session to ADMIN_DASHBOARD instead of clearing
    await setSession(chatId, { step: 'ADMIN_DASHBOARD', currentScheduleId: actualScheduleId });
    
    const patients = await getTodaysPatients(actualScheduleId);
    const dashboardMsg = getMessage(lang, 'ADMIN_DASHBOARD', patients);

    return {
        text: `✅ *লগইন সফল!*\n\nড্যাশবোর্ড ওপেন করতে নিচের বাটনে ক্লিক করুন:\n\n${dashboardMsg}`,
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
    if (text === '/refresh') {
      const patients = await getTodaysPatients(scheduleId);
      return getMessage(lang, 'ADMIN_DASHBOARD', patients);
    }
    
    if (text === '/next') {
      const patients = await getTodaysPatients(scheduleId);
      const pendingPatients = patients.filter(p => p.status === 'Confirmed' || p.status === 'Pending');
      if (pendingPatients.length === 0) {
        return getMessage(lang, 'ALL_DONE');
      }
      
      const nextPatient = pendingPatients[0];
      await updateAppointmentStatus(nextPatient.booking_id, 'Completed');
      const updatedPatients = await getTodaysPatients(scheduleId);
      return `${getMessage(lang, 'QUEUE_UPDATED', nextPatient.queue_number)}\n\n${getMessage(lang, 'ADMIN_DASHBOARD', updatedPatients)}`;
    }
    
    if (text.startsWith('/cancel')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
        const token = parseInt(parts[1], 10);
        if (!isNaN(token)) {
          const patients = await getTodaysPatients(scheduleId);
          const pToCancel = patients.find(p => p.queue_number === token);
          if (pToCancel) {
            await updateAppointmentStatus(pToCancel.booking_id, 'Cancelled');
            const updatedPatients = await getTodaysPatients(scheduleId);
            return `✅ Token #${token} Cancelled.\n\n${getMessage(lang, 'ADMIN_DASHBOARD', updatedPatients)}`;
          } else {
             return `❌ Token #${token} not found.\n\n${getMessage(lang, 'ADMIN_DASHBOARD', patients)}`;
          }
        }
      }
    }
    
    // Fallback
    const patients = await getTodaysPatients(scheduleId);
    return getMessage(lang, 'ADMIN_DASHBOARD', patients);
  }

  return getMessage(lang, 'ERROR');
}

module.exports = { handleAdminFlow };
