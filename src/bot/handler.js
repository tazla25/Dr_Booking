const { AppointmentError } = require('../utils/errors');
const logger = require('../utils/logger');
// src/bot/handler.js
// Routes all incoming Telegram messages to the correct flow.

const { getSession, setSession, clearSession } = require('./session');
const { handlePatientFlow } = require('../flows/patient');
const { handleAdminFlow } = require('../flows/admin');
const { cancelBookingByToken, rescheduleBookingByToken } = require('../services/bookingService');
const { validateDate } = require('../utils/validators');
const MESSAGES = require('../utils/messages');


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

  const send = (reply) =>
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });

  try {
    // ── Commands ──────────────────────────────────────────────
    if (text === '/start' || text === '/book') {
      await setSession(chatId, { step: 'AWAITING_PIN' });
      return send(MESSAGES.ASK_PIN);
    }

    if (text === '/admin') {
      await setSession(chatId, { step: 'ADMIN_AWAITING_PIN' });
      return send(MESSAGES.ADMIN_ASK_PIN);
    }

    if (text === '/queue') {
      return send(
        `🔗 লাইভ ট্র্যাকার লিংকটি আপনার বুকিং কনফার্মেশন মেসেজে দেওয়া আছে।\nঅনুগ্রহ করে বুকিং সম্পন্ন হওয়ার মেসেজটি চেক করুন।`
      );
    }

    if (text === '/help') {
      return send(MESSAGES.WELCOME);
    }


    // /cancel <token> or /cancel
    if (text.startsWith('/cancel') && !session.step.startsWith('ADMIN')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
        const token = parseInt(parts[1], 10);
        if (!isNaN(token)) {
           await cancelBookingByToken(token, chatId);
           return send('✅ আপনার বুকিং (টোকেন #' + token + ') সফলভাবে বাতিল করা হয়েছে।');
        }
      } else {
        await clearSession(chatId);
        return send('❌ বর্তমান কার্যক্রম বাতিল হয়েছে। /start দিয়ে আবার শুরু করুন।');
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
           return send('✅ আপনার বুকিং (টোকেন #' + token + ') সফলভাবে ' + newDate + ' তারিখে পরিবর্তন করা হয়েছে।');
        } else {
           return send('❌ সঠিক ফরম্যাটে লিখুন: /reschedule <token> <YYYY-MM-DD>');
        }
      } else {
        return send('❌ সঠিক ফরম্যাটে লিখুন: /reschedule <token> <YYYY-MM-DD>');
      }
    }

    // ── Flow routing ──────────────────────────────────────────

    let reply;

    if (session.step.startsWith('ADMIN')) {
      reply = await handleAdminFlow(
        chatId,
        text,
        session.currentScheduleId || ''
      );
    } else if (session.step !== 'IDLE') {
      reply = await handlePatientFlow(chatId, text);
    } else {
      reply = MESSAGES.WELCOME;
    }

    return send(reply);
  } catch (err) {
    if (err.name === 'AppointmentError') {
      logger.error({ chatId, code: err.code, err: err.message }, 'AppointmentError occurred');
      return send(err.userMessage || MESSAGES.ERROR);
    }
    logger.error({ chatId, err: err.message }, '[handler] Unhandled error');
    return send(MESSAGES.ERROR);
  }
}

module.exports = { handleMessage };
