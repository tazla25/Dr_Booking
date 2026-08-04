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

          // Build the smart reminder message.
          // WhatsApp doesn't support Markdown links [text](url) — send URLs as plain text.
          const trackerUrl = `${process.env.DASHBOARD_URL || ''}/?view=tracker&scheduleId=${apt.scheduleId}&date=${apt.appointmentDate}`;
          let message;
          if (waitInfo) {
            if (waitInfo.isNext) {
              // Patient is next
              message =
                lang === 'en'
                  ? `⏰ *Reminder:*\nYour appointment${clinicStr} starts within 1 hour.\n\nDoctor: ${doctorName}\nToken: *#${apt.queueNumber}*\n\n🎉 *You are next!* Please arrive at the chamber.`
                  : lang === 'hi'
                  ? `⏰ *रिमाइंडर:*\nआपका अपॉइंटमेंट${clinicStr} 1 घंटे में शुरू होगा।\n\nडॉक्टर: ${doctorName}\nটোকেন: *#${apt.queueNumber}*\n\n🎉 *आप अगले हैं!* कृपया चैंबर में पहुंचें।`
                  : `⏰ *রিমাইন্ডার:*\nআপনার অ্যাপয়েন্টমেন্ট${clinicStr} ১ ঘণ্টার মধ্যে শুরু হবে।\n\nডাক্তার: ${doctorName}\nটোকেন: *#${apt.queueNumber}*\n\n🎉 *আপনিই পরবর্তী!* অনুগ্রহ করে চেম্বারে উপস্থিত হোন।`;
            } else {
              // Include patients ahead + wait estimate.
              // WhatsApp doesn't support Markdown links — send the tracker URL as plain text.
              const aheadStr = String(waitInfo.patientsAhead);
              const waitStr = String(waitInfo.waitMinutes);
              message =
                lang === 'en'
                  ? `⏰ *Reminder:*\nYour appointment${clinicStr} starts within 1 hour.\n\nDoctor: ${doctorName}\nToken: *#${apt.queueNumber}*\n\n👥 ${aheadStr} patient(s) ahead of you — estimated wait: ${waitStr} minutes.\n\nLive status:\n${trackerUrl}`
                  : lang === 'hi'
                  ? `⏰ *रिमाइंडर:*\nआपका अपॉइंटमेंट${clinicStr} 1 घंटे में शुरू होगा।\n\nडॉक्टर: ${doctorName}\nটোকেন: *#${apt.queueNumber}*\n\n👥 आपसे पहले ${aheadStr} मरीज हैं — अनुमानित प्रतीक्षा: ${waitStr} मिनट।\n\nलाइव स्थिति:\n${trackerUrl}`
                  : `⏰ *রিমাইন্ডার:*\nআপনার অ্যাপয়েন্টমেন্ট${clinicStr} ১ ঘণ্টার মধ্যে শুরু হবে।\n\nডাক্তার: ${doctorName}\nটোকেন: *#${apt.queueNumber}*\n\n👥 আপনার আগে ${aheadStr} জন — আনুমানিক অপেক্ষা: ${waitStr} মিনিট।\n\nলাইভ স্ট্যাটাস:\n${trackerUrl}`;
            }
          } else {
            // Fallback to the original message if wait time computation failed
            message = getMessage(lang, 'REMINDER', clinicStr, apt.queueNumber);
          }

          try {
            // Try free-text message first (works if within WhatsApp's 24-hour window)
            await bot.sendMessage(apt.patientPhone, message);
            logger.info({ chatId: apt.patientPhone, appointmentId: apt.id, patientsAhead: waitInfo?.patientsAhead }, 'Sent reminder (free text)');

            await prisma.appointment.update({
              where: { id: apt.id },
              data: { reminderSent: true }
            });
          } catch (sendErr) {
            // Feature 3: If free-text fails because 24-hour window expired,
            // fall back to a pre-approved WhatsApp template message.
            // (Requires the `appointment_reminder_1h` template to be approved
            // in Meta Business Manager. See WHATSAPP_TEMPLATES.md.)
            const errMsg = String(sendErr.message || '');
            const isWindowError = errMsg.includes('24-hour') || errMsg.includes('window') || errMsg.includes('Recipient phone number not in allowed list');

            if (isWindowError && bot._platform && typeof bot._platform.sendTemplate === 'function') {
              try {
                await bot._platform.sendTemplate(apt.patientPhone, 'appointment_reminder_1h', 'bn', [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: doctorName || 'Doctor' },
                      { type: 'text', text: String(apt.queueNumber) },
                      { type: 'text', text: trackerUrl },
                    ],
                  },
                ]);
                logger.info({ chatId: apt.patientPhone, appointmentId: apt.id }, 'Sent reminder (template)');
                await prisma.appointment.update({
                  where: { id: apt.id },
                  data: { reminderSent: true }
                });
              } catch (templateErr) {
                logger.error({ chatId: apt.patientPhone, err: templateErr.message, appointmentId: apt.id }, 'Template message also failed');
              }
            } else {
              // Bug 7 fix (v11): was "via Telegram", now correctly says "via WhatsApp"
              logger.error({ chatId: apt.patientPhone, err: errMsg, appointmentId: apt.id }, 'Failed to send reminder via WhatsApp');
            }
          }
        }
      }

    } catch (err) {
      logger.error({ err: err.message }, 'Error in reminder cron job');
    }
  });
}

module.exports = { initReminderJob };
