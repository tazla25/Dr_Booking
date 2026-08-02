const cron = require('node-cron');
const prisma = require('../database/prisma');
const logger = require('../utils/logger');
const { getMessage } = require('../utils/messages');

const { formatInTimeZone } = require('date-fns-tz');

function initReminderJob(bot) {
  // Run every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    logger.info('Running appointment reminder cron job...');

    try {
      const data = await prisma.appointment.findMany({
        where: {
          status: 'Confirmed',
          reminderSent: false
        },
        include: {
          schedule: {
            include: { doctor: true }
          }
        }
      });

      if (!data || data.length === 0) return;

      const now = new Date();

      for (const apt of data) {
        const tz = apt.schedule.doctor?.timezone || 'Asia/Dhaka';
        const todayStr = formatInTimeZone(now, tz, 'yyyy-MM-dd');

        if (apt.appointmentDate !== todayStr) continue;

        const currentHour = parseInt(formatInTimeZone(now, tz, 'HH'), 10);
        const currentMinute = parseInt(formatInTimeZone(now, tz, 'mm'), 10);
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        // Get user's language preference
        let lang = 'bn';
        try {
          const session = await prisma.botSession.findUnique({ where: { chatId: String(apt.patientPhone) } });
          if (session && session.lang) lang = session.lang;
        } catch (e) { /* ignore - default to bn */ }

        const startTimeStr = apt.schedule.startTime; // e.g. '10:00'
        if (!startTimeStr) continue;

        const [startHour, startMin] = startTimeStr.split(':').map(Number);
        const startTimeInMinutes = startHour * 60 + startMin;

        // If appointment is roughly within the next 1 hour (between 0 to 60 mins away)
        const diff = startTimeInMinutes - currentTimeInMinutes;

        if (diff > 0 && diff <= 60) {
          const clinicStr = apt.schedule.clinicName ? ` (${apt.schedule.clinicName})` : '';
          const message = getMessage(lang, 'REMINDER', clinicStr, apt.queueNumber);

          try {
             await bot.sendMessage(apt.patientPhone, message, { parse_mode: 'Markdown' });
             logger.info({ chatId: apt.patientPhone, appointmentId: apt.id }, 'Sent reminder');
             
             await prisma.appointment.update({
               where: { id: apt.id },
               data: { reminderSent: true }
             });
          } catch (sendErr) {
             logger.error({ chatId: apt.patientPhone, err: sendErr.message }, 'Failed to send reminder via Telegram');
          }
        }
      }

    } catch (err) {
      logger.error({ err: err.message }, 'Error in reminder cron job');
    }
  });
}

module.exports = { initReminderJob };
