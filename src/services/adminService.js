const { AppointmentError } = require('../utils/errors');
const prisma = require('../database/prisma');

/**
 * Handle admin authentication via Telegram Chat ID and generate magic link.
 *
 * @param {string} chatId
 * @returns {Object|null} { adminUser, magicLink } or null
 */
async function handleAdminAuth(chatId) {
  const adminUser = await prisma.adminUser.findUnique({
    where: { telegramChatId: String(chatId) }
  });
  
  if (!adminUser) return null;

  const baseUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  let magicLink;
  try {
    const response = await fetch(`${baseUrl}/api/auth/generate-magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BOT_API_SECRET}`
      },
      body: JSON.stringify({ telegramChatId: String(chatId) })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to generate magic link');
    }
    magicLink = data.magicLink;
  } catch (error) {
    const logger = require('../utils/logger');
    logger.error({ err: error.message }, 'Error generating magic link');
    throw new Error('Link generation failed', { cause: error });
  }

  return { adminUser, magicLink };
}

const { formatInTimeZone } = require('date-fns-tz');

/**
 * Get today's patient list for a given schedule, ordered by queue number.
 *
 * @param {string} scheduleId
 * @returns {Array} patient rows
 */
async function getTodaysPatients(scheduleId) {
  try {
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { doctor: true }
    });
    if (!schedule) return [];

    const tz = schedule.doctor?.timezone || 'Asia/Dhaka';
    const today = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
    const appointments = await prisma.appointment.findMany({
      where: {
        scheduleId: scheduleId,
        appointmentDate: today
      },
      orderBy: { queueNumber: 'asc' },
      select: {
        id: true,
        patientName: true,
        queueNumber: true,
        status: true
      }
    });

    return appointments;
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Update an appointment's status.
 *
 * @param {string} bookingId
 * @param {'Pending'|'Confirmed'|'Completed'|'Cancelled'} status
 * @param {string} doctorId - to scope the update
 * @returns {boolean} true on success
 */
async function updateAppointmentStatus(bookingId, status, doctorId) {
  try {
    const existing = await prisma.appointment.findUnique({ where: { id: bookingId } });
    if (!existing) throw new Error('Appointment not found');
    if (existing.doctorId !== doctorId) throw new Error('Unauthorized access to update appointment for this doctor');

    await prisma.appointment.update({
      where: { id: bookingId },
      data: { status }
    });
    return true;
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

module.exports = { handleAdminAuth, getTodaysPatients, updateAppointmentStatus };
