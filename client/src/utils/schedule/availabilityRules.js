// B.1 responsibility: "Check team and truck availability".
//
// Two sources of unavailability:
//   1. trucks.off_day — a free-text weekday name that exists in the schema today
//      (e.g. "Sunday"), applying every week.
//   2. Block-offs — public holidays, leave, MC, events and maintenance, set
//      under Information › Fleet Availability and stored in resource_blockoffs
//      (GET /api/scheduler/blockoffs). The gateway puts them on config.blockoffs.
//      A row can cover the whole fleet, a truck type, one truck or one team, for
//      one or more sessions; matching is shared with utils/fleet/fleetRules.js.

import { parseDateKey } from './weekRange';
import { truckBlock, teamBlock } from '../fleet/fleetRules';

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

const REASON_LABELS = {
  public_holiday: 'Public holiday', leave: 'Leave', mc: 'MC', event: 'Event', maintenance: 'Maintenance', other: 'Blocked',
};

/**
 * Block-off covering this truck or team on this date, if any.
 * With `session` (morning | afternoon | evening) a row blocking that session
 * counts; without it only a full-day row does. `tone` lets a truck match
 * truck-type rows.
 */
export function blockoffFor(resourceType, resourceId, dateKey, blockoffs = [], { tone = null, session } = {}) {
  if (!Array.isArray(blockoffs) || !resourceId) return null;
  if (resourceType === 'truck') return truckBlock({ id: resourceId, tone }, dateKey, session, blockoffs);
  if (resourceType === 'team') return teamBlock(resourceId, dateKey, session, blockoffs);
  return null;
}

function blockoffReason(b) {
  const label = REASON_LABELS[b.reason] ?? 'Blocked';
  return b.note ? `${label}: ${b.note}` : label;
}

/**
 * @returns {{available: boolean, reason: string|null}}
 */
export function truckAvailableOn(truck, dateKey, config = {}, session) {
  if (!truck) return { available: true, reason: null };

  const blocked = blockoffFor('truck', truck.id, dateKey, config.blockoffs, { tone: truck.tone ?? null, session });
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
export function teamAvailableOn(team, dateKey, config = {}, session) {
  if (!team) return { available: true, reason: null };

  const blocked = blockoffFor('team', team.id, dateKey, config.blockoffs, { session });
  if (blocked) return { available: false, reason: blockoffReason(blocked) };
  if (team.availableFlag === false) {
    return { available: false, reason: 'Marked unavailable' };
  }
  return { available: true, reason: null };
}
