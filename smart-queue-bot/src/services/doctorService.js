// src/services/doctorService.js
// Search doctors by PIN code and get schedules
const supabase = require('../database/supabase');

/**
 * Get all doctor schedules for a given PIN code.
 * Returns array of schedule rows joined with doctor info.
 */
async function getDoctorsByPin(pinCode) {
  const { data, error } = await supabase
    .from('schedules')
    .select('*, doctors(*)')
    .eq('pin_code', pinCode);

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Get all schedules for a specific doctor.
 */
async function getSchedulesForDoctor(doctorId) {
  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('doctor_id', doctorId);

  if (error) throw new Error(error.message);
  return data || [];
}

module.exports = { getDoctorsByPin, getSchedulesForDoctor };
