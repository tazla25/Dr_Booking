// src/utils/bengali.js
// Bengali number formatting + trust score calculation (Strategy v2)

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
 * Format a patient count for display: "500+" if >= 500, else the raw number.
 * Returns Bengali numerals.
 */
function formatPatientCount(count) {
  const display = count >= 500 ? `${count}+` : String(count)
  return toBengaliNumber(display)
}

/**
 * Format rating for display: "৪.৫" or "নতুন" if < 5 reviews.
 */
function formatRating(avgRating, reviewCount) {
  if (reviewCount < 5) return 'নতুন'
  return toBengaliNumber(Number(avgRating).toFixed(1))
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
    const rating = formatRating(doctor.avgRating, doctor.reviewCount)
    if (rating === 'নতুন') {
      parts.push('New')
    } else {
      parts.push(`⭐ ${rating} (${toBengaliNumber(doctor.reviewCount)})`)
    }
    if (doctor.appointmentCount > 0) {
      parts.push(`${formatPatientCount(doctor.appointmentCount)} patients`)
    }
    if (doctor.yearsExperience > 0) {
      parts.push(`${toBengaliNumber(doctor.yearsExperience)} yrs exp`)
    }
  } else {
    if (verified) parts.push('🟢 যাচাই')
    const rating = formatRating(doctor.avgRating, doctor.reviewCount)
    if (rating === 'নতুন') {
      parts.push('নতুন')
    } else {
      parts.push(`⭐ ${rating} (${toBengaliNumber(doctor.reviewCount)})`)
    }
    if (doctor.appointmentCount > 0) {
      parts.push(`${formatPatientCount(doctor.appointmentCount)} রোগী`)
    }
    if (doctor.yearsExperience > 0) {
      parts.push(`${toBengaliNumber(doctor.yearsExperience)} বছর`)
    }
  }

  return parts.join(' · ')
}

module.exports = {
  toBengaliNumber,
  formatPatientCount,
  formatRating,
  calculateTrustScore,
  sortByTrustScore,
  buildTrustSignal,
}
