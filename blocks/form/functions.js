/**
 * Get Full Name
 * @name getFullName Concats first name and last name
 * @param {string} firstname in Stringformat
 * @param {string} lastname in Stringformat
 * @return {string}
 */
function getFullName(firstname, lastname) {
  return `${firstname} ${lastname}`.trim();
}

/**
 * Custom submit function
 * @param {scope} globals
 */
function submitFormArrayToString(globals) {
  const data = globals.functions.exportData();
  Object.keys(data).forEach((key) => {
    if (Array.isArray(data[key])) {
      data[key] = data[key].join(',');
    }
  });
  globals.functions.submitForm(data, true, 'application/json');
}

/**
 * Calculate the number of days between two dates.
 * @param {*} endDate
 * @param {*} startDate
 * @returns {number} returns the number of days between two dates
 */
function days(endDate, startDate) {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  // return zero if dates are valid
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const diffInMs = Math.abs(end.getTime() - start.getTime());
  return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
}

/**
 * Count names entered one per line
 * @name countNames Counts the non-empty lines in a text
 * @param {string} names one name per line
 * @return {number}
 */
function countNames(names) {
  return String(names || '').split('\n').filter((n) => n.trim()).length;
}

const POSTAL_CODES = {
  india: { label: 'PIN code', hint: '6 digits, e.g. 400001', pattern: /^[1-9][0-9]{5}$/ },
  usa: { label: 'ZIP code', hint: '5 digits, e.g. 10001 or 10001-1234', pattern: /^\d{5}(-\d{4})?$/ },
  uk: { label: 'Postcode', hint: 'e.g. SW1A 1AA', pattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i },
};

/**
 * Postal code status for the selected country
 * @name postalCodeStatus Checks the PIN (India), ZIP (USA) or Postcode (UK) for a country
 * @param {string} country country value: india, usa or uk
 * @param {string} code the postal code entered
 * @return {string}
 */
function postalCodeStatus(country, code) {
  const rule = POSTAL_CODES[country];
  if (!rule) return 'Select a country first';
  const value = String(code || '').trim();
  if (!value) return `Enter your ${rule.label} (${rule.hint})`;
  return rule.pattern.test(value)
    ? `Valid ${rule.label}`
    : `Invalid ${rule.label}: ${rule.hint}`;
}

// eslint-disable-next-line import/prefer-default-export
export {
  getFullName, days, submitFormArrayToString, countNames, postalCodeStatus,
};
