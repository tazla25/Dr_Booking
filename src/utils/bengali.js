// src/utils/bengali.js
// Bengali number formatting + trust score calculation (Strategy v2)
//
// V4-002 fix: all number formatting functions now accept an optional `lang`
// parameter. When lang === 'en' (or 'hi'), they return English digits
// instead of Bengali numerals. Previously toBengaliNumber() was called
// unconditionally, so English-mode users saw ₹৫০০ instead of ₹500.

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

/**
 * Convert English digits in a string/number to Bengali numerals.
 * Example: toBengaliNumber(4.5) → "৪.৫"
 *          toBengaliNumber(500) → "৫০০"
 *          toBengaliNumber("500+") → "৫০০+"
 */
function toBengaliNumber(input) {
  return String(input).replace(/[0-9]/g, (d) => BENGALI_DIGITS[parseInt(d, 10)])
}

/**
 * V4-002: lang-aware number formatting. Returns English digits for lang='en'
 * or lang='hi', Bengali numerals for lang='bn' (default).
 */
function toLocalNumber(input, lang = 'bn') {
  if (lang === 'en' || lang === 'hi') return String(input)
  return toBengaliNumber(input)
}

/**
 * Format a patient count for display: "500+" if >= 500, else the raw number.
 * V4-002: now lang-aware.
 */
function formatPatientCount(count, lang = 'bn') {
  const display = count >= 500 ? `${count}+` : String(count)
  return toLocalNumber(display, lang)
}

/**
 * Format rating for display: "৪.৫" or "নতুন"/"New" if < 5 reviews.
 * V4-002: now lang-aware.
 */
function formatRating(avgRating, reviewCount, lang = 'bn') {
  if (reviewCount < 5) return lang === 'en' ? 'New' : lang === 'hi' ? 'नया' : 'নতুন'
  return toLocalNumber(Number(avgRating).toFixed(1), lang)
}

/**
 * Calculate a composite trust score for search result sorting.
 * Higher = more trustworthy.
 *
 * @param {Object} doctor - Doctor object with trust fields
 * @returns {number}
 */
function calculateTrustScore(doctor) {
  const verifiedBonus = doctor.ownerAdmin?.verificationStatus === 'VERIFIED' ? 10 : 0
  const ratingScore = (doctor.avgRating || 0) * (doctor.reviewCount || 0) * 0.4
  const patientScore = Math.min((doctor.appointmentCount || 0) / 10, 20) * 0.3
  const experienceScore = Math.min(doctor.yearsExperience || 0, 30) * 0.2
  return verifiedBonus + ratingScore + patientScore + experienceScore
}

/**
 * Sort doctors by trust score (verified first, then by score descending).
 */
function sortByTrustScore(doctors) {
  return doctors.sort((a, b) => {
    const aVerified = a.ownerAdmin?.verificationStatus === 'VERIFIED'
    const bVerified = b.ownerAdmin?.verificationStatus === 'VERIFIED'
    if (aVerified && !bVerified) return -1
    if (!aVerified && bVerified) return 1
    return calculateTrustScore(b) - calculateTrustScore(a)
  })
}

/**
 * Build the trust signal string for bot display.
 * Example: "🟢 যাচাই · ⭐ ৪.৫ (২৩) · ৫০০+ রোগী · ১৫ বছর"
 */
function buildTrustSignal(doctor, lang = 'bn') {
  const parts = []
  const verified = doctor.ownerAdmin?.verificationStatus === 'VERIFIED'

  if (lang === 'en') {
    if (verified) parts.push('🟢 Verified')
    const rating = formatRating(doctor.avgRating, doctor.reviewCount, lang)
    if (rating === 'New') {
      parts.push('New')
    } else {
      parts.push(`⭐ ${rating} (${toLocalNumber(doctor.reviewCount, lang)})`)
    }
    if (doctor.appointmentCount > 0) {
      parts.push(`${formatPatientCount(doctor.appointmentCount, lang)} patients`)
    }
    if (doctor.yearsExperience > 0) {
      parts.push(`${toLocalNumber(doctor.yearsExperience, lang)} yrs exp`)
    }
  } else if (lang === 'hi') {
    if (verified) parts.push('🟢 सत्यापित')
    const rating = formatRating(doctor.avgRating, doctor.reviewCount, lang)
    if (rating === 'नया') {
      parts.push('नया')
    } else {
      parts.push(`⭐ ${rating} (${toLocalNumber(doctor.reviewCount, lang)})`)
    }
    if (doctor.appointmentCount > 0) {
      parts.push(`${formatPatientCount(doctor.appointmentCount, lang)} रोगी`)
    }
    if (doctor.yearsExperience > 0) {
      parts.push(`${toLocalNumber(doctor.yearsExperience, lang)} वर्ष`)
    }
  } else {
    if (verified) parts.push('🟢 যাচাই')
    const rating = formatRating(doctor.avgRating, doctor.reviewCount, lang)
    if (rating === 'নতুন') {
      parts.push('নতুন')
    } else {
      parts.push(`⭐ ${rating} (${toLocalNumber(doctor.reviewCount, lang)})`)
    }
    if (doctor.appointmentCount > 0) {
      parts.push(`${formatPatientCount(doctor.appointmentCount, lang)} রোগী`)
    }
    if (doctor.yearsExperience > 0) {
      parts.push(`${toLocalNumber(doctor.yearsExperience, lang)} বছর`)
    }
  }

  return parts.join(' · ')
}

module.exports = {
  toBengaliNumber,
  toLocalNumber,
  formatPatientCount,
  formatRating,
  calculateTrustScore,
  sortByTrustScore,
  buildTrustSignal,
}
