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
            `${i + 1}. 🩺 *${s.doctor.fullName}* (${s.doctor.specialization})\n   📅 ${s.dayOfWeek} | 🕙 ${s.startTime}–${s.endTime}`
        )
        .join('\n\n');
      return `✅ এই এলাকায় পাওয়া ডাক্তারগণ:\n\n${list}\n\nনিচের বাটন থেকে ডাক্তার বেছে নিন:`;
    },
    ASK_DATE: '📅 কোন তারিখে অ্যাপয়েন্টমেন্ট চান?\n\nনিচের তারিখগুলো থেকে বেছে নিন অথবা (YYYY-MM-DD) ফরম্যাটে লিখে দিন:',
    ASK_NAME: '👤 আপনার পুরো নাম লিখুন:',
    BOOKING_CONFIRMED: (name, queueNumber, date, scheduleId) =>
      `✅ *বুকিং সম্পন্ন!*\n\n👤 নাম: ${name}\n📅 তারিখ: ${date}\n🔢 আপনার টোকেন: *${queueNumber}*\n\n[লাইভ স্ট্যাটাস দেখতে এখানে ক্লিক করুন](${process.env.DASHBOARD_URL || ''}/?view=tracker&scheduleId=${scheduleId}&date=${date})`,
    ADMIN_ASK_PIN: '🔒 আপনার সিক্রেট PIN দিন:',
    ADMIN_INVALID_PIN: '❌ ভুল PIN। আবার চেষ্টা করুন।',
    ADMIN_DASHBOARD: (patients) => {
        if (!patients.length) return `📋 আজকে কোনো রোগী নেই।`;
        const list = patients.map((p) => `#${p.queueNumber} ${p.patientName} — _${p.status}_`).join('\n');
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
      `⏰ *রিমাইন্ডার:*\nআপনার অ্যাপয়েন্টমেন্ট${clinicStr} ১ ঘণ্টার মধ্যে শুরু হবে।\n\nটোকেন: *#${queueNumber}*\nলাইভ ট্র্যাকার দেখতে /queue চাপুন।`,
    LOCKOUT: (remainMin) => `🔒 অনেকবার ভুল PIN দিয়েছেন। ${remainMin} মিনিট পর আবার চেষ্টা করুন।`,

    // ── Doctor registration & verification (Task 1.1 / 1.2) ──────────
    REGISTER_WELCOME: '👨‍⚕️ *ডাক্তার রেজিস্ট্রেশন*\n\nআপনি একজন ডাক্তার হিসেবে রেজিস্টার করতে চান। আপনার অ্যাকাউন্ট যাচাই হওয়ার পর আপনি কম্পাউন্ডার ইনভাইট করতে পারবেন এবং ড্যাশবোর্ড ব্যবহার করতে পারবেন।\n\n শুরু করতে নিচের বাটনে ক্লিক করুন।',
    REGISTER_ASK_NAME: '👤 আপনার পুরো নাম লিখুন (ডিগ্রি সহ):\n\nযেমন: ডাঃ রাহুল শর্মা, MBBS',
    REGISTER_ASK_PHONE: '📱 আপনার ফোন নম্বর দিন (E.164 ফরম্যাটে):\n\nযেমন: +919876543210',
    REGISTER_ASK_MEDICAL_REG: '🏥 আপনার মেডিকেল রেজিস্ট্রেশন নম্বর দিন:\n\nফরম্যাট: ২-৩টি অক্ষর + ৪-৮টি সংখ্যা (যেমন: WBMC12345, MCI987654)',
    REGISTER_ASK_SPECIALIZATION: '🩺 আপনার স্পেশালাইজেশন দিন:\n\nযেমন: Cardiologist, General Physician, Pediatrician',
    REGISTER_ASK_CHAMBER: '🏠 আপনার চেম্বারের ঠিকানা দিন (শহর সহ):\n\nযেমন: 123 Main St, Contai, Purba Medinipur',
    REGISTER_SUCCESS_PENDING: '✅ *রেজিস্ট্রেশন সম্পন্ন!*\n\nআপনার অ্যাকাউন্ট এখন *যাচাইয়ের অপেক্ষায়*। সুপার অ্যাডমিন আপনার মেডিকেল রেজিস্ট্রেশন যাচাই করে অনুমোদন করবেন। অনুমোদিত হলে আপনি একটি মেসেজ পাবেন।\n\nধন্যবাদ! 🙏',
    REGISTER_INVALID_NAME: '❌ নাম কমপক্ষে ২ অক্ষরের হতে হবে। আবার চেষ্টা করুন:',
    REGISTER_INVALID_PHONE: '❌ ফোন নম্বর সঠিক নয়। E.164 ফরম্যাটে দিন (যেমন: +919876543210)। আবার চেষ্টা করুন:',
    REGISTER_INVALID_MEDICAL_REG: '❌ মেডিকেল রেজিস্ট্রেশন নম্বর সঠিক নয়। ফরম্যাট: ২-৩টি অক্ষর + ৪-৮টি সংখ্যা (যেমন: WBMC12345)। আবার চেষ্টা করুন:',
    REGISTER_INVALID_SPECIALIZATION: '❌ স্পেশালাইজেশন কমপক্ষে ৩ অক্ষরের হতে হবে। আবার চেষ্টা করুন:',
    REGISTER_ALREADY_EXISTS: '⚠️ এই ফোন নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে। যদি এটি আপনার অ্যাকাউন্ট হয়, /admin দিয়ে লগইন করুন।',

    VERIFICATION_PENDING_LOGIN: '⏳ আপনার অ্যাকাউন্ট এখনও যাচাই হয়নি। সুপার অ্যাডমিন অনুমোদন করা পর্যন্ত অপেক্ষা করুন।',
    VERIFICATION_REJECTED_LOGIN: '❌ আপনার অ্যাকাউন্ট অনুমোদিত হয়নি। বিস্তারিত জানতে সাপোর্টে যোগাযোগ করুন।',
    VERIFICATION_SUSPENDED_LOGIN: '🚫 আপনার অ্যাকাউন্ট সাসপেন্ড করা হয়েছে। সাপোর্টে যোগাযোগ করুন।',
    VERIFICATION_APPROVED: '✅ *অভিনন্দন!*\n\nআপনার ডাক্তার অ্যাকাউন্ট অনুমোদিত হয়েছে। এখন আপনি /admin দিয়ে লগইন করতে পারেন এবং /invite দিয়ে কম্পাউন্ডার ইনভাইট করতে পারেন।',

    // Bug 1 + Bug 2 fixes
    ADMIN_NOT_REGISTERED: '🚫 আপনি নিবন্ধিত নন।\n\nডাক্তার হিসেবে নিবন্ধন করতে /register দিন।\n\nকম্পাউন্ডার হিসেবে যুক্ত হতে /link <phone> দিন।',
    ADMIN_LINK_FAILED: '⚠️ ড্যাশবোর্ড লিঙ্ক তৈরি করতে সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',

    // /link command for compounders (V8-3 fix)
    LINK_INVALID_PHONE: '❌ ফোন নম্বর সঠিক নয়। E.164 ফরম্যাটে দিন।',
    LINK_NO_COMPOUNDER: '❌ এই ফোন নম্বর দিয়ে কোনো কম্পাউন্ডার অ্যাকাউন্ট নেই।',
    LINK_ALREADY_LINKED: '✅ আপনার অ্যাকাউন্ট ইতিমধ্যে যুক্ত। /admin দিয়ে লগইন করুন।',
    LINK_SUCCESS: (doctorName) => '✅ অ্যাকাউন্ট যুক্ত হয়েছে! আপনি এখন ' + doctorName + ' এর কম্পাউন্ডার। /admin দিয়ে লগইন করুন।',

    // ── Compounder invitation ────────────────────────────────────────
    INVITE_PROMPT: '👨‍💼 ইনভাইট করতে কম্পাউন্ডারের ফোন নম্বর দিন (E.164 ফরম্যাটে):\n\nযেমন: +919876543210',
    INVITE_INVALID_PHONE: '❌ ফোন নম্বর সঠিক নয়। E.164 ফরম্যাটে দিন। আবার চেষ্টা করুন:',
    INVITE_SUCCESS: (phone) => `✅ *কম্পাউন্ডার ইনভাইট করা হয়েছে!*\n\nফোন: ${phone}\n\nকম্পাউন্ডার এই বটে ${phone} দিয়ে /start করলে স্বয়ংক্রিয়ভাবে আপনার ডাক্তার প্রোফাইলে যুক্ত হবে।`,
    INVITE_ALREADY_EXISTS: '⚠️ এই ফোন নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে।',
    INVITE_ONLY_DOCTORS: '❌ শুধুমাত্র যাচাই করা ডাক্তাররা কম্পাউন্ডার ইনভাইট করতে পারেন।',
    INVITE_COMPOUNDER_WELCOME: (doctorName) => `👋 *স্বাগতম!*\n\nআপনি ${doctorName} এর কম্পাউন্ডার হিসেবে যুক্ত হয়েছেন। /admin দিয়ে লগইন করুন।`,

    BTN_REGISTER: '👨‍⚕️ ডাক্তার রেজিস্টার',
    BTN_INVITE: '👨‍💼 কম্পাউন্ডার ইনভাইট',

    // ── Multi-mode doctor discovery (Task 1.3) ────────────────────────
    SEARCH_MODE_PROMPT: '🔍 ডাক্তার খুঁজতে একটি মোড বেছে নিন:',
    SEARCH_MODE_PIN: '📍 PIN কোড দিন',
    SEARCH_MODE_NAME: '👤 নাম দিন',
    SEARCH_MODE_SPECIALTY_CITY: '🩺 স্পেশালিটি + শহর',
    SEARCH_MODE_SPECIALTY_PIN: '🩺 স্পেশালিটি + PIN',
    SEARCH_ASK_NAME: '👤 ডাক্তারের নাম লিখুন (অন্তত ২ অক্ষর):',
    SEARCH_ASK_SPECIALTY: '🩺 স্পেশালিটি লিখুন (যেমন: Cardiologist, General Physician):',
    SEARCH_ASK_CITY: '🏙️ শহরের নাম লিখুন (যেমন: Kolkata, Contai):',
    SEARCH_ASK_PIN: '📍 আপনার এলাকার PIN কোড দিন (৬ ডিজিট):',
    SEARCH_ASK_SPECIALTY_FOR_PIN: '🩺 স্পেশালিটি লিখুন (যেমন: Cardiologist):',
    SEARCH_INVALID_NAME: '❌ নাম কমপক্ষে ২ অক্ষরের হতে হবে। আবার চেষ্টা করুন:',
    SEARCH_INVALID_SPECIALTY: '❌ স্পেশালিটি কমপক্ষে ৩ অক্ষরের হতে হবে। আবার চেষ্টা করুন:',
    SEARCH_INVALID_CITY: '❌ শহরের নাম কমপক্ষে ২ অক্ষরের হতে হবে। আবার চেষ্টা করুন:',
    SEARCH_INVALID_PIN: '❌ PIN কোড ৬ ডিজিটের হতে হবে। আবার চেষ্টা করুন:',
    SEARCH_NO_RESULTS: '😔 কোনো ডাক্তার পাওয়া যায়নি। অন্য মানদণ্ড দিয়ে চেষ্টা করুন।',
    SEARCH_RESULTS_FOUND: (count) => `✅ ${count} জন ডাক্তার পাওয়া গেছে। নিচের বাটন থেকে বেছে নিন:`
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
            `${i + 1}. 🩺 *${s.doctor.fullName}* (${s.doctor.specialization})\n   📅 ${s.dayOfWeek} | 🕙 ${s.startTime}–${s.endTime}`
        )
        .join('\n\n');
      return `✅ Doctors available in this area:\n\n${list}\n\nChoose a doctor from the buttons below:`;
    },
    ASK_DATE: '📅 Which date do you want the appointment for?\n\nChoose from the dates below or type in (YYYY-MM-DD) format:',
    ASK_NAME: '👤 Please type your full name:',
    BOOKING_CONFIRMED: (name, queueNumber, date, scheduleId) =>
      `✅ *Booking Confirmed!*\n\n👤 Name: ${name}\n📅 Date: ${date}\n🔢 Your Token: *${queueNumber}*\n\n[Click here to see live status](${process.env.DASHBOARD_URL || ''}/?view=tracker&scheduleId=${scheduleId}&date=${date})`,
    ADMIN_ASK_PIN: '🔒 Enter your secret PIN:',
    ADMIN_INVALID_PIN: '❌ Invalid PIN. Try again.',
    ADMIN_DASHBOARD: (patients) => {
        if (!patients.length) return `📋 No patients today.`;
        const list = patients.map((p) => `#${p.queueNumber} ${p.patientName} — _${p.status}_`).join('\n');
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
      `⏰ *Reminder:*\nYour appointment${clinicStr} starts within 1 hour.\n\nToken: *#${queueNumber}*\nType /queue to see live tracker.`,
    LOCKOUT: (remainMin) => `🔒 Too many failed attempts. Please try again in ${remainMin} minute(s).`,

    // ── Doctor registration & verification (Task 1.1 / 1.2) ──────────
    REGISTER_WELCOME: '👨‍⚕️ *Doctor Registration*\n\nYou are registering as a doctor. Once your account is verified, you can invite compounders and access the dashboard.\n\nClick below to begin.',
    REGISTER_ASK_NAME: '👤 Enter your full name (with degree):\n\nExample: Dr. Rahul Sharma, MBBS',
    REGISTER_ASK_PHONE: '📱 Enter your phone number (E.164 format):\n\nExample: +919876543210',
    REGISTER_ASK_MEDICAL_REG: '🏥 Enter your medical registration number:\n\nFormat: 2-3 letters + 4-8 digits (e.g., WBMC12345, MCI987654)',
    REGISTER_ASK_SPECIALIZATION: '🩺 Enter your specialization:\n\nExample: Cardiologist, General Physician, Pediatrician',
    REGISTER_ASK_CHAMBER: '🏠 Enter your chamber address (with city):\n\nExample: 123 Main St, Contai, Purba Medinipur',
    REGISTER_SUCCESS_PENDING: '✅ *Registration Complete!*\n\nYour account is now *pending verification*. The super admin will verify your medical registration and approve it. You will receive a message once approved.\n\nThank you! 🙏',
    REGISTER_INVALID_NAME: '❌ Name must be at least 2 characters. Try again:',
    REGISTER_INVALID_PHONE: '❌ Invalid phone number. Use E.164 format (e.g., +919876543210). Try again:',
    REGISTER_INVALID_MEDICAL_REG: '❌ Invalid medical registration number. Format: 2-3 letters + 4-8 digits (e.g., WBMC12345). Try again:',
    REGISTER_INVALID_SPECIALIZATION: '❌ Specialization must be at least 3 characters. Try again:',
    REGISTER_ALREADY_EXISTS: '⚠️ An account with this phone number already exists. If it is yours, log in with /admin.',

    ADMIN_NOT_REGISTERED: '🚫 You are not registered.\n\nSend /register to register as a doctor.\n\nIf you are a compounder, send /link <phone> after your doctor invites you.',
    VERIFICATION_REJECTED_LOGIN: '❌ Your account was not approved. Contact support for details.',
    VERIFICATION_SUSPENDED_LOGIN: '🚫 Your account has been suspended. Contact support.',
    VERIFICATION_APPROVED: '✅ *Congratulations!*\n\nYour doctor account has been approved. You can now log in with /admin and invite compounders with /invite.',

    // Bug 1 + Bug 2 fixes
    ADMIN_LINK_FAILED: '⚠️ Failed to generate dashboard link. Please try again later.',

    // /link command for compounders (V8-3 fix)
    LINK_INVALID_PHONE: '❌ Invalid phone number. Use E.164 format (e.g., +919876543210).',
    LINK_NO_COMPOUNDER: '❌ No compounder account found with this phone. Ask your doctor to invite you.',
    LINK_ALREADY_LINKED: '✅ Your account is already linked. Use /admin to log in.',
    LINK_SUCCESS: (doctorName) => '✅ Account linked! You are now a compounder for ' + doctorName + '. Use /admin to log in.',

    INVITE_PROMPT: '👨‍💼 Enter the compounder\'s phone number to invite (E.164 format):\n\nExample: +919876543210',
    INVITE_INVALID_PHONE: '❌ Invalid phone number. Use E.164 format. Try again:',
    INVITE_SUCCESS: (phone) => `✅ *Compounder Invited!*\n\nPhone: ${phone}\n\nThe compounder will be linked to your doctor profile when they /start the bot with ${phone}.`,
    INVITE_ALREADY_EXISTS: '⚠️ An account with this phone number already exists.',
    INVITE_ONLY_DOCTORS: '❌ Only verified doctors can invite compounders.',
    INVITE_COMPOUNDER_WELCOME: (doctorName) => `👋 *Welcome!*\n\nYou have been added as a compounder for ${doctorName}. Log in with /admin.`,

    BTN_REGISTER: '👨‍⚕️ Register as Doctor',
    BTN_INVITE: '👨‍💼 Invite Compounder',

    // ── Multi-mode doctor discovery (Task 1.3) ────────────────────────
    SEARCH_MODE_PROMPT: '🔍 Choose a mode to find a doctor:',
    SEARCH_MODE_PIN: '📍 By PIN Code',
    SEARCH_MODE_NAME: '👤 By Name',
    SEARCH_MODE_SPECIALTY_CITY: '🩺 Specialty + City',
    SEARCH_MODE_SPECIALTY_PIN: '🩺 Specialty + PIN',
    SEARCH_ASK_NAME: '👤 Type the doctor\'s name (at least 2 characters):',
    SEARCH_ASK_SPECIALTY: '🩺 Type the specialty (e.g., Cardiologist, General Physician):',
    SEARCH_ASK_CITY: '🏙️ Type the city name (e.g., Kolkata, Contai):',
    SEARCH_ASK_PIN: '📍 Type your area PIN code (6 digits):',
    SEARCH_ASK_SPECIALTY_FOR_PIN: '🩺 Type the specialty (e.g., Cardiologist):',
    SEARCH_INVALID_NAME: '❌ Name must be at least 2 characters. Try again:',
    SEARCH_INVALID_SPECIALTY: '❌ Specialty must be at least 3 characters. Try again:',
    SEARCH_INVALID_CITY: '❌ City must be at least 2 characters. Try again:',
    SEARCH_INVALID_PIN: '❌ PIN must be 6 digits. Try again:',
    SEARCH_NO_RESULTS: '😔 No doctors found. Try different criteria.',
    SEARCH_RESULTS_FOUND: (count) => `✅ Found ${count} doctor${count === 1 ? '' : 's'}. Choose from the buttons below:`
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
            `${i + 1}. 🩺 *${s.doctor.fullName}* (${s.doctor.specialization})\n   📅 ${s.dayOfWeek} | 🕙 ${s.startTime}–${s.endTime}`
        )
        .join('\n\n');
      return `✅ इस क्षेत्र में उपलब्ध डॉक्टर:\n\n${list}\n\nनीचे दिए गए बटन से डॉक्टर चुनें:`;
    },
    ASK_DATE: '📅 आप किस तारीख के लिए अपॉइंटमेंट चाहते हैं?\n\nनीचे दी गई तारीखों में से चुनें या (YYYY-MM-DD) प्रारूप में टाइप करें:',
    ASK_NAME: '👤 कृपया अपना पूरा नाम टाइप करें:',
    BOOKING_CONFIRMED: (name, queueNumber, date, scheduleId) =>
      `✅ *बुकिंग पक्की हो गई!*\n\n👤 नाम: ${name}\n📅 तारीख: ${date}\n🔢 आपका टोकन: *${queueNumber}*\n\n[लाइव स्थिति देखने के लिए यहां क्लिक करें](${process.env.DASHBOARD_URL || ''}/?view=tracker&scheduleId=${scheduleId}&date=${date})`,
    ADMIN_ASK_PIN: '🔒 अपना गुप्त पिन दर्ज करें:',
    ADMIN_INVALID_PIN: '❌ अमान्य पिन। पुनः प्रयास करें।',
    ADMIN_DASHBOARD: (patients) => {
        if (!patients.length) return `📋 आज कोई मरीज नहीं है।`;
        const list = patients.map((p) => `#${p.queueNumber} ${p.patientName} — _${p.status}_`).join('\n');
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
      `⏰ *रिमाइंडर:*\nआपका अपॉइंटमेंट${clinicStr} 1 घंटे में शुरू होगा।\n\nটোকেন: *#${queueNumber}*\nलाइव ट्रैकर देखने के लिए /queue टाइप करें।`,
    LOCKOUT: (remainMin) => `🔒 बहुत अधिक गलत प्रयास। कृपया ${remainMin} मिनट बाद पुनः प्रयास करें।`,

    // ── Doctor registration & verification (Task 1.1 / 1.2) ──────────
    REGISTER_WELCOME: '👨‍⚕️ *डॉक्टर पंजीकरण*\n\nआप एक डॉक्टर के रूप में पंजीकरण कर रहे हैं। एक बार आपका खाता सत्यापित हो जाने पर, आप कंपाउंडर को आमंत्रित कर सकते हैं और डैशबोर्ड तक पहुंच सकते हैं।\n\nशुरू करने के लिए नीचे क्लिक करें।',
    REGISTER_ASK_NAME: '👤 अपना पूरा नाम दर्ज करें (डिग्री के साथ):\n\nउदाहरण: डॉ. राहुल शर्मा, MBBS',
    REGISTER_ASK_PHONE: '📱 अपना फोन नंबर दर्ज करें (E.164 प्रारूप):\n\nउदाहरण: +919876543210',
    REGISTER_ASK_MEDICAL_REG: '🏥 अपना मेडिकल पंजीकरण नंबर दर्ज करें:\n\nप्रारूप: 2-3 अक्षर + 4-8 अंक (जैसे, WBMC12345, MCI987654)',
    REGISTER_ASK_SPECIALIZATION: '🩺 अपनी विशेषज्ञता दर्ज करें:\n\nउदाहरण: Cardiologist, General Physician, Pediatrician',
    REGISTER_ASK_CHAMBER: '🏠 अपना चैंबर पता दर्ज करें (शहर के साथ):\n\nउदाहरण: 123 Main St, Contai, Purba Medinipur',
    REGISTER_SUCCESS_PENDING: '✅ *पंजीकरण पूर्ण!*\n\nआपका खाता अब *सत्यापन की प्रतीक्षा में* है। सुपर एडमिन आपके मेडिकल पंजीकरण को सत्यापित कर स्वीकृत करेगा। एक बार स्वीकृत होने पर आपको एक संदेश मिलेगा।\n\nधन्यवाद! 🙏',
    ADMIN_NOT_REGISTERED: '🚫 आप पंजीकृत नहीं हैं।\n\nडॉक्टर के रूप में पंजीकरण के लिए /register दबाएं।\n\nकंपाउंडर के रूप में जुड़ने के लिए /link <phone> दबाएं।',
    REGISTER_INVALID_PHONE: '❌ अमान्य फोन नंबर। E.164 प्रारूप का उपयोग करें (जैसे, +919876543210)। पुनः प्रयास करें:',
    REGISTER_INVALID_MEDICAL_REG: '❌ अमान्य मेडिकल पंजीकरण नंबर। प्रारूप: 2-3 अक्षर + 4-8 अंक (जैसे, WBMC12345)। पुनः प्रयास करें:',
    REGISTER_INVALID_SPECIALIZATION: '❌ विशेषज्ञता कम से कम 3 अक्षरों की होनी चाहिए। पुनः प्रयास करें:',
    REGISTER_ALREADY_EXISTS: '⚠️ इस फोन नंबर के साथ पहले से एक खाता मौजूद है। यदि यह आपका है, तो /admin से लॉग इन करें।',

    VERIFICATION_PENDING_LOGIN: '⏳ आपका खाता अभी तक सत्यापित नहीं हुआ है। कृपया सुपर एडमिन स्वीकृति की प्रतीक्षा करें।',
    VERIFICATION_REJECTED_LOGIN: '❌ आपका खाता स्वीकृत नहीं हुआ। विवरण के लिए सहायता से संपर्क करें।',
    VERIFICATION_SUSPENDED_LOGIN: '🚫 आपका खाता निलंबित कर दिया गया है। सहायता से संपर्क करें।',
    VERIFICATION_APPROVED: '✅ *बधाई हो!*\n\nआपका डॉक्टर खाता स्वीकृत हो गया है। अब आप /admin से लॉग इन कर सकते हैं और /invite से कंपाउंडर को आमंत्रित कर सकते हैं।',

    // Bug 1 + Bug 2 fixes
    ADMIN_LINK_FAILED: '⚠️ डैशबोर्ड लिंक बनाने में समस्या हुई है। कृपया बाद में पुनः प्रयास करें।',

    // /link command for compounders (V8-3 fix)
    LINK_INVALID_PHONE: '❌ अमान्य फोन नंबर। E.164 प्रारूप का उपयोग करें।',
    LINK_NO_COMPOUNDER: '❌ इस फोन नंबर के साथ कोई कंपाउंडर खाता नहीं मिला।',
    LINK_ALREADY_LINKED: '✅ आपका खाता पहले से जुड़ा हुआ है। /admin से लॉग इन करें।',
    LINK_SUCCESS: (doctorName) => '✅ खाता जुड़ गया! आप अब ' + doctorName + ' के कंपाउंडर हैं। /admin से लॉग इन करें।',

    INVITE_PROMPT: '👨‍💼 आमंत्रित करने के लिए कंपाउंडर का फोन नंबर दर्ज करें (E.164 प्रारूप):\n\nउदाहरण: +919876543210',
    INVITE_INVALID_PHONE: '❌ अमान्य फोन नंबर। E.164 प्रारूप का उपयोग करें। पुनः प्रयास करें:',
    INVITE_SUCCESS: (phone) => `✅ *कंपाउंडर आमंत्रित!*\n\nफोन: ${phone}\n\nजब कंपाउंडर ${phone} के साथ /start करेगा तो वह स्वतः आपके डॉक्टर प्रोफ़ाइल से जुड़ जाएगा।`,
    INVITE_ALREADY_EXISTS: '⚠️ इस फोन नंबर के साथ पहले से एक खाता मौजूद है।',
    INVITE_ONLY_DOCTORS: '❌ केवल सत्यापित डॉक्टर ही कंपाउंडर को आमंत्रित कर सकते हैं।',
    INVITE_COMPOUNDER_WELCOME: (doctorName) => `👋 *स्वागत है!*\n\nआप ${doctorName} के कंपाउंडर के रूप में जोड़े गए हैं। /admin से लॉग इन करें।`,

    BTN_REGISTER: '👨‍⚕️ डॉक्टर के रूप में पंजीकरण करें',
    BTN_INVITE: '👨‍💼 कंपाउंडर को आमंत्रित करें',

    // ── Multi-mode doctor discovery (Task 1.3) ────────────────────────
    SEARCH_MODE_PROMPT: '🔍 डॉक्टर खोजने के लिए एक मोड चुनें:',
    SEARCH_MODE_PIN: '📍 PIN कोड द्वारा',
    SEARCH_MODE_NAME: '👤 नाम द्वारा',
    SEARCH_MODE_SPECIALTY_CITY: '🩺 विशेषज्ञता + शहर',
    SEARCH_MODE_SPECIALTY_PIN: '🩺 विशेषज्ञता + PIN',
    SEARCH_ASK_NAME: '👤 डॉक्टर का नाम लिखें (कम से कम 2 अक्षर):',
    SEARCH_ASK_SPECIALTY: '🩺 विशेषज्ञता लिखें (जैसे: Cardiologist, General Physician):',
    SEARCH_ASK_CITY: '🏙️ शहर का नाम लिखें (जैसे: Kolkata, Contai):',
    SEARCH_ASK_PIN: '📍 अपने क्षेत्र का PIN कोड लिखें (6 अंक):',
    SEARCH_ASK_SPECIALTY_FOR_PIN: '🩺 विशेषज्ञता लिखें (जैसे: Cardiologist):',
    SEARCH_INVALID_NAME: '❌ नाम कम से कम 2 अक्षरों का होना चाहिए। पुनः प्रयास करें:',
    SEARCH_INVALID_SPECIALTY: '❌ विशेषज्ञता कम से कम 3 अक्षरों की होनी चाहिए। पुनः प्रयास करें:',
    SEARCH_INVALID_CITY: '❌ शहर कम से कम 2 अक्षरों का होना चाहिए। पुनः प्रयास करें:',
    SEARCH_INVALID_PIN: '❌ PIN 6 अंकों का होना चाहिए। पुनः प्रयास करें:',
    SEARCH_NO_RESULTS: '😔 कोई डॉक्टर नहीं मिला। अलग मानदंड आज़माएं।',
    SEARCH_RESULTS_FOUND: (count) => `✅ ${count} डॉक्टर मिले। नीचे दिए गए बटन से चुनें:`
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
