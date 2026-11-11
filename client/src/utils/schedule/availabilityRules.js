// B.1 responsibility: "Check team and truck availability".
//
// Two sources of unavailability:
//   1. trucks.off_day — a free-text weekday name that exists in the schema today
//      (e.g. "Sunday"), applying every week.
//   2. Block-offs — dated leave/MC/event/maintenance for a truck or team, set by
//      the logistics admin (Meeting §4) and stored in resource_blockoffs
//      (GET /api/scheduler/blockoffs). The gateway puts them on config.blockoffs.

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

const REASON_LABELS = { leave: 'Leave', mc: 'MC', event: 'Event', maintenance: 'Maintenance', other: 'Blocked' };

/** Block-off covering this resource on this date, if any. */
export function blockoffFor(resourceType, resourceId, dateKey, blockoffs = []) {
  if (!Array.isArray(blockoffs)) return null;
  return blockoffs.find(b => b?.resourceType === resourceType
    && b?.resourceId === resourceId
    && dateKey >= b.startDate && dateKey <= b.endDate) ?? null;   // yyyy-mm-dd compares lexically
}

function blockoffReason(b) {
  const label = REASON_LABELS[b.reason] ?? 'Blocked';
  return b.note ? `${label}: ${b.note}` : label;
}

/**
 * @returns {{available: boolean, reason: string|null}}
 */
export function truckAvailableOn(truck, dateKey, config = {}) {
  if (!truck) return { available: true, reason: null };

  const blocked = blockoffFor('truck', truck.id, dateKey, config.blockoffs);
  if (blocked) return { available: false, reason: blockoffReason(blocked) };
  if (truckOffDayMatches(truck, dateKey)) {
    return { available: false, reason: `Off day (${truck.offDay})` };
  }
  return { available: true, reason: null };
}

/**
 * Dated MC/leave comes from block-offs; `available_flag` is the standing switch.
 * @returns {{available: boolean, reason: string|null}}
 */
export function teamAvailableOn(team, dateKey, config = {}) {
  if (!team) return { available: true, reason: null };

  const blocked = blockoffFor('team', team.id, dateKey, config.blockoffs);
  if (blocked) return { available: false, reason: blockoffReason(blocked) };
  if (team.availableFlag === false) {
    return { available: false, reason: 'Marked unavailable' };
  }
  return { available: true, reason: null };
}
