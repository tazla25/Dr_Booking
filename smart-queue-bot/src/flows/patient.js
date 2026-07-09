// src/flows/patient.js
// Handles the full patient booking conversation flow.
// Called by handler.js when session step is in patient flow states.
const { getDoctorsByPin } = require('../services/doctorService');
const { createBooking } = require('../services/bookingService');
const { getSession, setSession, clearSession } = require('../bot/session');
const MESSAGES = require('../utils/messages');

/**
 * Handle a patient message based on current session step.
 *
 * @param {string} chatId
 * @param {string} text - raw message text from user
 * @returns {Promise<string>} reply message
 */
async function handlePatientFlow(chatId, text) {
  const session = getSession(chatId);

  // Step 1: Waiting for PIN code
  if (session.step === 'AWAITING_PIN') {
    const trimmed = text.trim();
    const pin = parseInt(trimmed, 10);

    if (isNaN(pin) || trimmed.length !== 6) {
      return MESSAGES.INVALID_PIN_FORMAT;
    }

    const schedules = await getDoctorsByPin(pin);
    if (!schedules.length) return MESSAGES.NO_DOCTORS;

    setSession(chatId, {
      step: 'AWAITING_DOCTOR_SELECTION',
      pinCode: pin,
      schedules,
    });
    return MESSAGES.SELECT_DOCTOR(schedules);
  }

  // Step 2: Waiting for doctor selection (number)
  if (session.step === 'AWAITING_DOCTOR_SELECTION') {
    const idx = parseInt(text.trim(), 10) - 1;

    if (isNaN(idx) || idx < 0 || idx >= session.schedules.length) {
      return MESSAGES.INVALID_SELECTION;
    }

    const selected = session.schedules[idx];
    setSession(chatId, { step: 'AWAITING_DATE', selectedSchedule: selected });
    return MESSAGES.ASK_DATE;
  }

  // Step 3: Waiting for appointment date
  if (session.step === 'AWAITING_DATE') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(text.trim())) {
      return MESSAGES.INVALID_DATE;
    }

    setSession(chatId, { step: 'AWAITING_NAME', appointmentDate: text.trim() });
    return MESSAGES.ASK_NAME;
  }

  // Step 4: Waiting for patient name — create booking
  if (session.step === 'AWAITING_NAME') {
    const booking = await createBooking({
      patientName: text.trim(),
      patientPhone: String(chatId),
      scheduleId: session.selectedSchedule.schedule_id,
      appointmentDate: session.appointmentDate,
    });

    clearSession(chatId);
    return MESSAGES.BOOKING_CONFIRMED(
      booking.patient_name,
      booking.queue_number,
      booking.appointment_date
    );
  }

  return MESSAGES.ERROR;
}

module.exports = { handlePatientFlow };
