// src/services/bookingService.js
// Create bookings and get live queue status
const supabase = require('../database/supabase');

/**
 * Create a new appointment booking.
 * Automatically generates the next queue number for that schedule+date.
 * Uses database transaction with retry to prevent race conditions.
 *
 * @param {Object} params
 * @param {string} params.patientName
 * @param {string} params.patientPhone
 * @param {string} params.scheduleId
 * @param {string} params.appointmentDate  - Format: 'YYYY-MM-DD'
 * @returns {Object} created appointment row
 */
async function createBooking({ patientName, patientPhone, scheduleId, appointmentDate }) {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;

    try {
      const { data, error } = await supabase.rpc('create_booking_atomic', {
        p_patient_name: patientName,
        p_patient_phone: patientPhone,
        p_schedule_id: scheduleId,
        p_appointment_date: appointmentDate,
      });

      if (error) {
        if (error.code === '23505' && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 50 * attempt));
          continue;
        }
        throw new Error(error.message);
      }

      return data[0];
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      if (err.message.includes('duplicate key') || err.message.includes('23505')) {
        await new Promise(r => setTimeout(r, 50 * attempt));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Get the live queue status for a schedule on a given date.
 * Returns the current token (last completed) and list of pending patients.
 *
 * @param {string} scheduleId
 * @param {string} appointmentDate - Format: 'YYYY-MM-DD'
 * @returns {{ currentToken: number, pending: Array }}
 */
async function getQueueStatus(scheduleId, appointmentDate) {
  const { data, error } = await supabase
    .from('appointments')
    .select('queue_number, status, patient_name')
    .eq('schedule_id', scheduleId)
    .eq('appointment_date', appointmentDate)
    .order('queue_number', { ascending: true });

  if (error) throw new Error(error.message);

  const rows = data || [];
  const completed = rows.filter((r) => r.status === 'Completed');
  const pending = rows.filter(
    (r) => r.status !== 'Completed' && r.status !== 'Cancelled'
  );
  const currentToken =
    completed.length > 0 ? Math.max(...completed.map((r) => r.queue_number)) : 0;

  return { currentToken, pending };
}

module.exports = { createBooking, getQueueStatus };
