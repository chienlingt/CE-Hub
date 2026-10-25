// B.1 responsibility: "Check truck capacity and vehicle–site compatibility".
//
// Volume is ported from server/routes/orders.js:19-258 — deliberately that copy
// and NOT server/services/scheduler.js's, because routes/orders.js is the
// endpoint the UI actually PATCHes. The two server copies have already drifted;
// if this file follows the wrong one, a dispatcher sees "fits" and the API 409s.
//
// Weight has no server counterpart yet: there is no weight column anywhere, and
// trucks.tone is only a 1/3/5 bucket. Mock products carry weightKg; live ones do
// not, so `weightKnown` is false there and the UI must render "—" rather than a
// fabricated kilogram figure.

import { orderServiceMinutes, DEFAULT_DURATION_CONFIG } from './serviceDuration';
import { slotDurationMinutes } from './slotWindows';
import { ISSUE, makeIssue } from './issueCodes';
import { isActiveStatus } from './orderStatus';

/** Load space of a lorry in cm³, or null when its dimensions are incomplete. */
export function truckVolumeCm3(truck) {
  const l = Number(truck?.lengthCm);
  const w = Number(truck?.widthCm);
  const h = Number(truck?.heightCm);
  if (![l, w, h].every(n => Number.isFinite(n) && n > 0)) return null;
  return l * w * h;
}

/** Packed volume of one order in cm³. Unknown products contribute nothing. */
export function orderVolumeCm3(order, productsById = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.reduce((sum, item) => {
    const p = productsById[item?.productId];
    const l = Number(p?.packageLengthCm);
    const w = Number(p?.packageWidthCm);
    const h = Number(p?.packageHeightCm);
    const qty = Math.max(1, Number(item?.quantity) || 1);
    if (![l, w, h].every(n => Number.isFinite(n) && n > 0)) return sum;
    return sum + l * w * h * qty;
  }, 0);
}

/**
 * Weight of one order.
 * @returns {{kg: number, known: boolean}} `known` is false when ANY line's
 *   product has no recorded weight — so a partial total is never shown as whole.
 */
export function orderWeightKg(order, productsById = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return { kg: 0, known: true };

  let kg = 0;
  let known = true;
  for (const item of items) {
    const p = productsById[item?.productId];
    const w = Number(p?.weightKg);
    const qty = Math.max(1, Number(item?.quantity) || 1);
    if (!Number.isFinite(w) || w <= 0) { known = false; continue; }
    kg += w * qty;
  }
  return { kg, known };
}

const pct = (used, cap) => (Number.isFinite(cap) && cap > 0 ? used / cap : null);

/**
 * Evaluate one slot's load. Pure: pass the orders you want counted, which is
 * how the drag preview shows a PROJECTED load (current orders + the dragged one).
 *
 * @returns {{
 *   doCount, doCap, doPct,
 *   volumeCm3, volumeCapCm3, volumePct,
 *   weightKg, weightCapKg, weightPct, weightKnown,
 *   serviceMinutes, slotMinutes, timePct,
 *   issues: object[], over: string[]
 * }}
 */
export function evaluateSlotCapacity({
  slot,
  orders = [],
  truck = null,
  productsById = {},
  config = {},
}) {
  const doCap = Number.isFinite(config.maxDOsPerSlot) ? config.maxDOsPerSlot : 25;
  const durationConfig = { ...DEFAULT_DURATION_CONFIG, ...(config.duration ?? {}) };

  // Cancelled work neither occupies the lorry nor consumes the crew's day.
  const counted = orders.filter(o => isActiveStatus(o?.status));

  const volumeCm3 = counted.reduce((sum, o) => sum + orderVolumeCm3(o, productsById), 0);
  const volumeCapCm3 = truckVolumeCm3(truck);

  let weightKg = 0;
  let weightKnown = counted.length > 0 || true;
  for (const o of counted) {
    const w = orderWeightKg(o, productsById);
    weightKg += w.kg;
    if (!w.known) weightKnown = false;
  }
  const weightCapKg = Number.isFinite(Number(truck?.maxPayloadKg))
    ? Number(truck.maxPayloadKg)
    : null;

  const serviceMinutes = counted.reduce(
    (sum, o) => sum + orderServiceMinutes(o, productsById, durationConfig).totalMinutes,
    0,
  );
  const rawSlotMinutes = slotDurationMinutes(slot);
  // Buffers eat into the usable window: loading, unloading and the slot buffer.
  const overhead = (Number(config.loadMinutes) || 0)
    + (Number(config.unloadMinutes) || 0)
    + (Number(config.bufferMinutes) || 0);
  const slotMinutes = rawSlotMinutes === null ? null : Math.max(0, rawSlotMinutes - overhead);

  const volumePct = pct(volumeCm3, volumeCapCm3);
  const weightPct = weightKnown ? pct(weightKg, weightCapKg) : null;
  const timePct = pct(serviceMinutes, slotMinutes);
  const doPct = pct(counted.length, doCap);

  const issues = [];
  const over = [];

  // No DO-count check here: the cap is shared by every lorry in a window (see
  // evaluateWindowDoCap). A single lorry is limited only by volume and weight.
  if (volumePct !== null && volumePct > 1) {
    over.push('volume');
    issues.push(makeIssue(ISSUE.TRUCK_VOLUME_EXCEEDED, {
      detail: `${Math.round(volumePct * 100)}% of the lorry’s load space.`,
    }));
  }
  if (weightPct !== null && weightPct > 1) {
    over.push('weight');
    issues.push(makeIssue(ISSUE.TRUCK_TONNAGE_EXCEEDED, {
      detail: `${weightKg.toFixed(1)} kg against a ${weightCapKg} kg payload.`,
    }));
  }
  if (timePct !== null && timePct > 1) {
    over.push('time');
    issues.push(makeIssue(ISSUE.SERVICE_TIME_OVERFLOW, {
      detail: `${Math.round(serviceMinutes)} min of work in a ${slotMinutes} min window.`,
    }));
  }
  if (!truck && counted.length > 0) {
    issues.push(makeIssue(ISSUE.TRUCK_UNASSIGNED));
  }
  if (!weightKnown) {
    issues.push(makeIssue(ISSUE.WEIGHT_DATA_MISSING));
  }

  return {
    doCount: counted.length, doCap, doPct,
    volumeCm3, volumeCapCm3, volumePct,
    weightKg, weightCapKg, weightPct, weightKnown,
    serviceMinutes, slotMinutes, timePct,
    issues, over,
  };
}

/**
 * NIGHT runs only when the warehouse admin starts it, and has no DO cap: each
 * night DO adds one to the day's capacity. AM and PM share the configured cap.
 */
export const isCappedWindow = (windowId) => windowId !== 'night';

/**
 * The DO cap for one date + window, summed across ALL lorries in it. TBM's
 * "25 DOs per slot" is a warehouse-throughput limit, not a per-lorry one; the
 * value is the configurable `maxDOsPerSlot` base limit.
 *
 * @param {object}   input
 * @param {object[]} input.orders   every order in the window, across lanes
 * @param {string}   [input.windowId]  'night' is uncapped
 * @returns {{doCount, doCap, doPct, full: boolean, over: boolean, capped: boolean}}
 */
export function evaluateWindowDoCap({ orders = [], config = {}, windowId = null }) {
  const doCount = orders.filter(o => isActiveStatus(o?.status)).length;
  if (!isCappedWindow(windowId)) {
    return { doCount, doCap: null, doPct: null, full: false, over: false, capped: false };
  }
  const doCap = Number.isFinite(config.maxDOsPerSlot) ? config.maxDOsPerSlot : 25;
  return {
    capped: true,
    doCount,
    doCap,
    doPct: pct(doCount, doCap),
    full: doCount >= doCap,
    over: doCount > doCap,
  };
}

/** cm³ -> m³, for display. */
export const cm3ToM3 = (cm3) => (Number(cm3) || 0) / 1_000_000;

/** Tonnes, for the Excel grid's "2.1/3.0 t" cell footers. */
export const kgToTonnes = (kg) => (Number(kg) || 0) / 1000;
