// Grace period, buffers, and the rush-hour traffic matrix.
//
// The proposal (§2) describes "a grace-period window to absorb the gap between
// when a route is scheduled and when it is actually driven" — Dr Chiew's point
// that evening-peak traffic at the 5pm planning cutoff looks worse than the
// traffic actually experienced next morning.
//
// The default traffic bands come from server/services/routingService.js:18,
// which is the richest time-of-day model in the codebase and is currently
// ORPHANED — the live scheduler uses a flat TRAFFIC_MULTIPLIER = 1.5
// (server/services/scheduler.js:16) instead.

import { clockToMinutes } from './slotWindows';

/** Kuala Lumpur peak bands, from the orphaned routingService.getTrafficMultiplier. */
export const DEFAULT_TRAFFIC_MATRIX = [
  { id: 'am-peak',  label: 'Morning peak',   fromHour: 7,  toHour: 9,  multiplier: 1.6 },
  { id: 'midday',   label: 'Lunch',          fromHour: 12, toHour: 14, multiplier: 1.3 },
  { id: 'pm-peak',  label: 'Evening peak',   fromHour: 17, toHour: 19, multiplier: 1.7 },
  { id: 'evening',  label: 'Late evening',   fromHour: 20, toHour: 22, multiplier: 1.2 },
];

export const DEFAULT_SCHEDULE_CONFIG = {
  graceMinutes: 15,
  bufferMinutes: 10,
  loadMinutes: 20,
  unloadMinutes: 10,
  maxDOsPerSlot: 25,
  planningCutoff: '17:00',
  // Per-leg travel estimate used until B.2 supplies real road times. Matches
  // the engine's own fallback of scaleTravelMinutes(17) in scheduler.js:779.
  defaultLegMinutes: 17,
  trafficMatrix: DEFAULT_TRAFFIC_MATRIX,
  defaultMultiplier: 1.1,
  fleetOverrides: {},
  teamOverrides: {},
  duration: undefined,
  // Honest default: no scheduler config is persisted server-side yet (the
  // scheduler_config columns do not exist), so claiming otherwise before the
  // gateway answers would mislead. The live gateway overrides this.
  configScope: 'local',
};

/** Multiplier for a given hour of the day. */
export function trafficMultiplier(hour, config = DEFAULT_SCHEDULE_CONFIG) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return config.defaultMultiplier ?? 1;
  const matrix = Array.isArray(config.trafficMatrix) ? config.trafficMatrix : [];
  const band = matrix.find(b => h >= Number(b.fromHour) && h < Number(b.toHour));
  return band ? Number(band.multiplier) : (config.defaultMultiplier ?? 1);
}

/** Travel minutes for one leg departing at `atMinutes` past midnight. */
export function legMinutes(atMinutes, config = DEFAULT_SCHEDULE_CONFIG, baseMinutes = null) {
  const base = Number.isFinite(baseMinutes) ? baseMinutes : (config.defaultLegMinutes ?? 17);
  const hour = Math.floor((Number(atMinutes) || 0) / 60);
  return base * trafficMultiplier(hour, config);
}

/**
 * Widen a building's access window by the grace period. Returns minutes past
 * midnight, or nulls when the building records no window (meaning unrestricted).
 *
 * Grace is applied symmetrically: it is tolerance on the projected arrival, and
 * widening the window is the equivalent, simpler formulation.
 */
export function applyGrace(window, config = DEFAULT_SCHEDULE_CONFIG) {
  const grace = Math.max(0, Number(config.graceMinutes) || 0);
  const start = clockToMinutes(window?.start);
  const end = clockToMinutes(window?.end);
  return {
    start: start === null ? null : start - grace,
    end: end === null ? null : end + grace,
    graceApplied: grace,
    hadWindow: start !== null || end !== null,
  };
}

/** Merge a partial config over the defaults, keeping nested duration intact. */
export function withDefaults(config = {}) {
  return {
    ...DEFAULT_SCHEDULE_CONFIG,
    ...config,
    trafficMatrix: config.trafficMatrix ?? DEFAULT_SCHEDULE_CONFIG.trafficMatrix,
    fleetOverrides: config.fleetOverrides ?? {},
    teamOverrides: config.teamOverrides ?? {},
  };
}
