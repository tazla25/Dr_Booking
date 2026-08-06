// src/flows/patient.js
// Handles the full patient booking conversation flow.
// Called by handler.js when session step is in patient flow states.
//
// Phase 1 reform (Task 1.3): Multi-mode doctor discovery.
//   - AWAITING_SEARCH_MODE   → patient picks PIN / name / specialty+city / specialty+PIN
//   - SEARCH_PIN             → asks for PIN, then shows results
//   - SEARCH_NAME            → asks for name, then shows results
//   - SEARCH_SPECIALTY_CITY  → asks for specialty, then city, then shows results
//   - SEARCH_SPECIALTY_PIN   → asks for specialty, then PIN, then shows results
//   - AWAITING_DOCTOR_SELECTION / AWAITING_DATE / AWAITING_NAME → unchanged
const {
  getDoctorsByPin,
  searchDoctorsByName,
  searchDoctorsBySpecialty,
  searchDoctorsBySpecialtyAndPin,
} = require('../services/doctorService');
const { createBooking } = require('../services/bookingService');
const { isScheduleOpen } = require('../services/scheduleService');
const { getSession, setSession, clearSession } = require('../bot/session');
const {
  validatePinCode,
  validateDate,
  validateName,
  validateSpecialization,
} = require('../utils/validators');
const { getMessage } = require('../utils/messages');

/**
 * Build the inline keyboard for search-mode picker.
 */
function getSearchModeKeyboard(lang) {
  return {
    inline_keyboard: [
      [{ text: getMessage(lang, 'SEARCH_MODE_PIN'), callback_data: 'search_pin' }],
      [{ text: getMessage(lang, 'SEARCH_MODE_NAME'), callback_data: 'search_name' }],
      [{ text: getMessage(lang, 'SEARCH_MODE_SPECIALTY_CITY'), callback_data: 'search_specialty_city' }],
      [{ text: getMessage(lang, 'SEARCH_MODE_SPECIALTY_PIN'), callback_data: 'search_specialty_pin' }],
      [{ text: getMessage(lang, 'BTN_BACK'), callback_data: 'back_main' }],
    ],
  };
}

/**
 * Show the search-mode picker and reset to that step.
 */
async function showSearchModePicker(chatId, lang) {
  await setSession(chatId, { step: 'AWAITING_SEARCH_MODE' });
  return {
    text: getMessage(lang, 'SEARCH_MODE_PROMPT'),
    options: { reply_markup: getSearchModeKeyboard(lang) },
  };
}

/**
 * Render a list of schedules as a doctor-selection keyboard.
 * Used by all search modes.
 */
function renderDoctorList(schedules, lang, backCallbackData) {
  if (!schedules.length) {
    return {
      text: getMessage(lang, 'SEARCH_NO_RESULTS'),
      options: {
        reply_markup: {
          inline_keyboard: [
            [{ text: getMessage(lang, 'BTN_BACK'), callback_data: backCallbackData }],
          ],
        },
      },
    };
  }

  // Strategy v2: build trust signal text for each doctor
  const { buildTrustSignal, toBengaliNumber } = require('../utils/bengali');

  const inlineKeyboard = schedules.map((s, idx) => {
    const clinicStr = s.clinicName ? ` · ${s.clinicName}` : '';
    return [{
      text: `${idx + 1}. ${s.doctor.fullName} (${s.doctor.specialization})${clinicStr}`,
      callback_data: `doc_${idx}`,
    }];
  });
  inlineKeyboard.push([{ text: getMessage(lang, 'BTN_BACK'), callback_data: backCallbackData }]);

  // Build the doctor list text with trust signals
  const listText = schedules.map((s, idx) => {
    const trust = buildTrustSignal(s.doctor, lang);
    const feeStr = s.doctor.fee > 0 ? `\n   💰 ₹${toBengaliNumber(s.doctor.fee)}` : '';
    const clinicStr = s.clinicName ? ` · ${s.clinicName}` : '';
    const isTopPick = s.doctor.isTopPick && idx === 0;
    const topPickStr = isTopPick ? '⭐ সেরা পছন্দ\n' : '';
    return `${topPickStr}${idx + 1}. ${s.doctor.fullName}\n   ${trust}${feeStr}${clinicStr}`;
  }).join('\n\n');

  return {
    text: getMessage(lang, 'SEARCH_RESULTS_FOUND', schedules.length) + '\n\n' + listText,
    options: { reply_markup: { inline_keyboard: inlineKeyboard } },
  };
}

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

  // ── Step 0: Search-mode picker ────────────────────────────────────
  if (session.step === 'AWAITING_SEARCH_MODE') {
    if (isCallback && callbackData === 'back_main') {
      await setSession(chatId, { step: 'MAIN_MENU' });
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
              [{ text: '🌐 Change Language', callback_data: 'change_lang' }],
            ],
          },
        },
      };
    }

    if (isCallback && callbackData === 'search_pin') {
      await setSession(chatId, { step: 'SEARCH_PIN' });
      return {
        text: getMessage(lang, 'SEARCH_ASK_PIN'),
        options: { reply_markup: { inline_keyboard: getBackButton('back_search_mode') } },
      };
    }

    if (isCallback && callbackData === 'search_name') {
      await setSession(chatId, { step: 'SEARCH_NAME' });
      return {
        text: getMessage(lang, 'SEARCH_ASK_NAME'),
        options: { reply_markup: { inline_keyboard: getBackButton('back_search_mode') } },
      };
    }

    if (isCallback && callbackData === 'search_specialty_city') {
      await setSession(chatId, { step: 'SEARCH_SPECIALTY_CITY_ASK_SPEC' });
      return {
        text: getMessage(lang, 'SEARCH_ASK_SPECIALTY'),
        options: { reply_markup: { inline_keyboard: getBackButton('back_search_mode') } },
      };
    }

    if (isCallback && callbackData === 'search_specialty_pin') {
      await setSession(chatId, { step: 'SEARCH_SPECIALTY_PIN_ASK_SPEC' });
      return {
        text: getMessage(lang, 'SEARCH_ASK_SPECIALTY_FOR_PIN'),
        options: { reply_markup: { inline_keyboard: getBackButton('back_search_mode') } },
      };
    }

    // Any text or unrelated callback → re-show picker
    return showSearchModePicker(chatId, lang);
  }

  // ── Back-to-search-mode handling (shared by all search sub-flows) ─
  if (isCallback && callbackData === 'back_search_mode') {
    return showSearchModePicker(chatId, lang);
  }

  // ── SEARCH_PIN: text input of PIN code ────────────────────────────
  if (session.step === 'SEARCH_PIN') {
    if (isCallback) return null;
    const pin = validatePinCode(text);
    if (pin === null) return getMessage(lang, 'SEARCH_INVALID_PIN');

    const schedules = await getDoctorsByPin(pin);
    await setSession(chatId, {
      step: 'AWAITING_DOCTOR_SELECTION',
      pinCode: pin,
      schedules,
      searchMode: 'pin',
    });
    return renderDoctorList(schedules, lang, 'back_search_mode');
  }

  // ── SEARCH_NAME: text input of doctor name ────────────────────────
  if (session.step === 'SEARCH_NAME') {
    if (isCallback) return null;
    const name = validateName(text);
    if (!name) return getMessage(lang, 'SEARCH_INVALID_NAME');

    const schedules = await searchDoctorsByName(name);
    await setSession(chatId, {
      step: 'AWAITING_DOCTOR_SELECTION',
      schedules,
      searchMode: 'name',
      searchName: name,
    });
    return renderDoctorList(schedules, lang, 'back_search_mode');
  }

  // ── SEARCH_SPECIALTY_CITY_ASK_SPEC: text input of specialty ───────
  if (session.step === 'SEARCH_SPECIALTY_CITY_ASK_SPEC') {
    if (isCallback) return null;
    const spec = validateSpecialization(text);
    if (!spec) return getMessage(lang, 'SEARCH_INVALID_SPECIALTY');
    await setSession(chatId, {
      step: 'SEARCH_SPECIALTY_CITY_ASK_CITY',
      searchSpecialty: spec,
    });
    return {
      text: getMessage(lang, 'SEARCH_ASK_CITY'),
      options: { reply_markup: { inline_keyboard: getBackButton('back_search_mode') } },
    };
  }

  // ── SEARCH_SPECIALTY_CITY_ASK_CITY: text input of city ────────────
  if (session.step === 'SEARCH_SPECIALTY_CITY_ASK_CITY') {
    if (isCallback) return null;
    const city = validateName(text); // reuse: min 2 chars
    if (!city) return getMessage(lang, 'SEARCH_INVALID_CITY');

    const schedules = await searchDoctorsBySpecialty(session.searchSpecialty, city);
    await setSession(chatId, {
      step: 'AWAITING_DOCTOR_SELECTION',
      schedules,
      searchMode: 'specialty_city',
      searchSpecialty: session.searchSpecialty,
      searchCity: city,
    });
    return renderDoctorList(schedules, lang, 'back_search_mode');
  }

  // ── SEARCH_SPECIALTY_PIN_ASK_SPEC: text input of specialty ────────
  if (session.step === 'SEARCH_SPECIALTY_PIN_ASK_SPEC') {
    if (isCallback) return null;
    const spec = validateSpecialization(text);
    if (!spec) return getMessage(lang, 'SEARCH_INVALID_SPECIALTY');
    await setSession(chatId, {
      step: 'SEARCH_SPECIALTY_PIN_ASK_PIN',
      searchSpecialty: spec,
    });
    return {
      text: getMessage(lang, 'SEARCH_ASK_PIN'),
      options: { reply_markup: { inline_keyboard: getBackButton('back_search_mode') } },
    };
  }

  // ── SEARCH_SPECIALTY_PIN_ASK_PIN: text input of PIN ───────────────
  if (session.step === 'SEARCH_SPECIALTY_PIN_ASK_PIN') {
    if (isCallback) return null;
    const pin = validatePinCode(text);
    if (pin === null) return getMessage(lang, 'SEARCH_INVALID_PIN');

    const schedules = await searchDoctorsBySpecialtyAndPin(session.searchSpecialty, pin);
    await setSession(chatId, {
      step: 'AWAITING_DOCTOR_SELECTION',
      schedules,
      searchMode: 'specialty_pin',
      searchSpecialty: session.searchSpecialty,
      pinCode: pin,
    });
    return renderDoctorList(schedules, lang, 'back_search_mode');
  }

  // Step 2: Waiting for doctor selection (inline buttons)
  if (session.step === 'AWAITING_DOCTOR_SELECTION') {
    if (isCallback && callbackData === 'back_pin') {
      // Legacy back from old AWAITING_PIN flow — redirect to search-mode picker
      return showSearchModePicker(chatId, lang);
    }

    let idx = -1;
    if (isCallback && callbackData && (callbackData.startsWith('doc_') || callbackData.startsWith('rebook_'))) {
      idx = parseInt(callbackData.split('_')[1], 10);
    } else if (!isCallback) {
      idx = parseInt(text.trim(), 10) - 1;
    }

    if (isNaN(idx) || idx < 0 || !session.schedules || idx >= session.schedules.length) {
      return getMessage(lang, 'INVALID_SELECTION');
    }

    const selected = session.schedules[idx];
    await setSession(chatId, { step: 'AWAITING_DATE', selectedSchedule: selected });

    // Generate dates: walk forward up to 14 days, filter by dayOfWeek AND by
    // schedule override (skip dates where the chamber is marked CLOSED).
    // Offer up to 3 open dates.
    const nextDays = [];
    const dayNameMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDay = selected.dayOfWeek;
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (dayNameMap[d.getDay()] === targetDay) {
        const dateStr = d.toISOString().split('T')[0];
        // Skip closed dates (override type === 'CLOSED')
        const open = await isScheduleOpen(selected.id, dateStr);
        if (open) {
          nextDays.push(dateStr);
        }
      }
      if (nextDays.length === 3) break;
    }

    // If no open dates in the next 14 days, show a friendly message
    if (nextDays.length === 0) {
      return {
        text: getMessage(lang, 'SEARCH_NO_RESULTS') + '\n\n' + getMessage(lang, 'BTN_BACK'),
        options: {
          reply_markup: { inline_keyboard: getBackButton('back_doc') },
        },
      };
    }

    const date_keyboard = nextDays.map((d) => [
      { text: d, callback_data: `date_${d}` },
    ]);
    date_keyboard.push(...getBackButton('back_doc'));

    return {
      text: getMessage(lang, 'ASK_DATE'),
      options: { reply_markup: { inline_keyboard: date_keyboard } },
    };
  }

  // Step 3: Waiting for appointment date
  if (session.step === 'AWAITING_DATE') {
    if (isCallback && callbackData === 'back_doc') {
      await setSession(chatId, { step: 'AWAITING_DOCTOR_SELECTION' });
      return renderDoctorList(session.schedules, lang, 'back_search_mode');
    }

    let dateInput = text;
    if (isCallback && callbackData && callbackData.startsWith('date_')) {
      dateInput = callbackData.split('_')[1];
    }

    const validDate = validateDate(dateInput);
    if (!validDate) {
      return getMessage(lang, 'INVALID_DATE');
    }

    await setSession(chatId, { step: 'AWAITING_NAME', appointmentDate: validDate });
    return {
      text: getMessage(lang, 'ASK_NAME'),
      options: { reply_markup: { inline_keyboard: getBackButton('back_date') } },
    };
  }

  // Step 4: Waiting for patient name — create booking
  if (session.step === 'AWAITING_NAME') {
    if (isCallback && callbackData === 'back_date') {
      await setSession(chatId, { step: 'AWAITING_DATE' });

      // BUG-012 fix: regenerate the date options through isScheduleOpen()
      // so closed/override dates stay hidden when the user navigates back
      // (the forward path already does this; the back path didn't).
      const nextDays = [];
      const dayNameMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const targetDay = session.selectedSchedule.dayOfWeek;
      for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        if (dayNameMap[d.getDay()] === targetDay) {
          const dateStr = d.toISOString().split('T')[0];
          // Skip closed dates (override type === 'CLOSED')
          try {
            const open = await isScheduleOpen(session.selectedSchedule.id, dateStr);
            if (open) nextDays.push(dateStr);
          } catch {
            // If the override check fails, fall back to including the date
            // so the user can still proceed (better than a dead-end).
            nextDays.push(dateStr);
          }
        }
        if (nextDays.length === 3) break;
      }

      // If every upcoming date is closed, show a friendly no-results message
      if (nextDays.length === 0) {
        return {
          text: getMessage(lang, 'SEARCH_NO_RESULTS') + '\n\n' + getMessage(lang, 'BTN_BACK'),
          options: {
            reply_markup: { inline_keyboard: getBackButton('back_doc') },
          },
        };
      }

      const date_keyboard = nextDays.map((d) => [
        { text: d, callback_data: `date_${d}` },
      ]);
      date_keyboard.push(...getBackButton('back_doc'));

      return {
        text: getMessage(lang, 'ASK_DATE'),
        options: { reply_markup: { inline_keyboard: date_keyboard } },
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
    // Send immediate confirmation WITHOUT the queue number or tracking link.
    // The doctor/compounder will confirm availability via the dashboard, at
    // which point the patient receives their token + live tracking link
    // (APPT_CONFIRMED_TRACKER message, sent by the dashboard's confirm endpoint).
    return getMessage(
      lang,
      'BOOKING_RECEIVED',
      booking.patientName,
      booking.appointmentDate
    );
  }

  return getMessage(lang, 'ERROR');
}

module.exports = { handlePatientFlow, showSearchModePicker };
