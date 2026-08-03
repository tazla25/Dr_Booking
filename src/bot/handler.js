const { AppointmentError } = require('../utils/errors');
const logger = require('../utils/logger');
// src/bot/handler.js
// Routes all incoming Telegram messages to the correct flow.

const { getSession, setSession, clearSession } = require('./session');
const { handlePatientFlow } = require('../flows/patient');
const { handleAdminFlow } = require('../flows/admin');
const { cancelBookingByQueueNumber, rescheduleBookingByToken, getPatientHistory } = require('../services/bookingService');
const { validateDate } = require('../utils/validators');
const { getMessage } = require('../utils/messages');


/**
 * Main message handler — called for every incoming Telegram message.
 *
 * @param {TelegramBot} bot
 * @param {Object} msg - Telegram message object
 */
async function handleMessage(bot, msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();
  const session = await getSession(chatId);
  const lang = session.lang || 'bn';

  const send = (reply, options = {}) => {
    const opts = { parse_mode: 'Markdown', ...options };
    return bot.sendMessage(chatId, reply, opts).catch(err => {
        logger.error({ chatId, err: err.message }, '[handler] Failed to send message');
    });
  };

  try {
    // ── Commands ──────────────────────────────────────────────
    const lowerText = text.toLowerCase();

    // START / ONBOARDING
    if (lowerText === '/start' || lowerText === 'hi' || lowerText === 'hello' || lowerText === 'হ্যালো') {
      if (session && session.lang) {
        await setSession(chatId, { step: 'MAIN_MENU' });
        const welcomeText = getMessage(session.lang, 'WELCOME') + '\n\n' + getMessage(session.lang, 'MAIN_MENU');
        return send(welcomeText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: getMessage(session.lang, 'BTN_BOOK'), callback_data: 'menu_book' }],
              [{ text: getMessage(session.lang, 'BTN_STATUS'), callback_data: 'menu_status' }],
              [{ text: getMessage(session.lang, 'BTN_CANCEL'), callback_data: 'menu_cancel' }],
              [{ text: getMessage(session.lang, 'BTN_ADMIN'), callback_data: 'menu_admin' }],
              [{ text: getMessage(session.lang, 'BTN_REGISTER'), callback_data: 'menu_register' }],
              [{ text: '🌐 Change Language', callback_data: 'change_lang' }]
            ]
          }
        });
      }

      await clearSession(chatId);
      await setSession(chatId, { step: 'AWAITING_LANG' });
      return send(getMessage('en', 'CHOOSE_LANG'), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇧🇩 বাংলা', callback_data: 'lang_bn' },
              { text: '🇬🇧 English', callback_data: 'lang_en' },
              { text: '🇮🇳 हिन्दी', callback_data: 'lang_hi' }
            ]
          ]
        }
      });
    }

    if (text === '/book' || text === '/search') {
        const { showSearchModePicker } = require('../flows/patient');
        const replyObj = await showSearchModePicker(chatId, lang);
        return send(replyObj.text, replyObj.options);
    }

    if (text === '/admin') {
      await setSession(chatId, { step: 'ADMIN_START' });
      const replyObj = await handleAdminFlow(chatId, '/admin', null, false, null, lang);
      return typeof replyObj === 'string' ? send(replyObj) : send(replyObj.text, replyObj.options);
    }

    // /register — new doctor onboarding (Phase 1 reform)
    if (text === '/register') {
      await setSession(chatId, { step: 'REGISTER_NAME' });
      return send(getMessage(lang, 'REGISTER_ASK_NAME'));
    }

    // /invite <phone> — verified doctor invites a compounder
    if (text === '/invite' || text.startsWith('/invite ')) {
      // Look up the current user — must be a verified doctor
      const prisma = require('../database/prisma');
      const adminUser = await prisma.adminUser.findUnique({
        where: { telegramChatId: chatId },
        include: { ownedDoctor: true },
      });
      if (!adminUser || adminUser.role !== 'DOCTOR' || adminUser.verificationStatus !== 'VERIFIED') {
        return send(getMessage(lang, 'INVITE_ONLY_DOCTORS'));
      }

      // If phone was supplied inline, validate and process immediately
      const parts = text.split(/\s+/);
      if (parts.length > 1) {
        const { validatePhone } = require('../utils/validators');
        const phone = validatePhone(parts[1]);
        if (!phone) return send(getMessage(lang, 'INVITE_INVALID_PHONE'));
        try {
          const { inviteCompounder } = require('../services/adminService');
          await inviteCompounder({ doctorAdminId: adminUser.id, compounderPhone: phone });
          return send(getMessage(lang, 'INVITE_SUCCESS', phone));
        } catch (err) {
          if (err.code === 'DUPLICATE_PHONE') return send(getMessage(lang, 'INVITE_ALREADY_EXISTS'));
          logger.error({ err: err.message }, 'Compounder invitation failed');
          return send(getMessage(lang, 'ERROR'));
        }
      }

      // Otherwise enter the invite flow (ask for phone)
      await setSession(chatId, { step: 'INVITE_PHONE', inviterDoctorAdminId: adminUser.id });
      return send(getMessage(lang, 'INVITE_PROMPT'));
    }

    if (text === '/queue') {
      return send(getMessage(lang, 'STATUS_MSG'));
    }

    // /history — show patient's last 10 appointments (Task 2.2)
    if (text === '/history') {
      try {
        const history = await getPatientHistory(chatId);
        if (!history.length) {
          const msg =
            lang === 'en'
              ? '📋 You have no appointment history yet.\n\nUse /book to schedule your first appointment.'
              : lang === 'hi'
              ? '📋 आपकी कोई अपॉइंटमेंट हिस्ट्री नहीं है।\n\nअपनी पहली अपॉइंटमेंट बुक करने के लिए /book का उपयोग करें।'
              : '📋 আপনার কোনো অ্যাপয়েন্টমেন্ট ইতিহাস নেই।\n\nপ্রথম অ্যাপয়েন্টমেন্ট বুক করতে /book ব্যবহার করুন।';
          return send(msg);
        }
        const list = history
          .map((a, i) => {
            const statusEmoji =
              a.status === 'Completed' ? '✅' :
              a.status === 'Cancelled' ? '❌' :
              a.status === 'NoShow' ? '⏭️' :
              a.status === 'Pending' ? '⏳' : '📅';
            const clinic = a.schedule?.clinicName ? ` (${a.schedule.clinicName})` : '';
            return `${i + 1}. ${statusEmoji} *${a.doctor?.fullName || 'Doctor'}*${clinic}\n   📅 ${a.appointmentDate} · 🔢 Token #${a.queueNumber} · _${a.status}_`;
          })
          .join('\n\n');
        const header =
          lang === 'en'
            ? `📋 *Your Appointment History*\n\n${list}`
            : lang === 'hi'
            ? `📋 *आपकी अपॉइंटमेंट हिस्ट्री*\n\n${list}`
            : `📋 *আপনার অ্যাপয়েন্টমেন্ট ইতিহাস*\n\n${list}`;
        return send(header);
      } catch (err) {
        logger.error({ chatId, err: err.message }, 'Failed to fetch patient history');
        return send(getMessage(lang, 'ERROR'));
      }
    }

    if (text === '/help') {
      return send(getMessage(lang, 'WELCOME'));
    }

    // /cancel <token> or /cancel
    if (text.startsWith('/cancel') && !session.step.startsWith('ADMIN')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
        const token = parseInt(parts[1], 10);
        if (!isNaN(token)) {
           await cancelBookingByQueueNumber(token, chatId);
           return send(getMessage(lang, 'BOOKING_CANCELLED', token));
        }
      } else {
        await clearSession(chatId);
        return send(getMessage(lang, 'CANCEL_MSG'));
      }
    }

    // /reschedule <token> <new_date>
    if (text.startsWith('/reschedule') && !session.step.startsWith('ADMIN')) {
      const parts = text.split(' ');
      if (parts.length === 3) {
        const token = parseInt(parts[1], 10);
        const newDate = validateDate(parts[2]);
        if (!isNaN(token) && newDate) {
           await rescheduleBookingByToken(token, chatId, newDate);
           return send(`✅ Booking (Token #${token}) rescheduled to ${newDate}.`);
        } else {
           return send('❌ Invalid format: /reschedule <token> <YYYY-MM-DD>');
        }
      } else {
        return send('❌ Invalid format: /reschedule <token> <YYYY-MM-DD>');
      }
    }

    // ── Flow routing ──────────────────────────────────────────
    let replyObj;

    if (session.step.startsWith('ADMIN') || session.step.startsWith('REGISTER') || session.step.startsWith('INVITE')) {
      replyObj = await handleAdminFlow(chatId, text, session.currentScheduleId || '', false, null, lang);
    } else if (session.step !== 'IDLE' && session.step !== 'AWAITING_LANG') {
      replyObj = await handlePatientFlow(chatId, text, false, null, lang);
    } else {
      replyObj = { text: getMessage(lang, 'WELCOME') };
    }

    if (typeof replyObj === 'string') {
        return send(replyObj);
    } else if (replyObj) {
        return send(replyObj.text, replyObj.options);
    }
  } catch (err) {
    if (err.name === 'AppointmentError') {
      logger.error({ chatId, code: err.code, err: err.message }, 'AppointmentError occurred');
      return send(err.userMessage || getMessage(lang, 'ERROR'));
    }
    logger.error({ chatId, err: err.message }, '[handler] Unhandled error');
    return send(getMessage(lang, 'ERROR'));
  }
}

/**
 * Handle callback queries from Inline Keyboards
 */
async function handleCallbackQuery(bot, query) {
  const chatId = String(query.message.chat.id);
  const data = query.data;
  const session = await getSession(chatId);

  // Acknowledge the callback immediately
  bot.answerCallbackQuery(query.id).catch(() => {});

  const send = (reply, options = {}) => {
    const opts = { parse_mode: 'Markdown', ...options };
    return bot.sendMessage(chatId, reply, opts).catch(err => {
        logger.error({ chatId, err: err.message }, '[handler] Failed to send callback message');
    });
  };

  try {
    // 1. Handle Language Selection
    if (data === 'change_lang') {
      await setSession(chatId, { step: 'AWAITING_LANG' });
      return send(getMessage('en', 'CHOOSE_LANG'), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇧🇩 বাংলা', callback_data: 'lang_bn' },
              { text: '🇬🇧 English', callback_data: 'lang_en' },
              { text: '🇮🇳 हिन्दी', callback_data: 'lang_hi' }
            ]
          ]
        }
      });
    }

    if (data.startsWith('lang_')) {
      const lang = data.split('_')[1];
      await setSession(chatId, { lang, step: 'MAIN_MENU' });

      const welcomeText = getMessage(lang, 'WELCOME') + '\n\n' + getMessage(lang, 'MAIN_MENU');

      return send(welcomeText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: getMessage(lang, 'BTN_BOOK'), callback_data: 'menu_book' }],
            [{ text: getMessage(lang, 'BTN_STATUS'), callback_data: 'menu_status' }],
            [{ text: getMessage(lang, 'BTN_CANCEL'), callback_data: 'menu_cancel' }],
            [{ text: getMessage(lang, 'BTN_ADMIN'), callback_data: 'menu_admin' }],
            [{ text: getMessage(lang, 'BTN_REGISTER'), callback_data: 'menu_register' }],
            [{ text: '🌐 Change Language', callback_data: 'change_lang' }]
          ]
        }
      });
    }

    const lang = session.lang || 'bn';

    // 2. Handle Main Menu Clicks
    if (data === 'menu_book') {
      const { showSearchModePicker } = require('../flows/patient');
      const replyObj = await showSearchModePicker(chatId, lang);
      return send(replyObj.text, replyObj.options);
    }

    if (data === 'menu_status') {
      return send(getMessage(lang, 'STATUS_MSG'));
    }

    if (data === 'menu_cancel') {
      return send(getMessage(lang, 'CANCEL_PROMPT'));
    }

    if (data === 'menu_admin') {
      await setSession(chatId, { step: 'ADMIN_START' });
      const replyObj = await handleAdminFlow(chatId, '/admin', null, false, null, lang);
      return typeof replyObj === 'string' ? send(replyObj) : send(replyObj.text, replyObj.options);
    }

    if (data === 'menu_register') {
      await setSession(chatId, { step: 'REGISTER_NAME' });
      return send(getMessage(lang, 'REGISTER_ASK_NAME'));
    }

    // ── Feedback rating callback (Task 2.1) ────────────────────────────
    // Format: fb_<appointmentId>_<rating 1-5>
    if (data.startsWith('fb_')) {
      const parts = data.split('_');
      if (parts.length === 3) {
        const appointmentId = parts[1];
        const rating = parseInt(parts[2], 10);
        if (rating >= 1 && rating <= 5) {
          try {
            const { submitFeedback } = require('../services/feedbackService');
            await submitFeedback({
              appointmentId,
              rating,
              patientPhone: chatId,
            });
            const thankYou =
              lang === 'en'
                ? `🙏 Thank you for your feedback! Your rating: ${rating} star(s).`
                : lang === 'hi'
                ? `🙏 आपकी प्रतिक्रिया के लिए धन्यवाद! आपकी रेटिंग: ${rating} स्टार।`
                : `🙏 আপনার মতামতের জন্য ধন্যবাদ! আপনার রেটিং: ${rating} তারকা।`;
            return send(thankYou);
          } catch (err) {
            // Already submitted, not found, etc.
            return send(`ℹ️ ${err.message || 'Could not submit feedback.'}`);
          }
        }
      }
      return send(getMessage(lang, 'ERROR'));
    }


    // 3. Forward to flows
    let replyObj;
    if (session.step.startsWith('ADMIN')) {
      replyObj = await handleAdminFlow(chatId, '', session.currentScheduleId || '', true, data, lang);
    } else {
      replyObj = await handlePatientFlow(chatId, '', true, data, lang);
    }

    if (typeof replyObj === 'string') {
        return send(replyObj);
    } else if (replyObj) {
        return send(replyObj.text, replyObj.options);
    }

  } catch (err) {
    const lang = session.lang || 'bn';
    if (err.name === 'AppointmentError') {
      logger.error({ chatId, code: err.code, err: err.message }, 'AppointmentError occurred');
      return send(err.userMessage || getMessage(lang, 'ERROR'));
    }
    logger.error({ chatId, err: err.message }, '[handler] Callback query error');
    return send(getMessage(lang, 'ERROR'));
  }
}

module.exports = { handleMessage, handleCallbackQuery };
