// Slot time windows — the single source of truth for AM / PM / NIGHT.
//
// There is no slot-type column in the database: a time_slot is just
// (date, time_window_start, time_window_end) as strings. Three places in the
// codebase disagree about what those strings are:
//
//   server/services/scheduler.js:310   08:00-12:00 / 13:00-19:00 / 19:00-21:00  (generated)
//   docs/Final_Scheduler_Design_Proposal.md   10:00-13:00 / 14:00-17:00 / 18:00-21:00
//   server/seedDemo.js                 09:00-13:00 / 14:00-18:00
//
// So classification MUST be threshold-based, not equality-based. The previous
// implementation in utils/driverOrderFilters.js matched against fixed windows
// starting at 09:00 and returned 'other' for anything outside — which meant
// every 08:00 slot the scheduler generates was mis-bucketed.

export const SLOT_WINDOWS = [
  { id: 'am',    label: 'AM',    longLabel: 'Morning',   start: '08:00', end: '12:00' },
  { id: 'pm',    label: 'PM',    longLabel: 'Afternoon', start: '13:00', end: '19:00' },
  { id: 'night', label: 'NIGHT', longLabel: 'Night',     start: '19:00', end: '21:00' },
];

export const SLOT_WINDOW_IDS = SLOT_WINDOWS.map(w => w.id);

/** 'HH:mm' -> minutes since midnight. Returns null for anything unparseable. */
export function clockToMinutes(clock) {
  if (typeof clock !== 'string') return null;
  const m = clock.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/** minutes since midnight -> 'HH:mm'. Clamps into a single day. */
export function minutesToClock(minutes) {
  if (!Number.isFinite(minutes)) return '';
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = String(Math.floor(clamped / 60)).padStart(2, '0');
  const m = String(clamped % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// Boundaries between windows, derived from SLOT_WINDOWS rather than hardcoded.
//
// The rule is "the latest window that has already started": a slot starting
// before PM's start is AM, before NIGHT's start is PM, otherwise NIGHT. Note
// the windows do not tile the day — there is a gap between AM's end (12:00)
// and PM's start (13:00) — so a slot starting at 12:30 classifies as AM. That
// is deliberate and harmless here (no real slot starts in the gap), but it is
// why the boundary is PM_START and not AM's end.
const PM_START = clockToMinutes(SLOT_WINDOWS[1].start);
const NIGHT_START = clockToMinutes(SLOT_WINDOWS[2].start);

/**
 * Classify a slot by its start time. Accepts the raw slot record (snake_case
 * from the API) or a normalized one, or a bare 'HH:mm' string.
 * @returns {'am'|'pm'|'night'|'other'}
 */
export function getSlotWindowId(slotOrClock) {
  const clock = typeof slotOrClock === 'string'
    ? slotOrClock
    : (slotOrClock?.start ?? slotOrClock?.time_window_start ?? null);

  const minutes = clockToMinutes(clock);
  if (minutes === null) return 'other';
  if (minutes < PM_START) return 'am';
  if (minutes < NIGHT_START) return 'pm';
  return 'night';
}

/** The window descriptor for a slot, or null when it can't be classified. */
export function getSlotWindow(slotOrClock) {
  const id = getSlotWindowId(slotOrClock);
  return SLOT_WINDOWS.find(w => w.id === id) ?? null;
}

/** Short label ('AM'), falling back to the raw time when unclassifiable. */
export function windowLabel(windowId) {
  return SLOT_WINDOWS.find(w => w.id === windowId)?.label ?? '—';
}

/** Sort comparator putting AM before PM before NIGHT, unknowns last. */
export function compareWindows(a, b) {
  const order = id => {
    const i = SLOT_WINDOW_IDS.indexOf(id);
    return i === -1 ? SLOT_WINDOW_IDS.length : i;
  };
  return order(a) - order(b);
}

/** Duration of a slot in minutes, from its own start/end. */
export function slotDurationMinutes(slot) {
  const start = clockToMinutes(slot?.start ?? slot?.time_window_start);
  const end = clockToMinutes(slot?.end ?? slot?.time_window_end);
  if (start === null || end === null) return null;
  return Math.max(0, end - start);
}
