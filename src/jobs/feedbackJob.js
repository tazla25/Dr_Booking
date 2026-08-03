// src/jobs/feedbackJob.js (Task 2.1)
const cron = require('node-cron');
const prisma = require('../database/prisma');
const logger = require('../utils/logger');
const { markFeedbackSent } = require('../services/feedbackService');

function initFeedbackJob(bot) {
  cron.schedule('*/30 * * * *', async () => {
    logger.info('Running feedback request cron job...');
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const candidates = await prisma.appointment.findMany({
        where: { status: 'Completed', feedbackSent: false, updatedAt: { gte: twentyFourHoursAgo, lte: twoHoursAgo }, feedback: null },
        include: { schedule: { include: { doctor: true } } },
        take: 50,
      });
      if (candidates.length === 0) return;
      logger.info({ count: candidates.length }, 'Found appointments needing feedback request');
      for (const appt of candidates) {
        let lang = 'bn';
        try { const s = await prisma.botSession.findUnique({ where: { chatId: String(appt.patientPhone) } }); if (s && s.lang) lang = s.lang; } catch { /* ignore */ }
        const message = lang === 'en'
          ? `👋 Hi ${appt.patientName}!\n\nYou recently visited *${appt.schedule.doctor?.fullName}*. How was your experience?\n\nPlease rate 1-5 stars below:`
          : lang === 'hi'
          ? `👋 नमस्ते ${appt.patientName}!\n\nआपने हाल ही में *${appt.schedule.doctor?.fullName}* को देखा। आपका अनुभव कैसा था?\n\nकृपया नीचे 1-5 स्टार दें:`
          : `👋 হ্যালো ${appt.patientName}!\n\nআপনি সম্প্রতি *${appt.schedule.doctor?.fullName}* এর কাছে গিয়েছিলেন। আপনার অভিজ্ঞতা কেমন ছিল?\n\nঅনুগ্রহ করে নিচে ১-৫ তারকা দিন:`;
        const keyboard = { inline_keyboard: [[
          { text: '⭐ 1', callback_data: `fb_${appt.id}_1` },
          { text: '⭐ 2', callback_data: `fb_${appt.id}_2` },
          { text: '⭐ 3', callback_data: `fb_${appt.id}_3` },
          { text: '⭐ 4', callback_data: `fb_${appt.id}_4` },
          { text: '⭐ 5', callback_data: `fb_${appt.id}_5` },
        ]] };
        try {
          await bot.sendMessage(String(appt.patientPhone), message, { parse_mode: 'Markdown', reply_markup: keyboard });
          await markFeedbackSent(appt.id);
          logger.info({ appointmentId: appt.id }, 'Sent feedback request');
        } catch (err) {
          logger.error({ appointmentId: appt.id, err: err.message }, 'Failed to send feedback request');
          await markFeedbackSent(appt.id);
        }
      }
    } catch (err) { logger.error({ err: err.message }, 'Error in feedback cron job'); }
  });
}
module.exports = { initFeedbackJob };
