// src/flows/patient.js
// Handles the full patient booking conversation flow.
// Called by handler.js when session step is in patient flow states.
const { getDoctorsByPin } = require('../services/doctorService');
const { createBooking } = require('../services/bookingService');
const { getSession, setSession, clearSession } = require('../bot/session');
const { validatePinCode, validateDate, validateName } = require('../utils/validators');
const MESSAGES = require('../utils/messages');
const logger = require('../utils/logger');
const { AppointmentError } = require('../utils/errors');

/**
 * Handle a patient message based on current session step.
 *
 * @param {string} chatId
 * @param {string} text - raw message text from user
 * @returns {Promise<string>} reply message
 */
async function handlePatientFlow(chatId, text) {
  const session = await getSession(chatId);
  try {
    // Step 1: Waiting for PIN code
    if (session.step === 'AWAITING_PIN') {
      const pin = validatePinCode(text);
      if (pin === null) {
        logger.warn({ chatId }, 'Invalid PIN format entered');
        return MESSAGES.INVALID_PIN_FORMAT;
      }

      const schedules = await getDoctorsByPin(pin);
      if (!schedules.length) {
         logger.info({ chatId, pin }, 'No doctors found for PIN');
         return MESSAGES.NO_DOCTORS;
      }

      await setSession(chatId, {
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
        logger.warn({ chatId, text, max: session.schedules.length }, 'Invalid doctor selection');
        return MESSAGES.INVALID_SELECTION;
      }

      const selected = session.schedules[idx];
      await setSession(chatId, { step: 'AWAITING_DATE', selectedSchedule: selected });
      return MESSAGES.ASK_DATE;
    }

    // Step 3: Waiting for appointment date
    if (session.step === 'AWAITING_DATE') {
      const validDate = validateDate(text);
      if (!validDate) {
        logger.warn({ chatId, text }, 'Invalid date format entered');
        return MESSAGES.INVALID_DATE;
      }

      await setSession(chatId, { step: 'AWAITING_NAME', appointmentDate: validDate });
      return MESSAGES.ASK_NAME;
    }

    // Step 4: Waiting for patient name — create booking
    if (session.step === 'AWAITING_NAME') {
      const name = validateName(text);
      if (!name) {
        logger.warn({ chatId, text }, 'Invalid name format entered');
        return 'নাম কমপক্ষে ২ অক্ষরের হতে হবে। আবার লিখুন:';
      }

      const booking = await createBooking({
        patientName: name,
        patientPhone: String(chatId),
        scheduleId: session.selectedSchedule.schedule_id,
        appointmentDate: session.appointmentDate,
      });

      await clearSession(chatId);
      logger.info({ chatId, bookingId: booking.id, queueNumber: booking.queue_number }, 'Booking created successfully');
      return MESSAGES.BOOKING_CONFIRMED(
        booking.patient_name,
        booking.queue_number,
        booking.appointment_date
      );
    }

    return MESSAGES.ERROR;
  } catch (error) {
     logger.error({ err: error, chatId, text, step: session.step }, 'Patient flow error');
     if (error instanceof AppointmentError) {
         return error.userMessage;
     }
     return MESSAGES.ERROR;
  }
}

module.exports = { handlePatientFlow };
