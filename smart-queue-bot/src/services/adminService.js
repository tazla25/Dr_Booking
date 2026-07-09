// src/services/adminService.js
// Admin PIN authentication, patient list, and status updates
const supabase = require('../database/supabase');

/**
 * Verify a 4-digit admin PIN.
 * Returns the doctor_id if valid, null if not found.
 *
 * @param {string} pin - 4-digit PIN string
 * @returns {string|null} doctor_id or null
 */
async function verifyAdminPin(pin) {
  const { data, error } = await supabase
    .from('admin_access')
    .select('doctor_id, secret_pin')
    .eq('secret_pin', pin)
    .single();

  if (error || !data) return null;
  return data.doctor_id;
}

/**
 * Get today's patient list for a given schedule, ordered by queue number.
 *
 * @param {string} scheduleId
 * @returns {Array} patient rows
 */
async function getTodaysPatients(scheduleId) {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('appointments')
    .select('booking_id, patient_name, queue_number, status')
    .eq('schedule_id', scheduleId)
    .eq('appointment_date', today)
    .order('queue_number', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Update an appointment's status.
 *
 * @param {string} bookingId
 * @param {'Pending'|'Confirmed'|'Completed'|'Cancelled'} status
 * @returns {boolean} true on success
 */
async function updateAppointmentStatus(bookingId, status) {
  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('booking_id', bookingId);

  if (error) throw new Error(error.message);
  return true;
}

module.exports = { verifyAdminPin, getTodaysPatients, updateAppointmentStatus };
