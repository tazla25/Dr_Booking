const cron = require('node-cron');
const prisma = require('../database/prisma');
const logger = require('../utils/logger');
const { getMessage } = require('../utils/messages');
const { estimateWaitTime } = require('../services/bookingService');

const { formatInTimeZone } = require('date-fns-tz');

function initReminderJob(bot) {
  // Run every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    logger.info('Running appointment reminder cron job...');

    try {
      // Bug 12 fix: only fetch today's appointments (in the doctor's timezone).
      // Previously, the query fetched ALL future appointments with reminderSent=false,
      // which would try to send reminders for next week/month appointments too.
      const todayStr = formatInTimeZone(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');

      const data = await prisma.appointment.findMany({
        where: {
          status: 'Confirmed',
          reminderSent: false,
          appointmentDate: todayStr,  // Bug 12 fix: only today's appointments
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
        const tz = apt.schedule.doctor?.timezone || 'Asia/Kolkata';
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
          const doctorName = apt.schedule.doctor?.fullName || '';

          // Compute queue position + wait time estimate (Task 2.3)
          let waitInfo = null;
          try {
            waitInfo = await estimateWaitTime(apt.scheduleId, apt.appointmentDate, apt.queueNumber);
          } catch (err) {
            logger.warn({ err: err.message, appointmentId: apt.id }, 'Failed to compute wait time');
          }

          // Build the smart reminder message
          let message;
          if (waitInfo) {
            if (waitInfo.isNext) {
              // Patient is next
              message =
                lang === 'en'
                  ? `⏰ *Reminder:*\nYour appointment${clinicStr} starts within 1 hour.\n\nDoctor: ${doctorName}\nToken: *#${apt.queueNumber}*\n\n🎉 *You are next!* Please arrive at the chamber.`
                  : lang === 'hi'
                  ? `⏰ *रिमाइंडर:*\nआपका अपॉइंटमेंट${clinicStr} 1 घंटे में शुरू होगा।\n\nडॉक्टर: ${doctorName}\nটোकেন: *#${apt.queueNumber}*\n\n🎉 *आप अगले हैं!* कृपया चैंबर में पहुंचें।`
                  : `⏰ *রিমাইন্ডার:*\nআপনার অ্যাপয়েন্টমেন্ট${clinicStr} ১ ঘণ্টার মধ্যে শুরু হবে।\n\nডাক্তার: ${doctorName}\nটোকেন: *#${apt.queueNumber}*\n\n🎉 *আপনিই পরবর্তী!* অনুগ্রহ করে চেম্বারে উপস্থিত হোন।`;
            } else {
              // Include patients ahead + wait estimate
              const aheadStr = String(waitInfo.patientsAhead);
              const waitStr = String(waitInfo.waitMinutes);
              message =
                lang === 'en'
                  ? `⏰ *Reminder:*\nYour appointment${clinicStr} starts within 1 hour.\n\nDoctor: ${doctorName}\nToken: *#${apt.queueNumber}*\n\n👥 ${aheadStr} patient(s) ahead of you — estimated wait: ${waitStr} minutes.\n\n[Live status](${process.env.DASHBOARD_URL || ''}/?view=tracker&scheduleId=${apt.scheduleId}&date=${apt.appointmentDate})`
                  : lang === 'hi'
                  ? `⏰ *रिमाइंडर:*\nआपका अपॉइंटमेंट${clinicStr} 1 घंटे में शुरू होगा।\n\nडॉक्टर: ${doctorName}\nটোকেন: *#${apt.queueNumber}*\n\n👥 आपसे पहले ${aheadStr} मरीज हैं — अनुमानित प्रतीक्षा: ${waitStr} मिनट।\n\n[लाइव स्थिति](${process.env.DASHBOARD_URL || ''}/?view=tracker&scheduleId=${apt.scheduleId}&date=${apt.appointmentDate})`
                  : `⏰ *রিমাইন্ডার:*\nআপনার অ্যাপয়েন্টমেন্ট${clinicStr} ১ ঘণ্টার মধ্যে শুরু হবে।\n\nডাক্তার: ${doctorName}\nটোকেন: *#${apt.queueNumber}*\n\n👥 আপনার আগে ${aheadStr} জন — আনুমানিক অপেক্ষা: ${waitStr} মিনিট।\n\n[লাইভ স্ট্যাটাস](${process.env.DASHBOARD_URL || ''}/?view=tracker&scheduleId=${apt.scheduleId}&date=${apt.appointmentDate})`;
            }
          } else {
            // Fallback to the original message if wait time computation failed
            message = getMessage(lang, 'REMINDER', clinicStr, apt.queueNumber);
          }

          try {
             await bot.sendMessage(apt.patientPhone, message);
             logger.info({ chatId: apt.patientPhone, appointmentId: apt.id, patientsAhead: waitInfo?.patientsAhead }, 'Sent smart reminder');

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
