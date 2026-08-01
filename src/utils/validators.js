// src/utils/validators.js
// Input validation helpers

/**
 * Validate a 6-digit Indian PIN code.
 * @param {string} input
 * @returns {number|null} parsed PIN or null if invalid
 */
function validatePinCode(input) {
  const trimmed = (input || '').trim();
  if (!/^\d{4,6}$/.test(trimmed)) return null;
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
 * Validate a 4-digit admin PIN.
 * @param {string} input
 * @returns {string|null} trimmed PIN or null
 */
function validateAdminPin(input) {
  const trimmed = (input || '').trim();
  if (!/^\d{4,6}$/.test(trimmed)) return null;
  return trimmed;
}

module.exports = { validatePinCode, validateDate, validateName, validateAdminPin };
