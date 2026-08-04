// src/utils/validators.js
// Input validation helpers

/**
 * Validate a 6-digit Indian PIN code.
 * @param {string} input
 * @returns {number|null} parsed PIN or null if invalid
 */
function validatePinCode(input) {
  const trimmed = (input || '').trim();
  if (!/^\d{6}$/.test(trimmed)) return null;
  const pin = parseInt(trimmed, 10);
  if (pin < 1000 || pin > 999999) return null;
  return pin;
}

/**
 * Validate a date string in YYYY-MM-DD format.
 * Also checks that the date is not in the past.
 * @param {string} input
 * @returns {string|null} validated date string or null
 */
function validateDate(input) {
  const trimmed = (input || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const date = new Date(trimmed + 'T00:00:00');
  if (isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return null;

  return trimmed;
}

/**
 * Validate a patient name (non-empty, reasonable length).
 * @param {string} input
 * @returns {string|null} trimmed name or null
 */
function validateName(input) {
  const trimmed = (input || '').trim();
  if (trimmed.length < 2 || trimmed.length > 100) return null;
  return trimmed;
}

/**
 * Validate an Indian medical registration number.
 * Format: 2-5 uppercase letters followed by 4-10 digits.
 *
 * Covers all Indian state medical councils:
 *   - WBMC (West Bengal Medical Council, 4 letters)
 *   - MCI  (Medical Council of India, 3 letters)
 *   - KMC  (Karnataka Medical Council, 3 letters)
 *   - TSMC (Telangana State Medical Council, 4 letters)
 *   - AP MC (Andhra Pradesh, varies — typically normalized to APMC)
 *   - etc.
 *
 * Bug fix (v11): previous regex was `^[A-Z]{2,3}\d{4,8}$` which rejected
 * `WBMC25836` (4 letters). Now accepts 2-5 letters + 4-10 digits.
 *
 * This is a FORMAT check only — actual registry lookup is done by super admin manually.
 *
 * @param {string} input
 * @returns {string|null} normalized reg number or null if invalid format
 */
function validateMedicalRegNumber(input) {
  const trimmed = (input || '').trim().toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z]{2,5}\d{4,10}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate a phone number, accepting common Indian formats and normalizing to E.164.
 *
 * Bug fix (v11): previously only accepted strict E.164 (+CC followed by 8-15 digits).
 * Indian users often type:
 *   - 9876543210       (10 digits, no country code)
 *   - 09876543210      (leading 0, domestic)
 *   - +91 98765 43210  (spaces)
 *   - 91-98765-43210   (dashes)
 *
 * Now: strips spaces/dashes, auto-prepends +91 for 10-digit Indian mobiles,
 * auto-prepends +91 for 11-digit numbers starting with 0, and otherwise
 * falls back to strict E.164 validation.
 *
 * @param {string} input
 * @returns {string|null} normalized phone in E.164 format (with leading +) or null
 */
function validatePhone(input) {
  let trimmed = (input || '').trim().replace(/[\s-]/g, '');
  if (!trimmed) return null;

  // Indian domestic format: 10 digits → +91 + 10 digits
  if (/^\d{10}$/.test(trimmed)) {
    return '+91' + trimmed;
  }
  // Indian domestic with leading 0: 0 + 10 digits → +91 + 10 digits
  if (/^0\d{10}$/.test(trimmed)) {
    return '+91' + trimmed.substring(1);
  }

  // Already E.164-style: prepend + if user forgot
  if (/^\d/.test(trimmed)) {
    trimmed = '+' + trimmed;
  }

  // E.164: + followed by 8-15 digits
  if (!/^\+\d{8,15}$/.test(trimmed)) return null;

  return trimmed;
}

/**
 * Validate a chamber/street address.
 * Allows 5-300 chars (addresses are longer than names).
 *
 * Bug fix (v11): the chamber step was re-using validateName which caps at 100 chars,
 * rejecting longer addresses and silently failing.
 *
 * @param {string} input
 * @returns {string|null} trimmed address or null if invalid
 */
function validateAddress(input) {
  const trimmed = (input || '').trim();
  if (trimmed.length < 5 || trimmed.length > 300) return null;
  return trimmed;
}

/**
 * Validate a password.
 * Rules: 8-128 chars, no whitespace at start/end, must contain at least one letter and one digit.
 *
 * Bug fix (v11): new for phone+password login flow.
 *
 * @param {string} input
 * @returns {string|null} the password if valid, or null
 */
function validatePassword(input) {
  const trimmed = (input || '').trim();
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  if (!/[a-zA-Z]/.test(trimmed)) return null;
  if (!/\d/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate a specialization string (e.g., "Cardiologist", "General Physician").
 * @param {string} input
 * @returns {string|null} trimmed specialization or null
 */
function validateSpecialization(input) {
  const trimmed = (input || '').trim();
  if (trimmed.length < 3 || trimmed.length > 80) return null;
  return trimmed;
}

module.exports = {
  validatePinCode,
  validateDate,
  validateName,
  validateMedicalRegNumber,
  validatePhone,
  validateSpecialization,
  validateAddress,
  validatePassword,
};
