// src/services/feedbackService.js
//
// Phase 1 reform (Task 2.1): Patient feedback collection.
const prisma = require('../database/prisma');
const logger = require('../utils/logger');

/**
 * Submit feedback for an appointment.
 *
 * @param {Object} params
 * @param {string} params.appointmentId
 * @param {number} params.rating - 1-5
 * @param {string} [params.comment]
 * @param {string} [params.patientPhone] - used to verify the caller matches the appointment
 * @returns {Promise<Object>} the created Feedback record
 */
async function submitFeedback({ appointmentId, rating, comment, patientPhone }) {
  if (!appointmentId) throw new Error('appointmentId is required');
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    throw new Error('rating must be a number between 1 and 5');
  }

  // Verify the appointment exists and was Completed
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, patientPhone: true, status: true, feedbackSent: true },
  });
  if (!appt) throw new Error('Appointment not found');
  if (appt.status !== 'Completed') {
    throw new Error('Feedback can only be submitted for completed appointments');
  }
  if (patientPhone && appt.patientPhone !== String(patientPhone)) {
    throw new Error('This feedback request is not for you');
  }

  // Check if feedback already exists
  const existing = await prisma.feedback.findUnique({
    where: { appointmentId },
  });
  if (existing) {
    throw new Error('Feedback already submitted for this appointment');
  }

  return prisma.feedback.create({
    data: {
      appointmentId,
      rating,
      comment: comment || null,
    },
  });
}

/**
 * Get feedback for a doctor (or all doctors if super admin).
 *
 * @param {Object} params
 * @param {string} [params.doctorId] - if provided, only return feedback for this doctor
 * @param {number} [params.days=30] - look back this many days
 * @param {number} [params.limit=100]
 * @returns {Promise<{ feedback: Array, stats: Object }>}
 */
async function getFeedback({ doctorId, days = 30, limit = 100 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where = {
    createdAt: { gte: since },
    ...(doctorId ? { appointment: { doctorId } } : {}),
  };

  const [feedback, totalCount] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
      include: {
        appointment: {
          select: {
            patientName: true,
            patientPhone: true,
            appointmentDate: true,
            doctor: { select: { id: true, fullName: true, specialization: true } },
          },
        },
      },
    }),
    prisma.feedback.count({ where }),
  ]);

  // Calculate stats
  const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const f of feedback) {
    ratingCounts[f.rating] = (ratingCounts[f.rating] || 0) + 1;
    sum += f.rating;
  }
  const averageRating = feedback.length > 0 ? sum / feedback.length : 0;

  // NPS-style: 5 = promoter, 4 = passive, 1-3 = detractor
  const promoters = ratingCounts[5] || 0;
  const passives = ratingCounts[4] || 0;
  const detractors = (ratingCounts[1] || 0) + (ratingCounts[2] || 0) + (ratingCounts[3] || 0);
  const nps = feedback.length > 0 ? Math.round(((promoters - detractors) / feedback.length) * 100) : 0;

  return {
    feedback,
    stats: {
      total: totalCount,
      averageRating: Number(averageRating.toFixed(2)),
      ratingCounts,
      promoters,
      passives,
      detractors,
      nps,
    },
  };
}

/**
 * Mark an appointment's feedback request as sent (so we don't ask twice).
 * @param {string} appointmentId
 */
async function markFeedbackSent(appointmentId) {
  try {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { feedbackSent: true },
    });
  } catch (err) {
    logger.error({ err: err.message, appointmentId }, 'Failed to mark feedbackSent');
  }
}

module.exports = {
  submitFeedback,
  getFeedback,
  markFeedbackSent,
};
