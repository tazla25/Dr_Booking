// src/flows/patient.js
// Handles the full patient booking conversation flow.
// Called by handler.js when session step is in patient flow states.
const { getDoctorsByPin } = require('../services/doctorService');
const { createBooking } = require('../services/bookingService');
const { getSession, setSession, clearSession } = require('../bot/session');
const { validatePinCode, validateDate, validateName } = require('../utils/validators');
const { getMessage } = require('../utils/messages');

/**
 * Handle a patient message based on current session step.
 *
 * @param {string} chatId
 * @param {string} text - raw message text from user
 * @param {boolean} isCallback - whether this is from a callback query
 * @param {string} callbackData - the callback data string
 * @param {string} lang - the user's language
 * @returns {Promise<string|Object>} reply message or object with options
 */
async function handlePatientFlow(chatId, text, isCallback = false, callbackData = null, lang = 'bn') {
  const session = await getSession(chatId);

  // Helper to generate Back Button
  const getBackButton = (callback_data) => {
    return [[{ text: getMessage(lang, 'BTN_BACK'), callback_data }]];
  };

  // Step 1: Waiting for PIN code
  if (session.step === 'AWAITING_PIN') {
    if (isCallback && callbackData === 'back_main') {
        await setSession(chatId, { step: 'MAIN_MENU' });
        return {
            text: getMessage(lang, 'MAIN_MENU'),
            options: {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: getMessage(lang, 'BTN_BOOK'), callback_data: 'menu_book' }],
                    [{ text: getMessage(lang, 'BTN_STATUS'), callback_data: 'menu_status' }],
                    [{ text: getMessage(lang, 'BTN_CANCEL'), callback_data: 'menu_cancel' }]
                  ]
                }
            }
        };
    }

    // Must be text input for PIN
    if (isCallback) return null;

    const pin = validatePinCode(text);
    if (pin === null) {
      return getMessage(lang, 'INVALID_PIN_FORMAT');
    }

    const schedules = await getDoctorsByPin(pin);
    if (!schedules.length) {
      return {
          text: getMessage(lang, 'NO_DOCTORS'),
          options: {
              reply_markup: {
                  inline_keyboard: getBackButton('back_main')
              }
          }
      };
    }

    await setSession(chatId, {
      step: 'AWAITING_DOCTOR_SELECTION',
      pinCode: pin,
      schedules,
    });

    const inline_keyboard = schedules.map((s, idx) => [
        { text: `${idx + 1}. ${s.doctor.fullName}`, callback_data: `doc_${idx}` }
    ]);
    inline_keyboard.push(...getBackButton('back_pin'));

    return {
        text: getMessage(lang, 'SELECT_DOCTOR', schedules),
        options: {
            reply_markup: { inline_keyboard }
        }
    };
  }

  // Step 2: Waiting for doctor selection (inline buttons)
  if (session.step === 'AWAITING_DOCTOR_SELECTION') {
    if (isCallback && callbackData === 'back_pin') {
        await setSession(chatId, { step: 'AWAITING_PIN' });
        return {
            text: getMessage(lang, 'ASK_PIN'),
            options: {
                reply_markup: {
                    inline_keyboard: getBackButton('back_main')
                }
            }
        };
    }

    let idx = -1;
    if (isCallback && callbackData.startsWith('doc_')) {
        idx = parseInt(callbackData.split('_')[1], 10);
    } else if (!isCallback) {
        idx = parseInt(text.trim(), 10) - 1;
    }

    if (isNaN(idx) || idx < 0 || idx >= session.schedules.length) {
      return getMessage(lang, 'INVALID_SELECTION');
    }

    const selected = session.schedules[idx];
    await setSession(chatId, { step: 'AWAITING_DATE', selectedSchedule: selected });

    // Generate dates (14 days, filter by dayOfWeek, offer first 3)
    const nextDays = [];
    const dayNameMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDay = selected.dayOfWeek;
    for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        if (dayNameMap[d.getDay()] === targetDay) {
            nextDays.push(d.toISOString().split('T')[0]);
        }
        if (nextDays.length === 3) break;
    }

    const date_keyboard = nextDays.map(d => [
        { text: d, callback_data: `date_${d}` }
    ]);
    date_keyboard.push(...getBackButton('back_doc'));

    return {
        text: getMessage(lang, 'ASK_DATE'),
        options: {
            reply_markup: { inline_keyboard: date_keyboard }
        }
    };
  }

  // Step 3: Waiting for appointment date
  if (session.step === 'AWAITING_DATE') {
    if (isCallback && callbackData === 'back_doc') {
        await setSession(chatId, { step: 'AWAITING_DOCTOR_SELECTION' });
        const inline_keyboard = session.schedules.map((s, idx) => [
            { text: `${idx + 1}. ${s.doctor.fullName}`, callback_data: `doc_${idx}` }
        ]);
        inline_keyboard.push(...getBackButton('back_pin'));

        return {
            text: getMessage(lang, 'SELECT_DOCTOR', session.schedules),
            options: {
                reply_markup: { inline_keyboard }
            }
        };
    }

    let dateInput = text;
    if (isCallback && callbackData.startsWith('date_')) {
        dateInput = callbackData.split('_')[1];
    }

    const validDate = validateDate(dateInput);
    if (!validDate) {
      return getMessage(lang, 'INVALID_DATE');
    }

    await setSession(chatId, { step: 'AWAITING_NAME', appointmentDate: validDate });
    return {
        text: getMessage(lang, 'ASK_NAME'),
        options: {
            reply_markup: { inline_keyboard: getBackButton('back_date') }
        }
    };
  }

  // Step 4: Waiting for patient name — create booking
  if (session.step === 'AWAITING_NAME') {
    if (isCallback && callbackData === 'back_date') {
        await setSession(chatId, { step: 'AWAITING_DATE' });
        
        const nextDays = [];
        const dayNameMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const targetDay = session.selectedSchedule.dayOfWeek;
        for (let i = 0; i < 14; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            if (dayNameMap[d.getDay()] === targetDay) {
                nextDays.push(d.toISOString().split('T')[0]);
            }
            if (nextDays.length === 3) break;
        }

        const date_keyboard = nextDays.map(d => [
            { text: d, callback_data: `date_${d}` }
        ]);
        date_keyboard.push(...getBackButton('back_doc'));

        return {
            text: getMessage(lang, 'ASK_DATE'),
            options: {
                reply_markup: { inline_keyboard: date_keyboard }
            }
        };
    }

    if (isCallback) return null; // Name must be typed

    const name = validateName(text);
    if (!name) {
      return getMessage(lang, 'INVALID_NAME');
    }

    const booking = await createBooking({
      patientName: name,
      patientPhone: String(chatId),
      scheduleId: session.selectedSchedule.id,
      appointmentDate: session.appointmentDate,
    });

    await clearSession(chatId);
    return getMessage(
      lang,
      'BOOKING_CONFIRMED',
      booking.patientName,
      booking.queueNumber,
      booking.appointmentDate,
      session.selectedSchedule.id
    );
  }

  return getMessage(lang, 'ERROR');
}

module.exports = { handlePatientFlow };
