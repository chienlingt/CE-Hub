// The B.1 <-> B.2 interface. The only place B.2's data shape is known.
//
// Why this file exists: time_slots.route_plan is an untyped Json column written
// by server/services/intelligentRouteOptimizationService.js:243 with
// algorithm: 'road-time-matrix-multi-objective-2opt'. Nothing pins its field
// names, so any tweak on B.2's side silently breaks B.1's panels. Both modules
// should code to these typedefs.
//
// AGREE WITH CHIEN LING BEFORE WIRING:
//   1. The field names below.
//   2. The backward channel (item 2 at the bottom), which does not exist at
//      all today and is the proposal's §6 central promise.

/**
 * @typedef {Object} B2Stop
 * @property {string} orderId
 * @property {string} [doNo]
 * @property {number} sequence          delivery order, 1-based
 * @property {string} [eta]             'HH:mm', local (Asia/Kuala_Lumpur)
 * @property {string} [serviceEndAt]    'HH:mm'
 * @property {number} [travelSeconds]   from the previous stop
 * @property {number} [distanceMetres]  from the previous stop
 * @property {number} [latitude]
 * @property {number} [longitude]
 */

/**
 * @typedef {Object} B2RoutePlan
 * @property {string} algorithm
 * @property {B2Stop[]} stops           in DELIVERY order, not loading order
 * @property {number} [totalDistanceM]
 * @property {number} [totalDurationS]
 * @property {string} [computedAt]      ISO
 * @property {object} [scoring]
 * @property {boolean} [fallbackUsed]   true when haversine stood in for road times
 */

/**
 * Advisory grouping B.2 offers B.1 BEFORE assignment (proposal §5 Step 2):
 * "these orders are geographically suited to travel together". B.1 may
 * override it — it is optimisation priority 9, never a hard constraint.
 *
 * @typedef {Object} B2GroupingHint
 * @property {string} orderId
 * @property {string[]} travelsWithOrderIds
 * @property {number} [nearestKm]
 * @property {number} [nearestTravelMinutes]
 */

/** Safe read of a slot's route plan. Returns null rather than a partial object. */
export function readRoutePlan(slot) {
  const plan = slot?.routePlan;
  if (!plan || typeof plan !== 'object') return null;
  const stops = Array.isArray(plan.stops) ? plan.stops : [];
  return {
    algorithm: plan.algorithm ?? null,
    stops,
    totalDistanceM: plan.totalDistanceM ?? slot.routeDistanceM ?? null,
    totalDurationS: plan.totalDurationS ?? slot.routeDurationS ?? null,
    computedAt: plan.computedAt ?? slot.routeComputedAt ?? null,
    fallbackUsed: Boolean(plan.fallbackUsed),
    version: slot.routeVersion ?? 0,
    lastReason: slot.routeLastReason ?? null,
  };
}

/** Has B.2 run for this slot? */
export const hasRoutePlan = (slot) =>
  Boolean(slot?.routePlan) || (slot?.routeVersion ?? 0) > 0;

/** B.2's suggested companions for an order, if the snapshot carries any. */
export function readGroupingHint(order) {
  const hint = order?.b2Grouping;
  if (!hint) return null;
  return {
    orderId: order.id,
    travelsWithOrderIds: Array.isArray(hint.travelsWithOrderIds) ? hint.travelsWithOrderIds : [],
    nearestKm: hint.nearestKm ?? null,
    nearestTravelMinutes: hint.nearestTravelMinutes ?? null,
  };
}

/**
 * ---------------------------------------------------------------------------
 * 2. THE BACKWARD CHANNEL — NOT IMPLEMENTED ANYWHERE YET.
 *
 * Proposal §6 requires that when B.2 finds a confirmed trip infeasible (e.g.
 * the last stop cannot be reached before its building closes), it reports that
 * back to B.1 rather than committing a plan that will fail. "An infeasible plan
 * is never committed silently" is the design's central promise, and there is no
 * mechanism for it today.
 *
 * Proposed shape: B.2 writes entries in B.1's own issueCodes vocabulary, so one
 * exception drawer shows both B.1's deferrals and B.2's bounced recommendations.
 *
 * @typedef {Object} B2Infeasibility
 * @property {string} slotId
 * @property {string[]} orderIds        the orders responsible
 * @property {string} code              a utils/schedule/issueCodes value
 * @property {string} detail
 * @property {string} [suggestion]      e.g. 'defer DO-24031 to the afternoon'
 * @property {number} attempt           bounded negotiation: B.1 stops re-asking
 * ---------------------------------------------------------------------------
 */
export function readInfeasibilityReports(slot) {
  const reports = slot?.routePlan?.infeasibilities;
  return Array.isArray(reports) ? reports : [];
}
