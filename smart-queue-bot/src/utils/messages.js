// src/utils/messages.js
// All bot reply strings — Bengali UI, i18n-ready.
// Keep all user-facing text here so it's easy to translate.

const MESSAGES = {
  WELCOME: `👋 নমস্কার! আমি *Smart Queue Bot*।\n\nআপনি কি করতে চান?\n\n📅 /book — অ্যাপয়েন্টমেন্ট বুক করুন\n🔢 /queue — লাইভ কিউ ট্র্যাকার\n🔒 /admin — কম্পাউন্ডার লগইন\n❓ /help — সাহায্য\n❌ /cancel — বাতিল করুন`,

  ASK_PIN: `📍 আপনার এলাকার *PIN Code* টাইপ করুন (৬ ডিজিট):`,

  NO_DOCTORS: `😔 এই PIN কোডে কোনো ডাক্তার পাওয়া যায়নি।\n\nঅন্য PIN কোড দিয়ে চেষ্টা করুন।`,

  /**
   * @param {Array} schedules - array of schedule rows with doctors nested
   */
  SELECT_DOCTOR: (schedules) => {
    const list = schedules
      .map(
        (s, i) =>
          `${i + 1}. 🩺 *${s.doctors.full_name}* (${s.doctors.specialization})\n   📅 ${s.day_of_week} | 🕙 ${s.start_time}–${s.end_time}`
      )
      .join('\n\n');
    return `✅ এই এলাকায় পাওয়া ডাক্তারগণ:\n\n${list}\n\nসংখ্যা টাইপ করে বেছে নিন (যেমন: *1*)`;
  },

  ASK_DATE: `📅 কোন তারিখে অ্যাপয়েন্টমেন্ট চান?\n\n(YYYY-MM-DD ফরম্যাটে লিখুন, যেমন: *2026-07-15*)\n\n⚠️ পুরনো তারিখ গ্রহণযোগ্য নয়।`,

  ASK_NAME: `👤 আপনার পুরো নাম লিখুন:`,

  /**
   * @param {string} name
   * @param {number} queueNumber
   * @param {string} date
   */
  BOOKING_CONFIRMED: (name, queueNumber, date) =>
    `✅ *বুকিং সম্পন্ন!*\n\n👤 নাম: ${name}\n📅 তারিখ: ${date}\n🔢 আপনার টোকেন: *${queueNumber}*\n\nঅ্যাপয়েন্টমেন্টের দিন লাইভ স্ট্যাটাস দেখতে /queue লিখুন।`,

  ADMIN_ASK_PIN: `🔒 আপনার সিক্রেট PIN দিন:`,

  ADMIN_INVALID_PIN: `❌ ভুল PIN। আবার চেষ্টা করুন।`,

  /**
   * @param {Array} patients
   */
  ADMIN_DASHBOARD: (patients) => {
    if (!patients.length) return `📋 আজকে কোনো রোগী নেই।`;
    const list = patients
      .map((p) => `#${p.queue_number} ${p.patient_name} — _${p.status}_`)
      .join('\n');
    return `📋 *আজকের রোগী তালিকা:*\n\n${list}\n\n➡️ /next — পরবর্তী রোগী সম্পন্ন\n❌ /cancel <token> — বাতিল করুন\n🔄 /refresh — তালিকা রিফ্রেশ`;
  },

  /**
   * @param {number} token
   */
  QUEUE_UPDATED: (token) =>
    `✅ Token #${token} — *Completed* হিসেবে আপডেট হয়েছে।`,

  ALL_DONE: `✅ আজকের সব রোগী সম্পন্ন হয়েছে।`,

  ERROR: `⚠️ কিছু একটা সমস্যা হয়েছে। /start দিয়ে আবার শুরু করুন।`,

  INVALID_PIN_FORMAT: `PIN Code ৬ ডিজিটের হতে হবে। আবার চেষ্টা করুন:`,

  INVALID_SELECTION: `সঠিক সংখ্যা দিন। আবার চেষ্টা করুন:`,

  INVALID_DATE: `সঠিক তারিখ দিন (YYYY-MM-DD ফরম্যাট, আজ বা ভবিষ্যতের তারিখ):`,
};

module.exports = MESSAGES;
