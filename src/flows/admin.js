// src/flows/admin.js
// Handles the compounder/admin conversation flow.
// Called by handler.js when session step is in ADMIN_* states.
const {
  verifyAdminPin,
  getTodaysPatients,
  updateAppointmentStatus,
} = require('../services/adminService');
const { getSession, setSession } = require('../bot/session');
const { validateAdminPin } = require('../utils/validators');
const MESSAGES = require('../utils/messages');

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
 * @returns {Promise<string>} reply message
 */
async function handleAdminFlow(chatId, text, scheduleId) {
  const session = await getSession(chatId);

  // Step 1: Waiting for PIN
  if (session.step === 'ADMIN_AWAITING_PIN') {
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
    if (!pin) return MESSAGES.ADMIN_INVALID_PIN;


    const adminData = await verifyAdminPin(pin, chatId);
    if (!adminData) {
      // Track failed attempt
      const current = loginAttempts.get(chatId) || { count: 0, lastAttempt: 0 };
      loginAttempts.set(chatId, { count: current.count + 1, lastAttempt: Date.now() });
      return MESSAGES.ADMIN_INVALID_PIN;
    }

    // Reset attempts on success
    loginAttempts.delete(chatId);

    const actualScheduleId = adminData.schedule_id;
    if (!actualScheduleId) {
        return "⚠️ এই ডাক্তারের জন্য কোনো শিডিউল সেট করা নেই।";
    }

    const patients = await getTodaysPatients(actualScheduleId);
    await setSession(chatId, {
      step: 'ADMIN_DASHBOARD',
      adminDoctorId: adminData.doctor_id,
      currentScheduleId: actualScheduleId,
      patients,
    });

    return MESSAGES.ADMIN_DASHBOARD(patients);
  }

  // Step 2: Admin dashboard commands
  if (session.step === 'ADMIN_DASHBOARD') {

    // /next — mark the next pending patient as Completed
    if (text === '/next') {
      const pending = session.patients.filter((p) => p.status === 'Confirmed');
      if (!pending.length) return MESSAGES.ALL_DONE;

      const next = pending[0];
      await updateAppointmentStatus(next.booking_id, 'Completed');

      const updated = session.patients.map((p) =>
        p.queue_number === next.queue_number ? { ...p, status: 'Completed' } : p
      );
      await setSession(chatId, { patients: updated });
      return MESSAGES.QUEUE_UPDATED(next.queue_number);
    }

    // /cancel <queue_number> — cancel a specific patient
    if (text.startsWith('/cancel')) {
      const qNumStr = text.split(' ')[1];
      if (!qNumStr) return 'দয়া করে টোকেন নম্বর দিন (যেমন: /cancel 5)';
      const qNum = parseInt(qNumStr, 10);
      if (isNaN(qNum)) return 'অবৈধ টোকেন নম্বর।';
      const target = session.patients.find((p) => p.queue_number === qNum);

      if (!target) return `Token #${qNum} পাওয়া যায়নি।`;

      await updateAppointmentStatus(target.booking_id, 'Cancelled');
      const updated = session.patients.map((p) =>
        p.queue_number === qNum ? { ...p, status: 'Cancelled' } : p
      );
      await setSession(chatId, { patients: updated });
      return `✅ Token #${qNum} বাতিল হয়েছে।`;
    }

    // /refresh — reload patient list from database
    if (text === '/refresh') {
      const patients = await getTodaysPatients(session.currentScheduleId);
      await setSession(chatId, { patients });
      return MESSAGES.ADMIN_DASHBOARD(patients);
    }

    // Any other text — show dashboard again
    return MESSAGES.ADMIN_DASHBOARD(session.patients);
  }

  return MESSAGES.ERROR;
}

module.exports = { handleAdminFlow };
