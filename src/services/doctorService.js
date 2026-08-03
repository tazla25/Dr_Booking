const { AppointmentError } = require('../utils/errors');
const prisma = require('../database/prisma');
const { sortByTrustScore } = require('../utils/bengali');

/**
 * Get all doctor schedules for a given PIN code.
 * Returns array of schedule rows joined with doctor info, sorted by trust score.
 * Only includes doctors that are active AND owned by a verified AdminUser.
 */
async function getDoctorsByPin(pinCode) {
  const pinNumber = parseInt(pinCode, 10);
  if (isNaN(pinNumber)) return [];

  try {
    const schedules = await prisma.schedule.findMany({
      where: {
        pinCode: pinNumber,
        doctor: {
          isActive: true,
          ownerAdmin: {
            role: 'DOCTOR',
            verificationStatus: 'VERIFIED',
            isActive: true,
          },
        },
      },
      include: { doctor: { include: { ownerAdmin: true } } },
    });

    // Strategy v2: sort by trust score (verified first, then rating × reviews, etc.)
    return sortByTrustScore(schedules);
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
      where: { doctorId },
      include: { doctor: true },
    });

    return schedules; // Don't sort — these are all for the same doctor
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Search doctors by full name (case-insensitive partial match).
 * Returns deduplicated schedules (a doctor may have multiple schedules —
 * each schedule is returned separately so the patient can pick the chamber).
 *
 * @param {string} name - doctor name (partial, case-insensitive)
 * @returns {Promise<Array>} schedule rows with doctor + ownerAdmin
 */
async function searchDoctorsByName(name) {
  const trimmed = (name || '').trim();
  if (trimmed.length < 2) return [];

  try {
    const schedules = await prisma.schedule.findMany({
      where: {
        doctor: {
          fullName: { contains: trimmed, mode: 'insensitive' },
          isActive: true,
          ownerAdmin: {
            role: 'DOCTOR',
            verificationStatus: 'VERIFIED',
            isActive: true,
          },
        },
      },
      include: { doctor: { include: { ownerAdmin: true } } },
      orderBy: { doctor: { fullName: 'asc' } },
    });

    return sortByTrustScore(schedules);
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Search doctors by specialization and optionally a city (matched against
 * schedule clinicName OR clinicAddress). Returns schedule rows.
 *
 * @param {string} specialty - e.g., "Cardiologist"
 * @param {string} [city] - optional city name to filter chambers
 * @returns {Promise<Array>} schedule rows with doctor + ownerAdmin
 */
async function searchDoctorsBySpecialty(specialty, city) {
  const specTrimmed = (specialty || '').trim();
  if (specTrimmed.length < 3) return [];

  const cityTrimmed = (city || '').trim();

  try {
    const schedules = await prisma.schedule.findMany({
      where: {
        doctor: {
          specialization: { contains: specTrimmed, mode: 'insensitive' },
          isActive: true,
          ownerAdmin: {
            role: 'DOCTOR',
            verificationStatus: 'VERIFIED',
            isActive: true,
          },
        },
        ...(cityTrimmed
          ? {
              OR: [
                { clinicName: { contains: cityTrimmed, mode: 'insensitive' } },
                { clinicAddress: { contains: cityTrimmed, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { doctor: { include: { ownerAdmin: true } } },
      orderBy: { doctor: { fullName: 'asc' } },
    });

    return sortByTrustScore(schedules);
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Search doctors by specialization AND PIN code (the patient knows the
 * specialty they need and their area). Returns schedule rows.
 *
 * @param {string} specialty - e.g., "Cardiologist"
 * @param {number|string} pinCode - 6-digit PIN
 * @returns {Promise<Array>} schedule rows with doctor + ownerAdmin
 */
async function searchDoctorsBySpecialtyAndPin(specialty, pinCode) {
  const specTrimmed = (specialty || '').trim();
  const pinNumber = parseInt(pinCode, 10);
  if (specTrimmed.length < 3 || isNaN(pinNumber)) return [];

  try {
    const schedules = await prisma.schedule.findMany({
      where: {
        pinCode: pinNumber,
        doctor: {
          specialization: { contains: specTrimmed, mode: 'insensitive' },
          isActive: true,
          ownerAdmin: {
            role: 'DOCTOR',
            verificationStatus: 'VERIFIED',
            isActive: true,
          },
        },
      },
      include: { doctor: { include: { ownerAdmin: true } } },
      orderBy: { doctor: { fullName: 'asc' } },
    });

    return sortByTrustScore(schedules);
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

module.exports = {
  getDoctorsByPin,
  getSchedulesForDoctor,
  searchDoctorsByName,
  searchDoctorsBySpecialty,
  searchDoctorsBySpecialtyAndPin,
};
