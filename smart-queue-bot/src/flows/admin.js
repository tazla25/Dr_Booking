// src/flows/admin.js
// Handles the compounder/admin conversation flow.
// Called by handler.js when session step is in ADMIN_* states.
const {
  verifyAdminPin,
  getTodaysPatients,
  updateAppointmentStatus,
} = require('../services/adminService');
const { getSession, setSession } = require('../bot/session');
const MESSAGES = require('../utils/messages');

/**
 * Handle an admin message based on current session step.
 *
 * @param {string} chatId
 * @param {string} text - raw message text from compounder
 * @param {string} scheduleId - the schedule to manage (from session)
 * @returns {Promise<string>} reply message
 */
async function handleAdminFlow(chatId, text, scheduleId) {
  const session = getSession(chatId);

  // Step 1: Waiting for PIN
  if (session.step === 'ADMIN_AWAITING_PIN') {
    const doctorId = await verifyAdminPin(text.trim());
    if (!doctorId) return MESSAGES.ADMIN_INVALID_PIN;

    const patients = await getTodaysPatients(scheduleId);
    setSession(chatId, {
      step: 'ADMIN_DASHBOARD',
      adminDoctorId: doctorId,
      currentScheduleId: scheduleId,
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
      setSession(chatId, { patients: updated });
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
      setSession(chatId, { patients: updated });
      return `✅ Token #${qNum} বাতিল হয়েছে।`;
    }

    // Any other text — show dashboard again
    return MESSAGES.ADMIN_DASHBOARD(session.patients);
  }

  return MESSAGES.ERROR;
}

module.exports = { handleAdminFlow };
