const { AppointmentError } = require('../utils/errors');
const prisma = require('../database/prisma');

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
  // We need the doctorId for the appointment, so let's get the schedule first
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId }
  });

  if (!schedule) {
    throw new AppointmentError('Schedule not found', 'NOT_FOUND');
  }

  // Race-condition safe queue number assignment with retry
  let attempts = 0;
  while (attempts < 3) {
    try {
      const maxRow = await prisma.appointment.aggregate({
        _max: { queueNumber: true },
        where: {
          scheduleId: scheduleId,
          appointmentDate: appointmentDate
        }
      });

      const queueNumber = (maxRow._max.queueNumber ?? 0) + 1;

      const data = await prisma.appointment.create({
        data: {
          patientName: patientName,
          patientPhone: patientPhone,
          scheduleId: scheduleId,
          doctorId: schedule.doctorId,
          appointmentDate: appointmentDate,
          queueNumber: queueNumber,
          status: 'Confirmed',
        }
      });

      return data;
    } catch (error) {
      attempts++;
      // If it's a unique constraint violation, retry
      if (error.code === 'P2002' && attempts < 3) {
        continue;
      }
      throw new AppointmentError(error.message, 'DB_ERROR');
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
  try {
    const rows = await prisma.appointment.findMany({
      where: {
        scheduleId: scheduleId,
        appointmentDate: appointmentDate
      },
      select: {
        queueNumber: true,
        status: true,
        patientName: true
      },
      orderBy: { queueNumber: 'asc' }
    });

    const completed = rows.filter((r) => r.status === 'Completed');
    const pending = rows.filter(
      (r) => r.status !== 'Completed' && r.status !== 'Cancelled'
    );
    const currentToken =
      completed.length > 0 ? Math.max(...completed.map((r) => r.queueNumber)) : 0;

    return { currentToken, pending };
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Cancel an appointment by token and user chatId.
 *
 * @param {number} queueNumber
 * @param {string} chatId
 * @returns {boolean} true on success
 */
async function cancelBookingByQueueNumber(queueNumber, chatId) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Find the appointment — scoped to today's bookings for this patient
    const appointment = await prisma.appointment.findFirst({
      where: {
        queueNumber: queueNumber,
        patientPhone: String(chatId),
        status: 'Confirmed',
        appointmentDate: { gte: today }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!appointment) {
      throw new AppointmentError('Appointment not found or already cancelled.', 'NOT_FOUND', '❌ আপনার দেওয়া টোকেনটি পাওয়া যায়নি অথবা ইতোমধ্যে বাতিল করা হয়েছে।');
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'Cancelled' }
    });

    return true;
  } catch (error) {
    if (error instanceof AppointmentError) throw error;
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Reschedule an appointment by token and user chatId.
 *
 * @param {number} queueNumber
 * @param {string} chatId
 * @param {string} newDate (YYYY-MM-DD)
 * @returns {boolean} true on success
 */
async function rescheduleBookingByToken(queueNumber, chatId, newDate) {
  try {
    // Find the appointment first
    const appointment = await prisma.appointment.findFirst({
      where: {
        queueNumber: queueNumber,
        patientPhone: String(chatId),
        status: 'Confirmed'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!appointment) {
      throw new AppointmentError('Appointment not found or already cancelled.', 'NOT_FOUND', '❌ আপনার দেওয়া টোকেনটি পাওয়া যায়নি অথবা ইতোমধ্যে বাতিল করা হয়েছে।');
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { appointmentDate: newDate }
    });

    return true;
  } catch (error) {
    if (error instanceof AppointmentError) throw error;
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

module.exports = { createBooking, getQueueStatus, cancelBookingByQueueNumber, rescheduleBookingByToken };
