// src/bot/session.js
// In-memory session state machine keyed by chatId.
// Stores the conversation state for each user.
//
// Session shape:
// {
//   step: 'IDLE'
//        | 'AWAITING_PIN'
//        | 'AWAITING_DOCTOR_SELECTION'
//        | 'AWAITING_DATE'
//        | 'AWAITING_NAME'
//        | 'ADMIN_AWAITING_PIN'
//        | 'ADMIN_DASHBOARD',
//   pinCode: number,
//   schedules: Array,
//   selectedSchedule: Object,
//   appointmentDate: string,
//   adminDoctorId: string,
//   currentScheduleId: string,
//   patients: Array,
// }

const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { step: 'IDLE' });
  }
  return sessions.get(chatId);
}

function setSession(chatId, data) {
  sessions.set(chatId, { ...getSession(chatId), ...data });
}

function clearSession(chatId) {
  sessions.set(chatId, { step: 'IDLE' });
}

module.exports = { getSession, setSession, clearSession };
