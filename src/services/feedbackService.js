// src/services/feedbackService.js (Task 2.1)
const prisma = require('../database/prisma');
const logger = require('../utils/logger');

async function submitFeedback({ appointmentId, rating, comment, patientPhone }) {
  if (!appointmentId) throw new Error('appointmentId is required');
  if (typeof rating !== 'number' || rating < 1 || rating > 5) throw new Error('rating must be 1-5');
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { id: true, patientPhone: true, status: true } });
  if (!appt) throw new Error('Appointment not found');
  if (appt.status !== 'Completed') throw new Error('Feedback can only be submitted for completed appointments');
  if (patientPhone && appt.patientPhone !== String(patientPhone)) throw new Error('This feedback request is not for you');
  const existing = await prisma.feedback.findUnique({ where: { appointmentId } });
  if (existing) throw new Error('Feedback already submitted');
  return prisma.feedback.create({ data: { appointmentId, rating, comment: comment || null } });
}

async function markFeedbackSent(appointmentId) {
  try { await prisma.appointment.update({ where: { id: appointmentId }, data: { feedbackSent: true } }); }
  catch (err) { logger.error({ err: err.message, appointmentId }, 'Failed to mark feedbackSent'); }
}

module.exports = { submitFeedback, markFeedbackSent };
