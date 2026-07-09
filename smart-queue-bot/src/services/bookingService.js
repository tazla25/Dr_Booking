// src/services/bookingService.js
// Create bookings and get live queue status
const supabase = require('../database/supabase');

/**
 * Create a new appointment booking.
 * Automatically generates the next queue number for that schedule+date.
 *
 * @param {Object} params
 * @param {string} params.patientName
 * @param {string} params.patientPhone
 * @param {string} params.scheduleId
 * @param {string} params.appointmentDate  - Format: 'YYYY-MM-DD'
 * @returns {Object} created appointment row
 */
async function createBooking({ patientName, patientPhone, scheduleId, appointmentDate }) {
  // Count existing bookings to determine next queue number
  const { count, error: countErr } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('schedule_id', scheduleId)
    .eq('appointment_date', appointmentDate);

  if (countErr) throw new Error(countErr.message);

  const queueNumber = (count ?? 0) + 1;

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_name: patientName,
      patient_phone: patientPhone,
      schedule_id: scheduleId,
      appointment_date: appointmentDate,
      queue_number: queueNumber,
      status: 'Confirmed',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
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
