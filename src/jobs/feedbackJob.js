// src/jobs/feedbackJob.js
//
// Phase 1 reform (Task 2.1): Send feedback requests to patients 2-6 hours
// after their appointment is marked Completed.
const cron = require('node-cron');
const prisma = require('../database/prisma');
const logger = require('../utils/logger');
const { markFeedbackSent } = require('../services/feedbackService');

function initFeedbackJob(bot) {
  // Run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    logger.info('Running feedback request cron job...');

    try {
      // Find appointments that:
      //   - status = Completed
      //   - feedbackSent = false
      //   - createdAt is between 2 and 24 hours ago (so we don't pester old ones)
      //   - have no Feedback record yet
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const candidates = await prisma.appointment.findMany({
        where: {
          status: 'Completed',
          feedbackSent: false,
          updatedAt: { gte: twentyFourHoursAgo, lte: twoHoursAgo },
          feedback: null,
        },
        include: {
          schedule: { include: { doctor: true } },
        },
        take: 50, // cap per run
      });

      if (candidates.length === 0) return;
      logger.info({ count: candidates.length }, 'Found appointments needing feedback request');

      for (const appt of candidates) {
        // Get user's language preference
        let lang = 'bn';
        try {
          const session = await prisma.botSession.findUnique({
            where: { chatId: String(appt.patientPhone) },
          });
          if (session && session.lang) lang = session.lang;
        } catch {
          // ignore
        }

        // Send the feedback message with inline 1-5 star buttons
        const message = getFeedbackPromptMessage(lang, appt.patientName, appt.schedule.doctor?.fullName);
        const keyboard = {
          inline_keyboard: [
            [
              { text: '⭐ 1', callback_data: `fb_${appt.id}_1` },
              { text: '⭐ 2', callback_data: `fb_${appt.id}_2` },
              { text: '⭐ 3', callback_data: `fb_${appt.id}_3` },
              { text: '⭐ 4', callback_data: `fb_${appt.id}_4` },
              { text: '⭐ 5', callback_data: `fb_${appt.id}_5` },
            ],
          ],
        };

        try {
          await bot.sendMessage(String(appt.patientPhone), message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          });
          await markFeedbackSent(appt.id);
          logger.info({ appointmentId: appt.id }, 'Sent feedback request');
        } catch (err) {
          logger.error(
            { appointmentId: appt.id, err: err.message },
            'Failed to send feedback request'
          );
          // Mark as sent anyway so we don't keep retrying and spamming failed sends
          await markFeedbackSent(appt.id);
        }
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Error in feedback cron job');
    }
  });
}

function getFeedbackPromptMessage(lang, patientName, doctorName) {
  if (lang === 'en') {
    return `👋 Hi ${patientName}!\n\nYou recently visited *${doctorName}*. How was your experience?\n\nPlease rate 1-5 stars below:`;
  }
  if (lang === 'hi') {
    return `👋 नमस्ते ${patientName}!\n\nआपने हाल ही में *${doctorName}* को देखा। आपका अनुभव कैसा था?\n\nकृपया नीचे 1-5 स्टार दें:`;
  }
  // Bengali (default)
  return `👋 হ্যালো ${patientName}!\n\nআপনি সম্প্রতি *${doctorName}* এর কাছে গিয়েছিলেন। আপনার অভিজ্ঞতা কেমন ছিল?\n\nঅনুগ্রহ করে নিচে ১-৫ তারকা দিন:`;
}

module.exports = { initFeedbackJob };
