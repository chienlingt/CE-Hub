/**
 * App calendar date keys (yyyy-mm-dd) in Asia/Kuala_Lumpur — matches Malaysia business dates.
 */

const APP_TIMEZONE = 'Asia/Kuala_Lumpur';

/** @param {Date|string|number|null|undefined} value */
function toAppDateKey(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

module.exports = { toAppDateKey, APP_TIMEZONE };
