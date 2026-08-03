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
 * Format: 2-3 uppercase letters followed by 4-8 digits (e.g., WBMC12345, MCI987654).
 * This is a FORMAT check only — actual registry lookup is done by super admin manually.
 *
 * @param {string} input
 * @returns {string|null} normalized reg number or null if invalid format
 */
function validateMedicalRegNumber(input) {
  const trimmed = (input || '').trim().toUpperCase();
  if (!/^[A-Z]{2,3}\d{4,8}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate a phone number in E.164 format (+CCNNNNNNNNNN).
 * Accepts:
 *   - +91XXXXXXXXXX (India, 12 digits total with +)
 *   - +880XXXXXXXXX (Bangladesh)
 *   - General E.164: + followed by 8-15 digits
 *
 * @param {string} input
 * @returns {string|null} normalized phone (with leading +) or null if invalid
 */
function validatePhone(input) {
  const trimmed = (input || '').trim();

  // Allow user to type without leading +, normalize it
  let normalized = trimmed;
  if (/^\d/.test(normalized)) {
    normalized = '+' + normalized;
  }

  // E.164: + followed by 8-15 digits, no spaces or dashes
  if (!/^\+\d{8,15}$/.test(normalized)) return null;

  return normalized;
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
};
