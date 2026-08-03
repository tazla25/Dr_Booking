const { AppointmentError } = require('../utils/errors');
const prisma = require('../database/prisma');
const { formatInTimeZone } = require('date-fns-tz');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
 * Bug 5 fix: use timezone-aware "today" (Asia/Kolkata) instead of UTC.
 * Previously, a patient in West Bengal (UTC+5:30) trying to cancel at 1am
 * local time couldn't cancel today's appointment because UTC returned yesterday.
 *
 * @param {number} queueNumber
 * @param {string} chatId
 * @returns {boolean} true on success
 */
async function cancelBookingByQueueNumber(queueNumber, chatId) {
  try {
    const today = formatInTimeZone(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');

    // Find the appointment — scoped to today's and future bookings for this patient
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
 * Reschedule an appointment by queue number and user chatId.
 *
 * Bug 6 fix: validates that:
 *   - newDate is not in the past
 *   - newDate falls on the same dayOfWeek as the schedule (doctor works that day)
 *
 * Also renamed from rescheduleBookingByToken → rescheduleBookingByQueueNumber
 * for consistency with cancelBookingByQueueNumber.
 *
 * @param {number} queueNumber
 * @param {string} chatId
 * @param {string} newDate (YYYY-MM-DD)
 * @returns {boolean} true on success
 */
async function rescheduleBookingByQueueNumber(queueNumber, chatId, newDate) {
  try {
    // Bug 6 fix: validate the new date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      throw new AppointmentError('Invalid date format', 'INVALID_DATE', '❌ তারিখ সঠিক নয় (YYYY-MM-DD ফরম্যাট দিন)।');
    }

    // Find the appointment first
    const appointment = await prisma.appointment.findFirst({
      where: {
        queueNumber: queueNumber,
        patientPhone: String(chatId),
        status: 'Confirmed'
      },
      orderBy: { createdAt: 'desc' },
      include: { schedule: true }
    });

    if (!appointment) {
      throw new AppointmentError('Appointment not found or already cancelled.', 'NOT_FOUND', '❌ আপনার দেওয়া টোকেনটি পাওয়া যায়নি অথবা ইতোমধ্যে বাতিল করা হয়েছে।');
    }

    // Bug 6 fix: validate newDate is not in the past
    const today = formatInTimeZone(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    if (newDate < today) {
      throw new AppointmentError('Cannot reschedule to past date', 'INVALID_DATE', '❌ অতীতের তারিখে রিশেডিউল করা যায় না।');
    }

    // Bug 6 fix: validate the doctor works on that day
    const newDateDay = DAYS[new Date(newDate + 'T00:00:00').getDay()];
    if (appointment.schedule && appointment.schedule.dayOfWeek !== newDateDay) {
      throw new AppointmentError(
        'Doctor does not work on this day',
        'INVALID_DAY',
        `❌ এই দিনে ডাক্তার চেম্বার করেন না। ডাক্তার শুধুমাত্র ${appointment.schedule.dayOfWeek} দিনে চেম্বার করেন।`
      );
    }

    // Recompute queue number for new date — race-condition safe with retry
    let attempts = 0;
    while (attempts < 3) {
      try {
        const maxRow = await prisma.appointment.aggregate({
          _max: { queueNumber: true },
          where: { scheduleId: appointment.scheduleId, appointmentDate: newDate },
        });
        const nextQueue = (maxRow._max.queueNumber ?? 0) + 1;

        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { appointmentDate: newDate, queueNumber: nextQueue, status: 'Confirmed' },
        });
        break;
      } catch (error) {
        attempts++;
        if (error.code === 'P2002' && attempts < 3) continue;
        if (attempts >= 3) {
          throw new AppointmentError('Could not assign queue number after retries', 'RACE_CONDITION',
            '❌ রিশেডিউল করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
        }
      }
    }

    return true;
  } catch (error) {
    if (error instanceof AppointmentError) throw error;
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

// Backward-compatible alias
const rescheduleBookingByToken = rescheduleBookingByQueueNumber;

/**
 * Get a patient's booking history (last 10 appointments, excluding very old ones).
 *
 * @param {string} chatId - the patient's telegram chatId (used as patientPhone)
 * @returns {Promise<Array>} appointment rows with doctor + schedule info
 */
async function getPatientHistory(chatId) {
  try {
    // Only show appointments from the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sinceStr = sixMonthsAgo.toISOString().split('T')[0];

    return await prisma.appointment.findMany({
      where: {
        patientPhone: String(chatId),
        appointmentDate: { gte: sinceStr },
      },
      include: {
        doctor: { select: { id: true, fullName: true, specialization: true } },
        schedule: { select: { id: true, clinicName: true, dayOfWeek: true, startTime: true, endTime: true } },
      },
      orderBy: { appointmentDate: 'desc' },
      take: 10,
    });
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Estimate the wait time (in minutes) for a patient based on their queue
 * position and the schedule's avgMinutesPerPatient.
 *
 * @param {string} scheduleId
 * @param {string} date - 'YYYY-MM-DD'
 * @param {number} queueNumber - the patient's queue number
 * @returns {Promise<{ patientsAhead: number, waitMinutes: number, isNext: boolean }>}
 */
async function estimateWaitTime(scheduleId, date, queueNumber) {
  try {
    const { currentToken } = await getQueueStatus(scheduleId, date);
    const patientsAhead = queueNumber - currentToken - 1;
    const isNext = patientsAhead === 0;
    if (patientsAhead < 0) return { patientsAhead: 0, waitMinutes: 0, isNext: true };

    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { avgMinutesPerPatient: true },
    });
    const avgMin = schedule?.avgMinutesPerPatient || 10;
    return {
      patientsAhead,
      waitMinutes: patientsAhead * avgMin,
      isNext,
    };
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

module.exports = {
  createBooking,
  getQueueStatus,
  cancelBookingByQueueNumber,
  rescheduleBookingByQueueNumber,
  rescheduleBookingByToken, // backward-compatible alias
  getPatientHistory,
  estimateWaitTime,
};
