const { AppointmentError } = require('../utils/errors');
const prisma = require('../database/prisma');

/**
 * Verify a 4-digit admin PIN.
 * Returns the doctor_id and schedule_id if valid, null if not found.
 *
 * @param {string} pin - 4-digit PIN string
 * @param {string} chatId - User's chat ID for tracking attempts
 * @returns {Object|null} { doctor_id, schedule_id } or null
 */
async function verifyAdminPin(pin, chatId) {
  const pinNumber = parseInt(pin, 10);
  if (isNaN(pinNumber)) {
    if (chatId) {
      await logFailedLogin(chatId, pin);
    }
    return null;
  }

  // Find a Schedule with matching pinCode. We assume pin is unique to a schedule/doctor in this old paradigm.
  const schedule = await prisma.schedule.findFirst({
    where: { pinCode: pinNumber },
    include: { doctor: true }
  });

  if (!schedule) {
    if (chatId) {
      await logFailedLogin(chatId, pin);
    }
    return null;
  }

  // Auto-register or update the compounder's Telegram ID
  await prisma.adminUser.upsert({
    where: { telegramChatId: String(chatId) },
    update: { doctorId: schedule.doctorId },
    create: {
      telegramChatId: String(chatId),
      doctorId: schedule.doctorId,
      name: 'Compounder (' + String(chatId) + ')',
      role: 'compounder',
      isActive: true
    }
  });

  return { doctor_id: schedule.doctorId, schedule_id: schedule.id };
}

/**
 * Log a failed login attempt for admin access.
 *
 * @param {string} chatId - The telegram chat ID
 * @param {string} pin - The attempted PIN
 */
async function logFailedLogin(chatId, pin) {
  try {
    await prisma.failedLogin.create({
      data: {
        email: `bot-chat-${chatId}`, // fallback email for tracking
        ipAddress: pin // using ipAddress to store the attempted pin since the new schema doesn't have attempted_pin
      }
    });
  } catch (error) {
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

  try {
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

    // map fields back to what the bot expects
    return appointments.map(app => ({
      booking_id: app.id,
      patient_name: app.patientName,
      queue_number: app.queueNumber,
      status: app.status
    }));
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Update an appointment's status.
 *
 * @param {string} bookingId
 * @param {'Pending'|'Confirmed'|'Completed'|'Cancelled'} status
 * @returns {boolean} true on success
 */
async function updateAppointmentStatus(bookingId, status) {
  try {
    await prisma.appointment.update({
      where: { id: bookingId },
      data: { status }
    });
    return true;
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

module.exports = { verifyAdminPin, getTodaysPatients, updateAppointmentStatus };
