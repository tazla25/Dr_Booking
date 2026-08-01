const { AppointmentError } = require('../utils/errors');
const prisma = require('../database/prisma');

/**
 * Get all doctor schedules for a given PIN code.
 * Returns array of schedule rows joined with doctor info.
 */
async function getDoctorsByPin(pinCode) {
  const pinNumber = parseInt(pinCode, 10);
  if (isNaN(pinNumber)) return [];

  try {
    const schedules = await prisma.schedule.findMany({
      where: { pinCode: pinNumber },
      include: { doctor: true }
    });

    // map fields for backward compatibility
    return schedules.map(schedule => ({
      ...schedule,
      pin_code: schedule.pinCode,
      doctor_id: schedule.doctorId,
      doctors: {
        ...schedule.doctor,
        doctor_id: schedule.doctor.id,
        full_name: schedule.doctor.fullName
      }
    }));
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Get all schedules for a specific doctor.
 */
async function getSchedulesForDoctor(doctorId) {
  try {
    const schedules = await prisma.schedule.findMany({
      where: { doctorId: doctorId }
    });

    // map fields for backward compatibility
    return schedules.map(schedule => ({
      ...schedule,
      pin_code: schedule.pinCode,
      doctor_id: schedule.doctorId,
      day_of_week: schedule.dayOfWeek,
      start_time: schedule.startTime,
      end_time: schedule.endTime
    }));
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

module.exports = { getDoctorsByPin, getSchedulesForDoctor };
