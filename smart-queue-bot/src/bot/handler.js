// src/bot/handler.js
// Routes all incoming Telegram messages to the correct flow.
const { getSession, setSession, clearSession } = require('./session');
const { handlePatientFlow } = require('../flows/patient');
const { handleAdminFlow } = require('../flows/admin');
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
  const session = getSession(chatId);

  const send = (reply) =>
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });

  try {
    // ── Commands ──────────────────────────────────────────────
    if (text === '/start' || text === '/book') {
      setSession(chatId, { step: 'AWAITING_PIN' });
      return send(MESSAGES.ASK_PIN);
    }

    if (text === '/admin') {
      setSession(chatId, { step: 'ADMIN_AWAITING_PIN' });
      return send(MESSAGES.ADMIN_ASK_PIN);
    }

    if (text === '/queue') {
      return send(
        `🔗 লাইভ ট্র্যাকার দেখতে এই লিংকে যান:\n${process.env.PUBLIC_URL}/tracker.html`
      );
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
    console.error(`[handler] Error for chatId=${chatId}:`, err.message);
    return send(MESSAGES.ERROR);
  }
}

module.exports = { handleMessage };
