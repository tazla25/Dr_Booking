const { AppointmentError } = require('../utils/errors');
// src/services/adminService.js
// Admin PIN authentication, patient list, and status updates
const supabase = require('../database/supabase');

/**
 * Verify a 4-digit admin PIN.
 * Returns the doctor_id if valid, null if not found.
 *
 * @param {string} pin - 4-digit PIN string
 * @param {string} chatId - User's chat ID for tracking attempts
 * @returns {string|null} doctor_id or null
 */
async function verifyAdminPin(pin, chatId) {
  // First, verify the PIN
  const { data, error } = await supabase
    .from('admin_access')
    .select('doctor_id, secret_pin')
    .eq('secret_pin', pin)
    .single();

  if (error || !data) {
    if (chatId) {
      await logFailedLogin(chatId, pin);
    }
    return null;
  }
  return data.doctor_id;
}

/**
 * Log a failed login attempt for admin access.
 *
 * @param {string} chatId - The telegram chat ID
 * @param {string} pin - The attempted PIN
 */
async function logFailedLogin(chatId, pin) {
  const { error } = await supabase.from('failed_login_attempts').insert({
    chat_id: String(chatId),
    attempted_pin: String(pin)
  });

  if (error) {
    const logger = require('../utils/logger');
    logger.error({ chatId, err: error.message }, 'Failed to log login attempt');
  }
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

  if (error) throw new AppointmentError(error.message, 'DB_ERROR');
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

  if (error) throw new AppointmentError(error.message, 'DB_ERROR');
  return true;
}

module.exports = { verifyAdminPin, getTodaysPatients, updateAppointmentStatus };
