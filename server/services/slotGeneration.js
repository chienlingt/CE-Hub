const dayjs = require('dayjs');

// Slot horizon, in calendar days starting tomorrow (KL).
const SLOT_HORIZON_DAYS = 90;

// Match the Odoo appointment sessions (see odooAppointmentSessions.js).
const SLOT_WINDOW_TEMPLATES = [
  { start: '10:00', end: '13:00' },
  { start: '14:00', end: '17:00' },
  { start: '17:00', end: '19:00' }
];

/** 'YYYY-MM-DD' strings for the `days` calendar days after `todayKey`. */
function horizonDates(todayKey, days = SLOT_HORIZON_DAYS) {
  const today = dayjs(todayKey).startOf('day');
  const dates = [];
  for (let i = 1; i <= days; i++) {
    dates.push(today.add(i, 'day').format('YYYY-MM-DD'));
  }
  return dates;
}

/**
 * Rows to insert: every (date, window) not already covered by `existing`
 * ({ date, time_window_start }[]). Matching is on date + time_window_start.
 */
function buildMissingSlots(dates, existing, now = new Date()) {
  const existingKeys = new Set(existing.map(s => `${s.date}|${s.time_window_start}`));
  const missing = [];
  for (const date of dates) {
    for (const t of SLOT_WINDOW_TEMPLATES) {
      if (existingKeys.has(`${date}|${t.start}`)) continue;
      missing.push({
        date,
        time_window_start: t.start,
        time_window_end: t.end,
        available_flag: true,
        created_at: now
      });
    }
  }
  return missing;
}

module.exports = { SLOT_HORIZON_DAYS, SLOT_WINDOW_TEMPLATES, horizonDates, buildMissingSlots };
