const { AppointmentError } = require('../utils/errors');
const logger = require('../utils/logger');
// src/bot/handler.js
// Routes all incoming Telegram messages to the correct flow.

const { getSession, setSession, clearSession } = require('./session');
const { handlePatientFlow } = require('../flows/patient');
const { handleAdminFlow } = require('../flows/admin');
const { cancelBookingByToken, rescheduleBookingByToken } = require('../services/bookingService');
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
    return bot.sendMessage(chatId, reply, opts);
  };

  try {
    // ── Commands ──────────────────────────────────────────────
    const lowerText = text.toLowerCase();

    // START / ONBOARDING
    if (lowerText === '/start' || lowerText === 'hi' || lowerText === 'hello' || lowerText === 'হ্যালো') {
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

    if (text === '/book') {
        await setSession(chatId, { step: 'AWAITING_PIN' });
        return send(getMessage(lang, 'ASK_PIN'));
    }

    if (text === '/admin') {
      await setSession(chatId, { step: 'ADMIN_AWAITING_PIN' });
      return send(getMessage(lang, 'ADMIN_ASK_PIN'));
    }

    if (text === '/queue') {
      return send(getMessage(lang, 'STATUS_MSG'));
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
           await cancelBookingByToken(token, chatId);
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

    if (session.step.startsWith('ADMIN')) {
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
    return bot.sendMessage(chatId, reply, opts);
  };

  try {
    // 1. Handle Language Selection
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
            [{ text: getMessage(lang, 'BTN_ADMIN'), callback_data: 'menu_admin' }]
          ]
        }
      });
    }

    const lang = session.lang || 'bn';

    // 2. Handle Main Menu Clicks
    if (data === 'menu_book') {
      await setSession(chatId, { step: 'AWAITING_PIN' });
      return send(getMessage(lang, 'ASK_PIN'));
    }

    if (data === 'menu_status') {
      return send(getMessage(lang, 'STATUS_MSG'));
    }

    if (data === 'menu_cancel') {
      return send(getMessage(lang, 'CANCEL_PROMPT'));
    }

    if (data === 'menu_admin') {
      await setSession(chatId, { step: 'ADMIN_AWAITING_PIN' });
      return send(getMessage(lang, 'ADMIN_ASK_PIN'));
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
