// server/services/availabilityService.js
//
// INT-01 (FRD v1.2 §05): the dates and sessions Odoo shows the salesperson.
// View-only, not a reservation. No counts, capacity or IDs leave this module.
// All dates and times are Asia/Kuala_Lumpur, whatever the server timezone is.

const prisma = require('../prismaClient');
const { APPOINTMENT_SESSIONS, sessionForWindow } = require('./odooAppointmentSessions');

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const CUTOFF_HOUR = 17;
const VALIDITY_MINUTES = 15;
const KL_OFFSET = '+08:00';
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

// KL wall clock as 'YYYY-MM-DDTHH:mm:ss'. Malaysia has no DST, so a fixed offset is safe.
const klWallClock = (now) => new Date(now.getTime() + KL_OFFSET_MS).toISOString().slice(0, 19);

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** First date is tomorrow, or the day after from 17:00 onwards. Last date is first + days. */
function dateRange(now, days = DEFAULT_DAYS) {
  const wallClock = klWallClock(now);
  const hour = Number(wallClock.slice(11, 13));
  const first = addDays(wallClock.slice(0, 10), hour < CUTOFF_HOUR ? 1 : 2);
  return { first, last: addDays(first, days) };
}

/** `days` query param: the default when absent, null when invalid or over the cap. */
function parseDays(raw) {
  if (raw === undefined) return DEFAULT_DAYS;
  if (!/^\d+$/.test(String(raw))) return null;
  const days = Number(raw);
  return days >= 1 && days <= MAX_DAYS ? days : null;
}

const isClosed = (slot) =>
  slot.available_flag === false || slot.slot_status === 'completed' || slot.slot_status === 'cancelled';

/**
 * 'date|session' keys that are closed. A session can hold one row per truck, so
 * it closes only when every row for it is closed. No row at all means open.
 */
function closedSessions(slots) {
  const seen = new Set();
  const open = new Set();
  for (const slot of slots) {
    const session = sessionForWindow(slot.time_window_start);
    if (!session) continue;
    const key = `${slot.date}|${session}`;
    seen.add(key);
    if (!isClosed(slot)) open.add(key);
  }
  return new Set([...seen].filter(key => !open.has(key)));
}

function buildAvailability({ now, days = DEFAULT_DAYS, slots = [] }) {
  const { first, last } = dateRange(now, days);
  const closed = closedSessions(slots);
  const dates = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    dates.push({
      date,
      sessions: Object.entries(APPOINTMENT_SESSIONS).map(([session, [start, end]]) => ({
        session,
        start,
        end,
        available: !closed.has(`${date}|${session}`),
      })),
    });
  }
  const validUntil = new Date(now.getTime() + VALIDITY_MINUTES * 60 * 1000);
  return {
    generated_at: `${klWallClock(now)}${KL_OFFSET}`,
    valid_until: `${klWallClock(validUntil)}${KL_OFFSET}`,
    dates,
  };
}

async function getAvailability({ days = DEFAULT_DAYS, now = new Date() } = {}) {
  const { first, last } = dateRange(now, days);
  const slots = await prisma.time_slots.findMany({
    where: { date: { gte: first, lte: last } },
    select: { date: true, time_window_start: true, available_flag: true, slot_status: true },
  });
  return buildAvailability({ now, days, slots });
}

module.exports = { DEFAULT_DAYS, MAX_DAYS, dateRange, parseDays, closedSessions, buildAvailability, getAvailability };
