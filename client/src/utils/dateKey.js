/**
 * Local calendar date keys (yyyy-mm-dd) without UTC day-shift from toISOString().
 * Use for time-slot dates, driver dashboard filters, and admin calendar matching.
 */

/** @param {Date|string|number|null|undefined} input */
export function toLocalDateKey(input) {
  if (input == null || input === '') return '';
  if (typeof input === 'string') {
    const m = input.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input).slice(0, 10);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function todayLocalDateKey() {
  return toLocalDateKey(new Date());
}
