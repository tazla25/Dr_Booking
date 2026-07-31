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
        return `🔒 অনেকবার ভুল PIN দিয়েছেন। ${remainMin} মিনিট পর আবার চেষ্টা করুন।`;
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

    // Generate Magic Link
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
    const tokenObj = { doctor_id: adminData.doctor_id, schedule_id: actualScheduleId };
    const tokenStr = Buffer.from(JSON.stringify(tokenObj)).toString('base64');
    const magicLink = `${baseUrl}/admin?token=${encodeURIComponent(tokenStr)}`;

    await clearSession(chatId); // Clear session after giving magic link to avoid stuck state

    return {
        text: '✅ *লগইন সফল!*\n\nড্যাশবোর্ড ওপেন করতে নিচের বাটনে ক্লিক করুন:',
        options: {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🖥️ Open Dashboard', url: magicLink }]
                ]
            }
        }
    };
  }

  return getMessage(lang, 'ERROR');
}

module.exports = { handleAdminFlow };
