// Working-week date ranges.
//
// dateKey.js stays the canonical date-key boundary: the server runs
// Asia/Kuala_Lumpur and intelligentRouteOptimizationService.slotDateTime()
// hardcodes +08:00, so toISOString() must never be used to derive a day.
// date-fns is used only for arithmetic on local Date objects.

import { addDays as addDaysFn, startOfWeek, parseISO, format } from 'date-fns';
import { toLocalDateKey } from '../dateKey';

/** Sat/Sun — matching server/services/scheduler.js:332, which skips 6 and 0. */
export const WEEKEND_DAYS = [0, 6];

export function isWeekendDateKey(dateKey) {
  const d = parseDateKey(dateKey);
  return d ? WEEKEND_DAYS.includes(d.getDay()) : false;
}

/** Parse 'YYYY-MM-DD' as a LOCAL date (parseISO on a date-only string is local). */
export function parseDateKey(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const d = parseISO(dateKey);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(dateKey, amount) {
  const d = parseDateKey(dateKey);
  return d ? toLocalDateKey(addDaysFn(d, amount)) : '';
}

/** Monday of the week containing dateKey. */
export function startOfWorkWeek(dateKey) {
  const d = parseDateKey(dateKey);
  return d ? toLocalDateKey(startOfWeek(d, { weekStartsOn: 1 })) : '';
}

/**
 * A contiguous run of days from an anchor.
 *
 * `days` counts only working days when skipWeekend is true, but the returned
 * `dateKeys` still INCLUDES the weekend days in between — the dashboard renders
 * them as a narrow "CLOSED" column, because a silent gap looks like missing data.
 *
 * @returns {{startDateKey, endDateKey, dateKeys: string[], workingDateKeys: string[]}}
 */
export function buildWorkingRange(anchorDateKey, { days = 6, skipWeekend = true } = {}) {
  const start = startOfWorkWeek(anchorDateKey) || toLocalDateKey(anchorDateKey);
  if (!start) {
    return { startDateKey: '', endDateKey: '', dateKeys: [], workingDateKeys: [] };
  }

  const dateKeys = [];
  const workingDateKeys = [];
  let cursor = start;
  let guard = 0;

  // Walk forward until we have `days` working days. Guard against a config
  // where every day is a weekend, which would otherwise spin forever.
  while (workingDateKeys.length < days && guard < 60) {
    const weekend = isWeekendDateKey(cursor);
    if (!weekend || !skipWeekend) {
      workingDateKeys.push(cursor);
      dateKeys.push(cursor);
    } else if (workingDateKeys.length > 0) {
      // Only keep interior weekends, so the range never starts or ends on one.
      dateKeys.push(cursor);
    }
    cursor = addDays(cursor, 1);
    guard += 1;
  }

  // Trim any trailing weekend days we added before hitting the working-day count.
  while (dateKeys.length && isWeekendDateKey(dateKeys[dateKeys.length - 1]) && skipWeekend) {
    dateKeys.pop();
  }

  return {
    startDateKey: dateKeys[0] ?? '',
    endDateKey: dateKeys[dateKeys.length - 1] ?? '',
    dateKeys,
    workingDateKeys,
  };
}

/** 'Mon' */
export const weekdayLabel = (dateKey) => {
  const d = parseDateKey(dateKey);
  return d ? format(d, 'EEE') : '';
};

/** '27/10' */
export const shortDateLabel = (dateKey) => {
  const d = parseDateKey(dateKey);
  return d ? format(d, 'dd/MM') : '';
};

/** 'Monday 27 October' — for aria-labels, which should read as a sentence. */
export const longDateLabel = (dateKey) => {
  const d = parseDateKey(dateKey);
  return d ? format(d, 'EEEE d MMMM') : '';
};
