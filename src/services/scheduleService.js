// src/services/scheduleService.js
//
// Phase 1 reform (Task 1.4): Schedule overrides.
// Allows compounders/doctors to close or modify a chamber for a specific date
// without touching the weekly schedule.
const prisma = require('../database/prisma');
const logger = require('../utils/logger');

/**
 * Get the effective schedule for a given date: the regular schedule plus any
 * override that applies on that date.
 *
 * @param {string} scheduleId
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {Promise<{ schedule: Object|null, override: Object|null }>}
 */
async function getEffectiveSchedule(scheduleId, date) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { doctor: true },
  });
  if (!schedule) return { schedule: null, override: null };

  const override = await prisma.scheduleOverride.findUnique({
    where: { scheduleId_date: { scheduleId, date } },
  });

  return { schedule, override };
}

/**
 * Returns true if the schedule is open on the given date (i.e., no CLOSED
 * override exists for that date).
 *
 * @param {string} scheduleId
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {Promise<boolean>}
 */
async function isScheduleOpen(scheduleId, date) {
  const { override } = await getEffectiveSchedule(scheduleId, date);
  if (override && override.type === 'CLOSED') return false;
  return true;
}

/**
 * Get the effective start/end times for a schedule on a date.
 * If a MODIFIED_HOURS override exists, returns the override's times;
 * otherwise returns the regular schedule's times.
 *
 * @param {string} scheduleId
 * @param {string} date
 * @returns {Promise<{ startTime: string, endTime: string } | null>}
 */
async function getEffectiveHours(scheduleId, date) {
  const { schedule, override } = await getEffectiveSchedule(scheduleId, date);
  if (!schedule) return null;
  if (override && override.type === 'CLOSED') return null;
  if (override && override.type === 'MODIFIED_HOURS' && override.newStartTime && override.newEndTime) {
    return { startTime: override.newStartTime, endTime: override.newEndTime };
  }
  return { startTime: schedule.startTime, endTime: schedule.endTime };
}

/**
 * Set (upsert) an override for a schedule+date.
 *
 * @param {Object} params
 * @param {string} params.scheduleId
 * @param {string} params.date - 'YYYY-MM-DD'
 * @param {'CLOSED'|'MODIFIED_HOURS'|'SPECIAL'} params.type
 * @param {string|null} [params.newStartTime]
 * @param {string|null} [params.newEndTime]
 * @param {string|null} [params.reason]
 * @param {string} params.userId - AdminUser.id of the creator
 * @returns {Promise<Object>} the upserted override
 */
async function setOverride({
  scheduleId,
  date,
  type,
  newStartTime = null,
  newEndTime = null,
  reason = null,
  userId,
}) {
  if (!['CLOSED', 'MODIFIED_HOURS', 'SPECIAL'].includes(type)) {
    throw new Error(`Invalid override type: ${type}`);
  }
  if (type === 'MODIFIED_HOURS' && (!newStartTime || !newEndTime)) {
    throw new Error('MODIFIED_HOURS override requires newStartTime and newEndTime');
  }

  return prisma.scheduleOverride.upsert({
    where: { scheduleId_date: { scheduleId, date } },
    update: {
      type,
      newStartTime: type === 'CLOSED' ? null : newStartTime,
      newEndTime: type === 'CLOSED' ? null : newEndTime,
      reason,
      createdBy: userId,
    },
    create: {
      scheduleId,
      date,
      type,
      newStartTime: type === 'CLOSED' ? null : newStartTime,
      newEndTime: type === 'CLOSED' ? null : newEndTime,
      reason,
      createdBy: userId,
    },
  });
}

/**
 * Remove an override for a schedule+date (revert to regular schedule).
 *
 * @param {string} scheduleId
 * @param {string} date
 * @returns {Promise<number>} count of deleted rows (0 if no override existed)
 */
async function removeOverride(scheduleId, date) {
  const result = await prisma.scheduleOverride.deleteMany({
    where: { scheduleId, date },
  });
  return result.count;
}

/**
 * List all overrides for a schedule within a date range (inclusive).
 *
 * @param {string} scheduleId
 * @param {string} [fromDate] - 'YYYY-MM-DD' (defaults to today)
 * @param {string} [toDate] - 'YYYY-MM-DD' (defaults to 30 days from today)
 * @returns {Promise<Array>}
 */
async function listOverrides(scheduleId, fromDate, toDate) {
  const today = new Date().toISOString().split('T')[0];
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const from = fromDate || today;
  const to = toDate || future;

  return prisma.scheduleOverride.findMany({
    where: {
      scheduleId,
      date: { gte: from, lte: to },
    },
    orderBy: { date: 'asc' },
  });
}

/**
 * Notify affected patients when a chamber is marked closed for a date.
 * Returns a list of appointments that should be notified (the caller is
 * responsible for actually sending the messages via the bot platform).
 *
 * @param {string} scheduleId
 * @param {string} date
 * @returns {Promise<Array>} list of affected appointments with patientPhone
 */
async function getAffectedAppointmentsForDate(scheduleId, date) {
  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        scheduleId,
        appointmentDate: date,
        status: { in: ['Confirmed', 'Pending'] },
      },
      select: {
        id: true,
        patientName: true,
        patientPhone: true,
        queueNumber: true,
      },
    });
    return appointments;
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to fetch affected appointments');
    return [];
  }
}

module.exports = {
  getEffectiveSchedule,
  isScheduleOpen,
  getEffectiveHours,
  setOverride,
  removeOverride,
  listOverrides,
  getAffectedAppointmentsForDate,
};
