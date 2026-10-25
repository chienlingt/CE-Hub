// B.1 responsibility: "Check team and truck availability".
//
// Two sources of unavailability:
//   1. trucks.off_day — a free-text weekday name that exists in the schema today
//      (e.g. "Sunday"), applying every week.
//   2. Admin overrides — Mr Lee asked (Meeting §4) to adjust lorry availability
//      himself. There is no table for this yet, so config.fleetOverrides carries
//      date-ranged blocks with a reason; the Phase-3 migration gives it a home.

import { parseDateKey } from './weekRange';

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Does `off_day` (free text, possibly comma-separated) cover this date? */
export function truckOffDayMatches(truck, dateKey) {
  const raw = String(truck?.offDay ?? '').toLowerCase().trim();
  if (!raw) return false;
  const d = parseDateKey(dateKey);
  if (!d) return false;
  const weekday = WEEKDAY_NAMES[d.getDay()];
  // Substring rather than equality: real values include "Sunday",
  // "Sun", and "Saturday & Sunday".
  return raw.includes(weekday) || raw.includes(weekday.slice(0, 3));
}

/** Date-ranged admin override covering this date, if any. */
export function fleetOverrideFor(truckId, dateKey, fleetOverrides = {}) {
  const blocks = fleetOverrides?.[truckId];
  if (!Array.isArray(blocks)) return null;
  return blocks.find(b => {
    const from = b?.from ?? '0000-00-00';
    const to = b?.to ?? '9999-12-31';
    return dateKey >= from && dateKey <= to;   // yyyy-mm-dd compares lexically
  }) ?? null;
}

/**
 * @returns {{available: boolean, reason: string|null}}
 */
export function truckAvailableOn(truck, dateKey, config = {}) {
  if (!truck) return { available: true, reason: null };

  const override = fleetOverrideFor(truck.id, dateKey, config.fleetOverrides);
  if (override) {
    return { available: false, reason: override.reason || 'Blocked by admin' };
  }
  if (truckOffDayMatches(truck, dateKey)) {
    return { available: false, reason: `Off day (${truck.offDay})` };
  }
  return { available: true, reason: null };
}

/**
 * Teams only carry a boolean `available_flag` in the schema — there is no
 * per-date crew roster, so MC/leave cannot be modelled yet.
 * @returns {{available: boolean, reason: string|null}}
 */
export function teamAvailableOn(team, dateKey, config = {}) {
  if (!team) return { available: true, reason: null };

  const override = fleetOverrideFor(team.id, dateKey, config.teamOverrides);
  if (override) {
    return { available: false, reason: override.reason || 'Blocked by admin' };
  }
  if (team.availableFlag === false) {
    return { available: false, reason: 'Marked unavailable' };
  }
  return { available: true, reason: null };
}
