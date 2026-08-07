const { AppointmentError } = require('../utils/errors');
const logger = require('../utils/logger');
// src/bot/handler.js
// Routes all incoming WhatsApp messages to the correct flow.
//
// WhatsApp-specific notes:
//   - WhatsApp has no parse_mode. Use *bold* and _italic_ natively.
//   - WhatsApp doesn't support Markdown links [text](url). Send URLs as plain text.
//   - Inline keyboards with ≤3 buttons become WhatsApp "button" messages.
//   - Inline keyboards with >3 buttons become WhatsApp "list" messages.
//   - The send() helper below inspects options.reply_markup and routes
//     to bot.sendInlineKeyboard() automatically — handlers/flows can keep
//     using the Telegram-style reply_markup shape without knowing the difference.

const { getSession, setSession, clearSession } = require('./session');
const { handlePatientFlow } = require('../flows/patient');
const { handleAdminFlow } = require('../flows/admin');
const { cancelBookingByQueueNumber, rescheduleBookingByToken, getPatientHistory } = require('../services/bookingService');
const { validateDate } = require('../utils/validators');
const { getMessage } = require('../utils/messages');

/**
 * Shared send helper for both handleMessage and handleCallbackQuery.
 *
 * Routes options.reply_markup.inline_keyboard to bot.sendInlineKeyboard()
 * (which uses WhatsApp "button" type for ≤3 buttons and "list" type for >3).
 * If no reply_markup is present, falls back to plain bot.sendMessage().
 *
 * Bug fix (v11 / Bug 9): after sending an interactive message, ALSO send a
 * plain-text fallback telling the user what to type if buttons don't render
 * on their device. This handles older WhatsApp clients that don't support
 * interactive buttons. The fallback is auto-derived from the callback_data
 * values in the keyboard.
 *
 * Both calls catch errors so a failed WhatsApp API send doesn't crash the
 * webhook handler (Meta requires a 200 response regardless).
 */
function makeSend(bot, chatId, errorLabel) {
  return async (reply, options = {}) => {
    try {
      const keyboard = options.reply_markup?.inline_keyboard;
      if (keyboard && Array.isArray(keyboard) && keyboard.length > 0) {
        await bot.sendInlineKeyboard(chatId, reply, keyboard, options);

        // Build a plain-text fallback listing the button labels + their
        // callback_data shortcuts so users on older WhatsApp clients can
        // still interact by typing the command.
        const allButtons = keyboard.flat();
        if (allButtons.length > 0 && allButtons.length <= 6) {
          // Only send fallback for small keyboards (main menu, language picker).
          // Skip for doctor lists / date pickers where the labels are too long.
          const lines = allButtons.map((b) => {
            const cb = String(b.callback_data || '');
            // Map common callback_data values to text commands users can type
            let cmd = '';
            if (cb === 'menu_book') cmd = 'book';
            else if (cb === 'menu_status') cmd = 'status';
            else if (cb === 'menu_cancel') cmd = 'cancel';
            else if (cb === 'menu_admin' || cb === 'menu_login') cmd = 'login';
            else if (cb === 'menu_register') cmd = 'register';
            else if (cb === 'change_lang') cmd = 'lang';
            else if (cb.startsWith('lang_')) cmd = cb.replace('lang_', '');
            if (cmd) {
              return `• ${b.text} → type "${cmd}"`;
            }
            return null;
          }).filter(Boolean);

          if (lines.length > 0) {
            const fallback = '\n\n_কমান্ড টাইপ করেও করতে পারেন:_\n' + lines.join('\n');
            // Send as a separate plain-text message (no buttons)
            await bot.sendMessage(chatId, fallback).catch(() => {});
          }
        }
        return;
      }
      return await bot.sendMessage(chatId, reply, options);
    } catch (err) {
      logger.error({ chatId, err: err.message }, errorLabel);
    }
  };
}

/**
 * Build the language picker reply (used in multiple places).
 */
function buildLanguagePicker() {
  return {
    text: getMessage('en', 'CHOOSE_LANG'),
    options: {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇮🇳 বাংলা', callback_data: 'lang_bn' },
            { text: '🇬🇧 English', callback_data: 'lang_en' },
            { text: '🇮🇳 हिन्दी', callback_data: 'lang_hi' }
          ]
        ]
      }
    }
  };
}

/**
 * Build the main menu reply (used in multiple places).
 */
function buildMainMenu(lang) {
  return {
    text: getMessage(lang, 'WELCOME') + '\n\n' + getMessage(lang, 'MAIN_MENU'),
    options: {
      reply_markup: {
        inline_keyboard: [
          [{ text: getMessage(lang, 'BTN_BOOK'), callback_data: 'menu_book' }],
          [{ text: getMessage(lang, 'BTN_STATUS'), callback_data: 'menu_status' }],
          [{ text: getMessage(lang, 'BTN_CANCEL'), callback_data: 'menu_cancel' }],
          [{ text: getMessage(lang, 'BTN_ADMIN'), callback_data: 'menu_admin' }],
          [{ text: getMessage(lang, 'BTN_REGISTER'), callback_data: 'menu_register' }],
          [{ text: '🔑 ' + (lang === 'en' ? 'Forgot Password' : lang === 'hi' ? 'पासवर्ड भूल गए?' : 'পাসওয়ার্ড ভুলে গেছেন?'), callback_data: 'menu_forgot' }],
          [{ text: '🌐 ' + (lang === 'en' ? 'Change Language' : lang === 'hi' ? 'भाषा बदलें' : 'ভাষা পরিবর্তন'), callback_data: 'change_lang' }]
        ]
      }
    }
  };
}


/**
 * Main message handler — called for every incoming WhatsApp message.
 *
 * @param {Object} bot - bot instance from createBot()
 * @param {Object} msg - normalized message: { chat: { id }, text }
 */
async function handleMessage(bot, msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();
  const session = await getSession(chatId);
  const lang = session.lang || 'bn';

  const send = makeSend(bot, chatId, '[handler] Failed to send message');

  try {
    // ── Commands ──────────────────────────────────────────────
    const lowerText = text.toLowerCase();

    // START / ONBOARDING
    if (lowerText === '/start' || lowerText === 'hi' || lowerText === 'hello' || lowerText === 'হ্যালো') {
      if (session && session.lang) {
        await setSession(chatId, { step: 'MAIN_MENU' });
        const menu = buildMainMenu(session.lang);
        return send(menu.text, menu.options);
      }

      await clearSession(chatId);
      await setSession(chatId, { step: 'AWAITING_LANG' });
      const picker = buildLanguagePicker();
      return send(picker.text, picker.options);
    }

    if (text === '/book' || text === '/search') {
        const { showSearchModePicker } = require('../flows/patient');
        const replyObj = await showSearchModePicker(chatId, lang);
        return send(replyObj.text, replyObj.options);
    }

    // /rebook — show patient's previous doctors for quick re-booking (Strategy v2)
    if (text === '/rebook') {
      try {
        const prisma = require('../database/prisma');
        // Find distinct doctors this patient has booked before
        const pastAppts = await prisma.appointment.findMany({
          where: { patientPhone: String(chatId) },
          select: { doctorId: true, scheduleId: true },
          distinct: ['doctorId'],
          orderBy: { createdAt: 'desc' },
          take: 5,
        });
        if (pastAppts.length === 0) {
          const msg = lang === 'en'
            ? '📋 You have no previous bookings.\n\nUse /book to find a doctor.'
            : '📋 আপনার কোনো পূর্ববর্তী বুকিং নেই।\n\nডাক্তার খুঁজতে /book ব্যবহার করুন।';
          return send(msg);
        }
        const doctorIds = pastAppts.map(a => a.doctorId);
        const doctors = await prisma.doctor.findMany({
          where: { id: { in: doctorIds }, isActive: true },
          include: { schedules: true, ownerAdmin: true },
        });
        if (doctors.length === 0) {
          return send(getMessage(lang, 'SEARCH_NO_RESULTS'));
        }
        const { buildTrustSignal, toLocalNumber } = require('../utils/bengali');
        const list = doctors.map((d, i) => {
          const trust = buildTrustSignal(d, lang);
          const feeStr = d.fee > 0 ? `\n   💰 ₹${toLocalNumber(d.fee, lang)}` : '';
          return `${i + 1}. ${d.fullName}\n   ${trust}${feeStr}`;
        }).join('\n\n');
        const header = lang === 'en'
          ? `📋 *Your Previous Doctors*\n\nTap a doctor to book again:\n\n${list}`
          : `📋 *আপনার পূর্ববর্তী ডাক্তারগণ*\n\nআবার বুক করতে একজন ডাক্তার নির্বাচন করুন:\n\n${list}`;
        const keyboard = doctors.map((d, i) => [{
          text: `${i + 1}. ${d.fullName}`,
          callback_data: `rebook_${i}`,
        }]);
        keyboard.push([{ text: getMessage(lang, 'BTN_BACK'), callback_data: 'menu_book' }]);
        // Store the doctors in session for the callback to use
        await setSession(chatId, {
          step: 'AWAITING_DOCTOR_SELECTION',
          schedules: doctors.map(d => ({ id: d.schedules[0]?.id, doctor: d, dayOfWeek: d.schedules[0]?.dayOfWeek, startTime: d.schedules[0]?.startTime, endTime: d.schedules[0]?.endTime, clinicName: d.schedules[0]?.clinicName })),
        });
        return send(header, { reply_markup: { inline_keyboard: keyboard } });
      } catch (err) {
        logger.error({ chatId, err: err.message }, 'Failed to fetch rebook doctors');
        return send(getMessage(lang, 'ERROR'));
      }
    }

    if (text === '/admin' || text === '/login') {
      await setSession(chatId, { step: 'ADMIN_START' });
      const replyObj = await handleAdminFlow(bot, chatId, '/login', null, false, null, lang);
      return typeof replyObj === 'string' ? send(replyObj) : send(replyObj.text, replyObj.options);
    }

    // /forgot — password reset flow (Feature 2)
    if (text === '/forgot' || text === '/reset') {
      await setSession(chatId, { step: 'FORGOT_PHONE' });
      return send(getMessage(lang, 'FORGOT_ASK_PHONE'));
    }

    // /register — new doctor onboarding (Phase 1 reform)
    if (text === '/register') {
      await setSession(chatId, { step: 'REGISTER_NAME' });
      return send(getMessage(lang, 'REGISTER_ASK_NAME'));
    }

    // /link <phone> — compounder links their WhatsApp number to their phone-based account
    if (text.startsWith('/link')) {
      const { validatePhone } = require('../utils/validators');
      const parts = text.split(/\s+/);
      if (parts.length < 2) {
        return send(
          lang === 'en'
            ? '🔗 To link your account, send: /link <your-phone>\n\nExample: /link +919876543210'
            : lang === 'hi'
            ? '🔗 अपना खाता लिंक करने के लिए भेजें: /link <your-phone>\n\nउदाहरण: /link +919876543210'
            : '🔗 আপনার অ্যাকাউন্ট লিঙ্ক করতে পাঠান: /link <your-phone>\n\nযেমন: /link +919876543210'
        );
      }
      const phone = validatePhone(parts[1]);
      if (!phone) {
        return send(getMessage(lang, 'LINK_INVALID_PHONE'));
      }
      const prisma = require('../database/prisma');
      const compounder = await prisma.adminUser.findUnique({
        where: { phone },
        include: { delegatedDoctor: { include: { ownerAdmin: true } } },
      });
      if (!compounder || compounder.role !== 'COMPOUNDER') {
        return send(getMessage(lang, 'LINK_NO_COMPOUNDER'));
      }
      if (compounder.whatsappNumber) {
        return send(getMessage(lang, 'LINK_ALREADY_LINKED'));
      }
      // Link the whatsappNumber
      await prisma.adminUser.update({
        where: { id: compounder.id },
        data: { whatsappNumber: chatId },
      });
      const doctorName = compounder.delegatedDoctor?.ownerAdmin?.name || 'your doctor';
      // Feature 4: If compounder has no password, ask them to set one
      if (!compounder.passwordHash) {
        await setSession(chatId, { step: 'COMPOUNDER_SET_PASSWORD', compounderId: compounder.id });
        return send(getMessage(lang, 'LINK_SUCCESS_SET_PASSWORD', doctorName));
      }
      // Already has password — just confirm
      return send(getMessage(lang, 'LINK_SUCCESS', doctorName));
    }

    // /invite <phone> — verified doctor invites a compounder
    if (text === '/invite' || text.startsWith('/invite ')) {
      // Look up the current user — must be a verified doctor
      const prisma = require('../database/prisma');
      const adminUser = await prisma.adminUser.findFirst({
        where: {
          OR: [
            { whatsappNumber: chatId },
            { phone: chatId },
          ],
        },
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

        // IMP-V4-008: add inline Cancel buttons for upcoming Confirmed
        // appointments so patients don't have to type /cancel <token>.
        const today = new Date().toISOString().split('T')[0];
        const upcoming = history.filter(a => a.status === 'Confirmed' && a.appointmentDate >= today);
        if (upcoming.length > 0) {
          const cancelLabel = lang === 'en' ? '❌ Cancel' : lang === 'hi' ? '❌ रद्द करें' : '❌ বাতিল করুন';
          // WhatsApp caps at 10 rows per list section — limit to the next
          // 9 upcoming appointments so we don't exceed the limit.
          const cancelKeyboard = upcoming.slice(0, 9).map(a => [{
            text: `${cancelLabel} #${a.queueNumber} · ${a.appointmentDate}`,
            callback_data: `cancel_appt_${a.id}`,
          }]);
          return send(header, { reply_markup: { inline_keyboard: cancelKeyboard } });
        }
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
           // V3-007 fix: the service now returns the NEW queue number
           // (the old code returned `true` and showed the patient their
           // OLD token, but the DB actually gave them a new one on the
           // new date). Show the patient their correct new token.
           const result = await rescheduleBookingByToken(token, chatId, newDate);
           const newToken = result && typeof result === 'object' && result.newQueueNumber
             ? result.newQueueNumber
             : token;
           const msg = lang === 'en'
             ? `✅ Rescheduled to ${newDate}. Your NEW token: #${newToken}`
             : lang === 'hi'
             ? `✅ री-शेड्यूल हो गया (${newDate})। आपका नया टोकन: #${newToken}`
             : `✅ রিশেডিউল হয়েছে (${newDate})। আপনার নতুন টোকেন: #${newToken}`;
           return send(msg);
        } else {
           return send('❌ Invalid format: /reschedule <token> <YYYY-MM-DD>');
        }
      } else {
        return send('❌ Invalid format: /reschedule <token> <YYYY-MM-DD>');
      }
    }

    // ── Text-based language selection (WhatsApp fallback) ────────────
    // WhatsApp interactive buttons may not render on all devices or older
    // WhatsApp versions. Accept text input as a fallback so users can type
    // "English", "বাংলা", "hindi", "bn", "en", "hi", etc. to select language.
    if (session.step === 'AWAITING_LANG') {
      const lowerText = text.toLowerCase().trim();
      let selectedLang = null;
      if (['bn', 'bangla', 'বাংলা', 'bengali', 'বাংলা'].includes(lowerText)) selectedLang = 'bn';
      else if (['en', 'english', 'ইংরেজি', 'eng'].includes(lowerText)) selectedLang = 'en';
      else if (['hi', 'hindi', 'हिन्दी', 'হিন্দি'].includes(lowerText)) selectedLang = 'hi';

      if (selectedLang) {
        await setSession(chatId, { lang: selectedLang, step: 'MAIN_MENU' });
        const menu = buildMainMenu(selectedLang);
        // Confirm language selection then show the main menu in one message
        const confirmation =
          selectedLang === 'bn' ? '✅ বাংলা নির্বাচিত।\n\n' :
          selectedLang === 'hi' ? '✅ हिन्दी चुनी गई।\n\n' :
          '✅ English selected.\n\n';
        return send(confirmation + menu.text, menu.options);
      }
      // Text didn't match a language — re-show the picker with a hint
      const hint =
        lang === 'bn' ? '⚠️ বুঝতে পারিনি। ভাষা নির্বাচন করুন:\n\n' :
        lang === 'hi' ? '⚠️ समझ नहीं आया। भाषा चुनें:\n\n' :
        '⚠️ Did not understand. Please select a language:\n\n';
      const picker = buildLanguagePicker();
      return send(hint + picker.text, picker.options);
    }

    // ── Flow routing ──────────────────────────────────────────
    let replyObj;

    if (session.step.startsWith('ADMIN') || session.step.startsWith('LOGIN') || session.step.startsWith('REGISTER') || session.step.startsWith('INVITE') || session.step.startsWith('COMPOUNDER') || session.step.startsWith('FORGOT')) {
      // /back works in any of these flows
      const lowerText = text.toLowerCase().trim();
      const cmd = (lowerText === '/back' || lowerText === 'back' || lowerText === '↩️') ? '/back' : text;
      replyObj = await handleAdminFlow(bot, chatId, cmd, session.currentScheduleId || '', false, null, lang);
    } else if (session.step !== 'IDLE' && session.step !== 'AWAITING_LANG') {
      replyObj = await handlePatientFlow(chatId, text, false, null, lang);
    } else if (session.lang) {
      // User has a language set but is in IDLE/AWAITING_LANG — show main menu
      replyObj = buildMainMenu(session.lang);
    } else {
      // No language set and not a command — show language picker (fallback)
      await setSession(chatId, { step: 'AWAITING_LANG' });
      replyObj = buildLanguagePicker();
    }

    if (typeof replyObj === 'string') {
        return send(replyObj);
    } else if (replyObj) {
        return send(replyObj.text, replyObj.options);
    }

    // ── Helpful fallback for unrecognized input ────────────────────
    // If we got here, the user sent text that didn't match any command
    // and no flow produced a reply. Show a helpful menu instead of leaving
    // them with no response.
    const helpLang = session.lang || 'bn';
    const helpText =
      helpLang === 'en'
        ? '🤔 I did not understand that. What would you like to do?'
        : helpLang === 'hi'
        ? '🤔 समझ नहीं आया। आप क्या करना चाहते हैं?'
        : '🤔 বুঝতে পারিনি। আপনি কী করতে চান?';
    return send(helpText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: getMessage(helpLang, 'BTN_BOOK'), callback_data: 'menu_book' }],
          [{ text: getMessage(helpLang, 'BTN_STATUS'), callback_data: 'menu_status' }],
          [{ text: '🌐 ' + (helpLang === 'en' ? 'Change Language' : helpLang === 'hi' ? 'भाषा बदलें' : 'ভাষা পরিবর্তন'), callback_data: 'change_lang' }],
        ]
      }
    });
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

  const send = makeSend(bot, chatId, '[handler] Failed to send callback message');

  try {
    // 1. Handle Language Selection
    if (data === 'change_lang') {
      await setSession(chatId, { step: 'AWAITING_LANG' });
      const picker = buildLanguagePicker();
      return send(picker.text, picker.options);
    }

    if (data.startsWith('lang_')) {
      const lang = data.split('_')[1];
      await setSession(chatId, { lang, step: 'MAIN_MENU' });
      const menu = buildMainMenu(lang);
      return send(menu.text, menu.options);
    }

    const lang = session.lang || 'bn';

    // 2. Handle Main Menu Clicks
    if (data === 'menu_book') {
      const { showSearchModePicker } = require('../flows/patient');
      const replyObj = await showSearchModePicker(chatId, lang);
      return send(replyObj.text, replyObj.options);
    }

    // IMP-V4-008: handle inline cancel buttons from /history.
    // Format: cancel_appt_<appointmentId>
    if (data.startsWith('cancel_appt_')) {
      const appointmentId = data.replace('cancel_appt_', '');
      try {
        const prisma = require('../database/prisma');
        const appt = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          select: { id: true, patientPhone: true, queueNumber: true, status: true, appointmentDate: true },
        });
        if (!appt || appt.patientPhone !== String(chatId)) {
          return send(lang === 'en' ? '❌ Appointment not found.' : '❌ অ্যাপয়েন্টমেন্ট পাওয়া যায়নি।');
        }
        if (appt.status !== 'Confirmed' && appt.status !== 'Pending') {
          return send(lang === 'en'
            ? `❌ This appointment is already ${appt.status}.`
            : `❌ এই অ্যাপয়েন্টমেন্ট ইতিমধ্যে ${appt.status}।`);
        }
        await prisma.appointment.update({
          where: { id: appointmentId },
          data: { status: 'Cancelled' },
        });
        return send(getMessage(lang, 'BOOKING_CANCELLED', appt.queueNumber));
      } catch (err) {
        logger.error({ chatId, err: err.message }, 'Failed to cancel appointment via inline button');
        return send(getMessage(lang, 'ERROR'));
      }
    }

    if (data === 'menu_status') {
      return send(getMessage(lang, 'STATUS_MSG'));
    }

    if (data === 'menu_cancel') {
      return send(getMessage(lang, 'CANCEL_PROMPT'));
    }

    if (data === 'menu_admin') {
      await setSession(chatId, { step: 'ADMIN_START' });
      // /admin now triggers the phone+password login flow
      const replyObj = await handleAdminFlow(bot, chatId, '/login', null, false, null, lang);
      return typeof replyObj === 'string' ? send(replyObj) : send(replyObj.text, replyObj.options);
    }

    if (data === 'menu_register') {
      await setSession(chatId, { step: 'REGISTER_NAME' });
      return send(getMessage(lang, 'REGISTER_ASK_NAME'));
    }

    // Forgot Password — starts the /forgot password reset flow
    if (data === 'menu_forgot') {
      await setSession(chatId, { step: 'FORGOT_PHONE' });
      return send(getMessage(lang, 'FORGOT_ASK_PHONE'));
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
      replyObj = await handleAdminFlow(bot, chatId, '', session.currentScheduleId || '', true, data, lang);
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
