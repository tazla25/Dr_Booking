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

    return schedules;
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

    return schedules;
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

module.exports = { getDoctorsByPin, getSchedulesForDoctor };
