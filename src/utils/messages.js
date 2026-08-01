// src/utils/messages.js
// All bot reply strings - Multi-language support (bn, en, hi).

const translations = {
  bn: {
    WELCOME: '👋 নমস্কার! আমি *Smart Queue Bot*।',
    CHOOSE_LANG: 'দয়া করে আপনার ভাষা নির্বাচন করুন / Please select your language / कृपया अपनी भाषा चुनें:',
    MAIN_MENU: 'আপনি কি করতে চান? নিচের বাটনগুলো থেকে বেছে নিন:',
    ASK_PIN: '📍 আপনার এলাকার *PIN Code* টাইপ করুন (৪-৬ ডিজিট):',
    NO_DOCTORS: '😔 এই PIN কোডে কোনো ডাক্তার পাওয়া যায়নি।\n\nঅন্য PIN কোড দিয়ে চেষ্টা করুন।',
    SELECT_DOCTOR: (schedules) => {
      const list = schedules
        .map(
          (s, i) =>
            `${i + 1}. 🩺 *${s.doctors.full_name}* (${s.doctors.specialization})\n   📅 ${s.day_of_week} | 🕙 ${s.start_time}–${s.end_time}`
        )
        .join('\n\n');
      return `✅ এই এলাকায় পাওয়া ডাক্তারগণ:\n\n${list}\n\nনিচের বাটন থেকে ডাক্তার বেছে নিন:`;
    },
    ASK_DATE: '📅 কোন তারিখে অ্যাপয়েন্টমেন্ট চান?\n\nনিচের তারিখগুলো থেকে বেছে নিন অথবা (YYYY-MM-DD) ফরম্যাটে লিখে দিন:',
    ASK_NAME: '👤 আপনার পুরো নাম লিখুন:',
    BOOKING_CONFIRMED: (name, queueNumber, date, scheduleId) =>
      `✅ *বুকিং সম্পন্ন!*\n\n👤 নাম: ${name}\n📅 তারিখ: ${date}\n🔢 আপনার টোকেন: *${queueNumber}*\n\nলাইভ স্ট্যাটাস দেখতে লিংকে ক্লিক করুন:\n${process.env.PUBLIC_URL || ''}/tracker.html?scheduleId=${scheduleId}&date=${date}`,
    ADMIN_ASK_PIN: '🔒 আপনার সিক্রেট PIN দিন:',
    ADMIN_INVALID_PIN: '❌ ভুল PIN। আবার চেষ্টা করুন।',
    ADMIN_DASHBOARD: (patients) => {
        if (!patients.length) return `📋 আজকে কোনো রোগী নেই।`;
        const list = patients.map((p) => `#${p.queue_number} ${p.patient_name} — _${p.status}_`).join('\n');
        return `📋 *আজকের রোগী তালিকা:*\n\n${list}\n\n➡️ /next — পরবর্তী রোগী সম্পন্ন\n❌ /cancel <token> — বাতিল করুন\n🔄 /refresh — তালিকা রিফ্রেশ`;
    },
    QUEUE_UPDATED: (token) => `✅ Token #${token} — *Completed* হিসেবে আপডেট হয়েছে।`,
    ALL_DONE: `✅ আজকের সব রোগী সম্পন্ন হয়েছে।`,
    ERROR: '⚠️ কিছু একটা সমস্যা হয়েছে। /start দিয়ে আবার শুরু করুন।',
    INVALID_PIN_FORMAT: 'PIN Code ৪-৬ ডিজিটের হতে হবে। আবার চেষ্টা করুন:',
    INVALID_SELECTION: 'সঠিক সংখ্যা বা বাটন চাপুন। আবার চেষ্টা করুন:',
    INVALID_DATE: 'সঠিক তারিখ দিন (YYYY-MM-DD ফরম্যাট, আজ বা ভবিষ্যতের তারিখ):',
    INVALID_NAME: 'নাম কমপক্ষে ২ অক্ষরের হতে হবে। আবার লিখুন:',
    BTN_BOOK: '📅 বুক অ্যাপয়েন্টমেন্ট',
    BTN_STATUS: '🔍 স্ট্যাটাস চেক',
    BTN_CANCEL: '❌ বাতিল করুন',
    BTN_ADMIN: '👨‍⚕️ অ্যাডমিন / কম্পাউন্ডার লগইন',
    BTN_BACK: '🔙 ব্যাক',
    STATUS_MSG: '🔗 আপনার বুকিং কনফার্মেশন মেসেজে দেওয়া লিংকটি চেক করুন।',
    CANCEL_MSG: '❌ বর্তমান কার্যক্রম বাতিল হয়েছে। /start দিয়ে আবার শুরু করুন।',
    CANCEL_PROMPT: 'আপনার টোকেন নম্বর দিন (যেমন: /cancel 5) অথবা পূর্ববর্তী মেনুতে ফিরে যান:',
    BOOKING_CANCELLED: (token) => `✅ আপনার বুকিং (টোকেন #${token}) সফলভাবে বাতিল করা হয়েছে।`,
    REMINDER: (clinicStr, queueNumber) =>
      `⏰ *রিমাইন্ডার:*\nআপনার অ্যাপয়েন্টমেন্ট${clinicStr} ১ ঘণ্টার মধ্যে শুরু হবে।\n\nটোকেন: *#${queueNumber}*\nলাইভ ট্র্যাকার দেখতে /queue চাপুন।`
  },
  en: {
    WELCOME: '👋 Hello! I am *Smart Queue Bot*.',
    CHOOSE_LANG: 'Please select your language:',
    MAIN_MENU: 'What would you like to do? Choose from the buttons below:',
    ASK_PIN: '📍 Please type your area *PIN Code* (4-6 digits):',
    NO_DOCTORS: '😔 No doctors found in this PIN code.\n\nPlease try a different PIN code.',
    SELECT_DOCTOR: (schedules) => {
      const list = schedules
        .map(
          (s, i) =>
            `${i + 1}. 🩺 *${s.doctors.full_name}* (${s.doctors.specialization})\n   📅 ${s.day_of_week} | 🕙 ${s.start_time}–${s.end_time}`
        )
        .join('\n\n');
      return `✅ Doctors available in this area:\n\n${list}\n\nChoose a doctor from the buttons below:`;
    },
    ASK_DATE: '📅 Which date do you want the appointment for?\n\nChoose from the dates below or type in (YYYY-MM-DD) format:',
    ASK_NAME: '👤 Please type your full name:',
    BOOKING_CONFIRMED: (name, queueNumber, date, scheduleId) =>
      `✅ *Booking Confirmed!*\n\n👤 Name: ${name}\n📅 Date: ${date}\n🔢 Your Token: *${queueNumber}*\n\nClick the link to see live status:\n${process.env.PUBLIC_URL || ''}/tracker.html?scheduleId=${scheduleId}&date=${date}`,
    ADMIN_ASK_PIN: '🔒 Enter your secret PIN:',
    ADMIN_INVALID_PIN: '❌ Invalid PIN. Try again.',
    ADMIN_DASHBOARD: (patients) => {
        if (!patients.length) return `📋 No patients today.`;
        const list = patients.map((p) => `#${p.queue_number} ${p.patient_name} — _${p.status}_`).join('\n');
        return `📋 *Today's Patient List:*\n\n${list}\n\n➡️ /next — Next patient completed\n❌ /cancel <token> — Cancel\n🔄 /refresh — Refresh list`;
    },
    QUEUE_UPDATED: (token) => `✅ Token #${token} — Updated as *Completed*.`,
    ALL_DONE: `✅ All patients completed today.`,
    ERROR: '⚠️ Something went wrong. Type /start to begin again.',
    INVALID_PIN_FORMAT: 'PIN Code must be 4-6 digits. Try again:',
    INVALID_SELECTION: 'Invalid selection. Try again:',
    INVALID_DATE: 'Provide a valid date (YYYY-MM-DD format, today or future):',
    INVALID_NAME: 'Name must be at least 2 characters. Try again:',
    BTN_BOOK: '📅 Book Appointment',
    BTN_STATUS: '🔍 Check Status',
    BTN_CANCEL: '❌ Cancel',
    BTN_ADMIN: '👨‍⚕️ Admin / Compounder Login',
    BTN_BACK: '🔙 Back',
    STATUS_MSG: '🔗 Please check the tracker link provided in your booking confirmation message.',
    CANCEL_MSG: '❌ Current process cancelled. Type /start to begin again.',
    CANCEL_PROMPT: 'Please enter your token number (e.g., /cancel 5) or go back:',
    BOOKING_CANCELLED: (token) => `✅ Your booking (Token #${token}) has been successfully cancelled.`,
    REMINDER: (clinicStr, queueNumber) =>
      `⏰ *Reminder:*\nYour appointment${clinicStr} starts within 1 hour.\n\nToken: *#${queueNumber}*\nType /queue to see live tracker.`
  },
  hi: {
    WELCOME: '👋 नमस्ते! मैं *Smart Queue Bot* हूँ।',
    CHOOSE_LANG: 'कृपया अपनी भाषा चुनें:',
    MAIN_MENU: 'आप क्या करना चाहेंगे? नीचे दिए गए बटन से चुनें:',
    ASK_PIN: '📍 कृपया अपने क्षेत्र का *PIN Code* दर्ज करें (4-6 अंक):',
    NO_DOCTORS: '😔 इस PIN कोड में कोई डॉक्टर नहीं मिला।\n\nकृपया कोई अन्य PIN कोड आज़माएँ।',
    SELECT_DOCTOR: (schedules) => {
      const list = schedules
        .map(
          (s, i) =>
            `${i + 1}. 🩺 *${s.doctors.full_name}* (${s.doctors.specialization})\n   📅 ${s.day_of_week} | 🕙 ${s.start_time}–${s.end_time}`
        )
        .join('\n\n');
      return `✅ इस क्षेत्र में उपलब्ध डॉक्टर:\n\n${list}\n\nनीचे दिए गए बटन से डॉक्टर चुनें:`;
    },
    ASK_DATE: '📅 आप किस तारीख के लिए अपॉइंटमेंट चाहते हैं?\n\nनीचे दी गई तारीखों में से चुनें या (YYYY-MM-DD) प्रारूप में टाइप करें:',
    ASK_NAME: '👤 कृपया अपना पूरा नाम टाइप करें:',
    BOOKING_CONFIRMED: (name, queueNumber, date, scheduleId) =>
      `✅ *बुकिंग पक्की हो गई!*\n\n👤 नाम: ${name}\n📅 तारीख: ${date}\n🔢 आपका टोकन: *${queueNumber}*\n\nलाइव स्थिति देखने के लिए लिंक पर क्लिक करें:\n${process.env.PUBLIC_URL || ''}/tracker.html?scheduleId=${scheduleId}&date=${date}`,
    ADMIN_ASK_PIN: '🔒 अपना गुप्त पिन दर्ज करें:',
    ADMIN_INVALID_PIN: '❌ अमान्य पिन। पुनः प्रयास करें।',
    ADMIN_DASHBOARD: (patients) => {
        if (!patients.length) return `📋 आज कोई मरीज नहीं है।`;
        const list = patients.map((p) => `#${p.queue_number} ${p.patient_name} — _${p.status}_`).join('\n');
        return `📋 *आज की मरीज सूची:*\n\n${list}\n\n➡️ /next — अगला मरीज संपन्न\n❌ /cancel <token> — रद्द करें\n🔄 /refresh — सूची ताज़ा करें`;
    },
    QUEUE_UPDATED: (token) => `✅ टोकन #${token} — *Completed* के रूप में अपडेट किया गया।`,
    ALL_DONE: `✅ आज के सभी मरीज संपन्न हुए।`,
    ERROR: '⚠️ कुछ गलत हो गया। फिर से शुरू करने के लिए /start टाइप करें।',
    INVALID_PIN_FORMAT: 'PIN Code 4-6 अंकों का होना चाहिए। पुनः प्रयास करें:',
    INVALID_SELECTION: 'अमान्य चयन। पुनः प्रयास करें:',
    INVALID_DATE: 'एक मान्य तारीख दें (YYYY-MM-DD प्रारूप, आज या भविष्य):',
    INVALID_NAME: 'नाम कम से कम 2 अक्षरों का होना चाहिए। पुनः प्रयास करें:',
    BTN_BOOK: '📅 अपॉइंटमेंट बुक करें',
    BTN_STATUS: '🔍 स्थिति की जांच',
    BTN_CANCEL: '❌ रद्द करें',
    BTN_ADMIN: '👨‍⚕️ एडमिन / कंपाउंडर लॉगिन',
    BTN_BACK: '🔙 वापस',
    STATUS_MSG: '🔗 कृपया अपने बुकिंग पुष्टिकरण संदेश में दिए गए ट्रैकर लिंक की जाँच करें।',
    CANCEL_MSG: '❌ वर्तमान प्रक्रिया रद्द कर दी गई। फिर से शुरू करने के लिए /start टाइप करें।',
    CANCEL_PROMPT: 'कृपया अपना टोकन नंबर दर्ज करें (जैसे: /cancel 5) या वापस जाएं:',
    BOOKING_CANCELLED: (token) => `✅ आपकी बुकिंग (टोकन #${token}) सफलतापूर्वक रद्द कर दी गई है।`,
    REMINDER: (clinicStr, queueNumber) =>
      `⏰ *रिमाइंडर:*\nआपका अपॉइंटमेंट${clinicStr} 1 घंटे में शुरू होगा।\n\nটোকেন: *#${queueNumber}*\nलाइव ट्रैकर देखने के लिए /queue टाइप करें।`
  }
};

function getMessage(lang = 'bn', key, ...args) {
  const languageSet = translations[lang] || translations['bn'];
  const message = languageSet[key] || translations['bn'][key];
  if (typeof message === 'function') {
    return message(...args);
  }
  return message;
}

// Ensure old MESSAGES object is fully mocked to prevent legacy test failures
const MESSAGES = translations.bn;

module.exports = { getMessage, translations, ...MESSAGES, MESSAGES };
