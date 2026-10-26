// B.1 responsibility: "Check building access windows".
//
// §5's constraint table ranks building/property access time as priority 2 — a
// HARD constraint, second only to the customer's booked slot. These are
// properties of the building, not the order, so they persist across every
// future delivery to that address.
//
// Arrival times are projected, not authoritative: real stop sequencing and road
// travel times are B.2's (Chien Ling's). Until B.2 supplies them, the chain uses
// the configurable per-leg estimate from gracePeriod.js — the same fallback the
// engine itself uses. When a slot carries a B.2 route plan, prefer its ETAs.

import { clockToMinutes, minutesToClock } from './slotWindows';
import { orderServiceMinutes } from './serviceDuration';
import { applyGrace, legMinutes, withDefaults } from './gracePeriod';
import { ISSUE, makeIssue } from './issueCodes';

/** The building's own access window, or nulls when unrestricted. */
export function accessWindow(building) {
  return { start: building?.accessStart ?? null, end: building?.accessEnd ?? null };
}

/**
 * Project arrival and finish times for each stop in a slot, in order.
 *
 * @returns {Array<{orderId, arrivalMinutes, finishMinutes, serviceMinutes, travelMinutes, source}>}
 *   `source` is 'b2' when the slot's route plan supplied the ETA, else 'estimate'.
 */
export function projectStopTimes({ slot, orders = [], productsById = {}, config = {} }) {
  const cfg = withDefaults(config);
  const slotStart = clockToMinutes(slot?.start);
  if (slotStart === null) return [];

  // B.2's plan wins when present — it has real road times.
  const b2Etas = new Map();
  const planStops = Array.isArray(slot?.routePlan?.stops) ? slot.routePlan.stops : [];
  for (const stop of planStops) {
    const eta = clockToMinutes(stop?.eta);
    if (stop?.orderId && eta !== null) b2Etas.set(stop.orderId, eta);
  }

  let cursor = slotStart + (Number(cfg.loadMinutes) || 0);
  const result = [];

  orders.forEach((order, index) => {
    const service = orderServiceMinutes(order, productsById, cfg.duration).totalMinutes;

    let travel = 0;
    let arrival;
    const b2 = b2Etas.get(order?.id);

    if (b2 !== undefined) {
      arrival = b2;
      travel = Math.max(0, arrival - cursor);
    } else {
      // No travel before the first stop's departure leg is already counted in
      // loadMinutes; every subsequent stop pays a leg plus the inter-stop buffer.
      travel = legMinutes(cursor, cfg) + (index === 0 ? 0 : Number(cfg.bufferMinutes) || 0);
      arrival = cursor + travel;
    }

    const finish = arrival + service;
    result.push({
      orderId: order?.id,
      arrivalMinutes: arrival,
      finishMinutes: finish,
      arrival: minutesToClock(arrival),
      finish: minutesToClock(finish),
      serviceMinutes: service,
      travelMinutes: Math.round(travel),
      source: b2 !== undefined ? 'b2' : 'estimate',
    });
    cursor = finish;
  });

  return result;
}

/**
 * Does a delivery arriving at `arrivalMinutes` fit this building's rules?
 *
 * @returns {{ok: boolean, issues: object[], window: object}}
 */
export function evaluateAccessWindow({ order, building, arrivalMinutes, finishMinutes, config = {} }) {
  const cfg = withDefaults(config);
  const issues = [];
  const window = applyGrace(accessWindow(building), cfg);

  if (window.hadWindow && Number.isFinite(arrivalMinutes)) {
    const tooEarly = window.start !== null && arrivalMinutes < window.start;
    // Judge the FINISH against the window end: arriving at 16:55 for an hour's
    // install in a building that closes at 17:00 is not actually feasible.
    const endRef = Number.isFinite(finishMinutes) ? finishMinutes : arrivalMinutes;
    const tooLate = window.end !== null && endRef > window.end;

    if (tooEarly || tooLate) {
      const actual = accessWindow(building);
      issues.push(makeIssue(ISSUE.ACCESS_WINDOW_MISS, {
        detail: tooEarly
          ? `Arrives ${minutesToClock(arrivalMinutes)}, building opens ${actual.start}`
          : `Finishes ${minutesToClock(endRef)}, building closes ${actual.end}`,
        arrival: minutesToClock(arrivalMinutes),
        windowStart: actual.start,
        windowEnd: actual.end,
        graceMinutes: window.graceApplied,
      }));
    }
  }

  if (building?.permitRequired) {
    issues.push(makeIssue(ISSUE.PERMIT_REQUIRED, {
      detail: `${building.name ?? 'This building'} requires pre-registration before delivery.`,
      buildingId: building?.id,
    }));
  }

  // Free text in the schema, so it cannot be compared numerically — advisory only.
  if (building?.vehicleSizeLimit) {
    issues.push(makeIssue(ISSUE.VEHICLE_SIZE_ADVISORY, {
      detail: `Recorded limit: “${building.vehicleSizeLimit}”.`,
      buildingId: building?.id,
    }));
  }

  return {
    ok: !issues.some(i => i.severity === 'blocking'),
    issues,
    window,
  };
}

/** Access-window check for every stop in a slot, used by the day view. */
export function evaluateSlotAccessWindows({ slot, orders = [], buildingsById = {}, productsById = {}, config = {} }) {
  const times = projectStopTimes({ slot, orders, productsById, config });
  return orders.map((order, index) => {
    const building = buildingsById[order?.buildingId] ?? null;
    const t = times[index] ?? {};
    const result = evaluateAccessWindow({
      order,
      building,
      arrivalMinutes: t.arrivalMinutes,
      finishMinutes: t.finishMinutes,
      config,
    });
    return { order, building, ...t, ...result };
  });
}
