// B.2 authoritative optimiser. B.1 owns Team + Truck + Time Slot assignment;
// this service only changes stop order, ETA and last-stop-first-loaded sequence.

const prisma = require('../prismaClient');
const { validCoords } = require('./routeGeocodeCache');
const { SETTINGS_SPEC } = require('./schedulerSettingsSpec');
const {
  geocodeAddress,
  resolveOrderCoords,
  estimateFallbackLeg,
  buildTravelMetricsMatrix,
  computeOrderedRoute,
  predictiveDeparture,
} = require('./googleRoutingService');

const DEFAULT_WAREHOUSE_ADDRESS = 'Lot 33, Jalan Delima 1/3, Subang Hi-tech Industrial Park, 40000 Shah Alam, Selangor';
const MIN_IMPROVEMENT_SECONDS = 10 * 60;
const MIN_IMPROVEMENT_RATIO = 0.10;
const TERMINAL_STATUSES = ['Delivered', 'Failed', 'Cancelled', 'Completed'];

// The gap after each stop comes from the admin setting scheduler_config.grace_minutes
// (Schedule > Settings). The spec default is only a fallback when the setting is
// missing, unreadable or outside its allowed range.
const GRACE_SPEC = SETTINGS_SPEC.grace_minutes;
const DEFAULT_GRACE_SECONDS = GRACE_SPEC.default * 60;
const ORDER_GRACE_SECONDS = DEFAULT_GRACE_SECONDS; // kept for existing imports/tests: the fallback value

function graceSecondsFrom(config) {
  const raw = config?.grace_minutes; // Prisma returns a number; null/blank must not count as 0
  const minutes = typeof raw === 'number' ? raw : NaN;
  return Number.isInteger(minutes) && minutes >= GRACE_SPEC.min && minutes <= GRACE_SPEC.max
    ? minutes * 60 : DEFAULT_GRACE_SECONDS;
}

async function loadGraceSeconds(db = prisma) {
  try {
    return graceSecondsFrom(await db.scheduler_config.findFirst({ select: { grace_minutes: true } }));
  } catch {
    return DEFAULT_GRACE_SECONDS;
  }
}

function shouldApplyDynamicRoute({ dynamic, hasExistingPlan, preventsViolation, savedSeconds, savedRatio }) {
  return !dynamic || !hasExistingPlan || preventsViolation ||
    savedSeconds >= MIN_IMPROVEMENT_SECONDS || savedRatio >= MIN_IMPROVEMENT_RATIO;
}

function slotDateTime(date, clock) {
  return new Date(`${date}T${String(clock || '00:00').slice(0, 5)}:00+08:00`);
}

function serviceSeconds(order) {
  if (order.scheduled_start_date_time && order.scheduled_end_date_time) {
    return Math.max(5 * 60, Math.round((new Date(order.scheduled_end_date_time) - new Date(order.scheduled_start_date_time)) / 1000));
  }
  let minutes = 15;
  for (const line of order.order_products || []) {
    const qty = Math.max(Number(line.quantity || 1), 1);
    const product = line.products || {};
    if (String(line.service_type || '').toLowerCase() === 'delivery_installation') {
      minutes += Number(line.custom_installation_time_max || product.estimated_installation_time_max || 30) * qty;
    }
    if (product.dismantle_required_flag) minutes += Number(product.dismantle_time || 0) * qty;
  }
  return minutes * 60;
}

function accessBounds(order, slot) {
  const start = order.buildings?.access_time_window_start
    ? slotDateTime(slot.date, order.buildings.access_time_window_start).getTime() : null;
  const end = order.buildings?.access_time_window_end
    ? slotDateTime(slot.date, order.buildings.access_time_window_end).getTime() : null;
  return { start, end };
}

function fillFallbackMatrices(points, metrics) {
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) {
        metrics.durations[i][j] = 0;
        metrics.distances[i][j] = 0;
      } else if (metrics.durations[i][j] == null || metrics.distances[i][j] == null) {
        const leg = estimateFallbackLeg(points[i], points[j]);
        metrics.durations[i][j] = Math.round(leg.durationSeconds);
        metrics.distances[i][j] = Math.round(leg.distanceMeters);
        metrics.usedFallback = true;
      }
    }
  }
  return metrics;
}

function evaluateSequence(sequence, orders, slot, metrics, departureMs, graceSeconds = DEFAULT_GRACE_SECONDS) {
  let currentIndex = 0; // matrix index 0 is origin; order i is i + 1
  let clock = departureMs;
  let travelSeconds = 0;
  let distanceMeters = 0;
  let waitSeconds = 0;
  let lateSeconds = 0;
  let hardViolationSeconds = 0;
  let slotViolationSeconds = 0;
  const slotEnd = slot.time_window_end ? slotDateTime(slot.date, slot.time_window_end).getTime() : null;
  const segments = [];
  const stops = [];

  sequence.forEach((orderIndex, stopIndex) => {
    const matrixIndex = orderIndex + 1;
    const durationSeconds = metrics.durations[currentIndex][matrixIndex] || 0;
    const distanceM = metrics.distances[currentIndex][matrixIndex] || 0;
    const actualDeparture = clock;
    clock += durationSeconds * 1000;
    const physicalArrival = clock;
    const bounds = accessBounds(orders[orderIndex], slot);
    const earliestService = Math.max(bounds.start || 0, slotDateTime(slot.date, slot.time_window_start).getTime());
    if (clock < earliestService) {
      waitSeconds += Math.round((earliestService - clock) / 1000);
      clock = earliestService;
    }
    const arrivalMs = clock;
    const preferredMs = orders[orderIndex].scheduled_start_date_time
      ? new Date(orders[orderIndex].scheduled_start_date_time).getTime() : null;
    if (preferredMs && arrivalMs > preferredMs) lateSeconds += Math.round((arrivalMs - preferredMs) / 1000);
    const endMs = arrivalMs + serviceSeconds(orders[orderIndex]) * 1000;
    const accessWindowViolationSeconds = bounds.end && endMs > bounds.end
      ? Math.round((endMs - bounds.end) / 1000) : 0;
    hardViolationSeconds += accessWindowViolationSeconds;
    const readyForNextStop = endMs + graceSeconds * 1000;
    const sessionViolation = slotEnd && readyForNextStop > slotEnd ? Math.round((readyForNextStop - slotEnd) / 1000) : 0;
    slotViolationSeconds = Math.max(slotViolationSeconds, sessionViolation);

    segments.push({
      from_order_id: stopIndex === 0 ? null : orders[sequence[stopIndex - 1]].id,
      to_order_id: orders[orderIndex].id,
      distance_m: distanceM,
      travel_time_s: durationSeconds,
      departure_at: new Date(actualDeparture).toISOString(),
      arrival_at: new Date(physicalArrival).toISOString(),
      service_start_at: new Date(arrivalMs).toISOString(),
      waiting_time_s: Math.round((arrivalMs - physicalArrival) / 1000),
    });
    stops.push({
      order_id: orders[orderIndex].id,
      eta: new Date(arrivalMs).toISOString(),
      service_end_at: new Date(endMs).toISOString(),
      physical_arrival_at: new Date(physicalArrival).toISOString(),
      delivery_sequence: stopIndex + 1,
      loading_sequence: sequence.length - stopIndex,
      access_window_violation_s: accessWindowViolationSeconds,
      session_violation_s: sessionViolation,
    });
    travelSeconds += durationSeconds;
    distanceMeters += distanceM;
    clock = readyForNextStop;
    currentIndex = matrixIndex;
  });

  // Lexicographic priorities represented by weights: hard feasibility,
  // lateness, travel time, distance, then operational waiting/disruption.
  const score = (hardViolationSeconds + slotViolationSeconds) * 1e9 + lateSeconds * 1e5 + travelSeconds * 100 + distanceMeters + waitSeconds;
  return { sequence, score, travelSeconds, distanceMeters, waitSeconds, lateSeconds, hardViolationSeconds, slotViolationSeconds, segments, stops };
}

function nearestNeighbour(orders, metrics) {
  const remaining = orders.map((_, i) => i);
  const result = [];
  let from = 0;
  while (remaining.length) {
    remaining.sort((a, b) => (metrics.durations[from][a + 1] ?? Infinity) - (metrics.durations[from][b + 1] ?? Infinity));
    const next = remaining.shift();
    result.push(next);
    from = next + 1;
  }
  return result;
}

// `fixed` = how many stops at the front must stay where they are (a stop the driver is already serving).
function improveTwoOpt(seed, orders, slot, metrics, departureMs, graceSeconds = DEFAULT_GRACE_SECONDS, fixed = 0) {
  let best = evaluateSequence(seed, orders, slot, metrics, departureMs, graceSeconds);
  let changed = true;
  let passes = 0;
  while (changed && passes++ < 5) {
    changed = false;
    for (let i = fixed; i < seed.length - 1; i++) {
      for (let j = i + 1; j < seed.length; j++) {
        const candidate = [...best.sequence.slice(0, i), ...best.sequence.slice(i, j + 1).reverse(), ...best.sequence.slice(j + 1)];
        const evaluated = evaluateSequence(candidate, orders, slot, metrics, departureMs, graceSeconds);
        if (evaluated.score < best.score) { best = evaluated; changed = true; }
      }
    }
  }
  return best;
}

function selectBestSequence(orders, slot, metrics, departureMs, graceSeconds = DEFAULT_GRACE_SECONDS, pinned = []) {
  const current = orders.map((_, i) => i).sort((a, b) =>
    Number(orders[b].truck_loading_sequence || 0) - Number(orders[a].truck_loading_sequence || 0));
  const earliestWindow = orders.map((_, i) => i).sort((a, b) => {
    const aa = accessBounds(orders[a], slot).end || Infinity;
    const bb = accessBounds(orders[b], slot).end || Infinity;
    return aa - bb;
  });
  // Pinned stops (already in progress) stay first, in their order; only the rest is searched.
  const pin = seed => pinned.length ? [...pinned, ...seed.filter(index => !pinned.includes(index))] : seed;
  const seeds = [current, nearestNeighbour(orders, metrics), earliestWindow].map(pin);
  return seeds.map(seed => improveTwoOpt(seed, orders, slot, metrics, departureMs, graceSeconds, pinned.length))
    .sort((a, b) => a.score - b.score)[0];
}

async function loadSlot(slotId, db = prisma) {
  return db.time_slots.findUnique({
    where: { id: slotId },
    include: {
      orders: {
        where: { order_status: { notIn: TERMINAL_STATUSES } },
        orderBy: { id: 'asc' },
        include: {
          buildings: true,
          customers: true,
          order_products: { include: { products: true } },
        },
      },
    },
  });
}

function currentSequence(orders) {
  return orders.map((_, index) => index).sort((a, b) =>
    Number(orders[b].truck_loading_sequence || 0) - Number(orders[a].truck_loading_sequence || 0));
}

function snapshot(slot) {
  return JSON.stringify([slot.route_version, slot.date, slot.time_window_start, slot.time_window_end,
    slot.departed_at, slot.delivery_team_id, slot.truck_id, slot.orders]);
}

function reviewDetails(evaluation) {
  return evaluation.stops.filter(stop => stop.access_window_violation_s || stop.session_violation_s)
    .map(stop => ({ order_id: stop.order_id, minutes_late: Math.ceil(Math.max(stop.access_window_violation_s, stop.session_violation_s) / 60),
      access_window_violation_s: stop.access_window_violation_s, session_violation_s: stop.session_violation_s,
      service_end_at: stop.service_end_at }));
}

async function persistPlan(slot, plan, stops = [], tail = []) {
  return prisma.$transaction(async tx => {
    // Serialize route commits, then reject calculations based on stale orders,
    // assignments, windows or another route version.
    await tx.$queryRaw`SELECT id FROM time_slots WHERE id = ${slot.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM orders WHERE time_slot_id = ${slot.id}::uuid FOR UPDATE`;
    const fresh = await loadSlot(slot.id, tx);
    if (!fresh || snapshot(fresh) !== snapshot(slot)) {
      return { applied: false, reason: 'STALE_ROUTE', needs_review: true };
    }
    for (const stop of stops) {
      // ETAs live in route_plan; never replace confirmed appointment fields.
      await tx.orders.update({ where: { id: stop.order_id }, data: { truck_loading_sequence: stop.loading_sequence } });
      await tx.installation_schedules.updateMany({ where: { order_id: stop.order_id },
        data: { estimated_arrival_time: new Date(stop.eta), updated_at: new Date() } });
    }
    // Stops left out of the route (unresolved address) load first: they take the lowest loading numbers.
    for (const stop of tail) await tx.orders.update({ where: { id: stop.order_id }, data: { truck_loading_sequence: stop.loading_sequence } });
    await tx.time_slots.update({ where: { id: slot.id }, data: {
      route_plan: plan, route_version: { increment: 1 }, route_last_reason: plan.reason,
      ...(stops.length ? { route_polyline: plan.polyline || null, route_distance_m: plan.total_distance_m,
        route_duration_s: plan.total_travel_time_s, route_computed_at: new Date() } : {}),
    } });
    return { applied: stops.length > 0, needs_review: plan.feasibility === 'needs_review', plan };
  }, { timeout: 20000 });
}

async function markNeedsReview(slot, reason, issues) {
  const plan = { ...(slot.route_plan || {}), reason, feasibility: 'needs_review',
    review: { reason, issues, checked_at: new Date().toISOString() } };
  const result = await persistPlan(slot, plan);
  return { ...result, reason: result.reason || reason, needs_review: true, issues };
}

async function finalEvaluation(sequence, orders, slot, origin, departureMs, matrix, legCache, graceSeconds = DEFAULT_GRACE_SECONDS) {
  const metrics = { durations: matrix.durations.map(row => [...row]), distances: matrix.distances.map(row => [...row]) };
  let clock = departureMs, from = origin, fromIndex = 0, usedFallback = false, staticSeconds = 0;
  for (const index of sequence) {
    const to = orders[index].coords;
    const key = JSON.stringify([from, to, Math.floor(clock / 1000)]);
    let leg = legCache.get(key);
    if (!leg) {
      try {
        const route = await computeOrderedRoute(from, [{ coords: to }], clock);
        if (!route || !Number.isFinite(route.totalDurationSec) || !Number.isFinite(route.totalDistanceM)) throw new Error('Route unavailable');
        leg = { duration: route.totalDurationSec, distance: route.totalDistanceM, static: route.staticDurationSec || 0, fallback: false };
      } catch {
        const estimate = estimateFallbackLeg(from, to);
        leg = { duration: Math.round(estimate.durationSeconds), distance: Math.round(estimate.distanceMeters), static: 0, fallback: true };
      }
      legCache.set(key, leg);
    }
    metrics.durations[fromIndex][index + 1] = leg.duration;
    metrics.distances[fromIndex][index + 1] = leg.distance;
    usedFallback = usedFallback || leg.fallback;
    staticSeconds += leg.static;
    clock += leg.duration * 1000;
    const bounds = accessBounds(orders[index], slot);
    clock = Math.max(clock, bounds.start || 0, slotDateTime(slot.date, slot.time_window_start).getTime());
    clock += (serviceSeconds(orders[index]) + graceSeconds) * 1000;
    from = to; fromIndex = index + 1;
  }
  return { ...evaluateSequence(sequence, orders, slot, metrics, departureMs, graceSeconds), usedFallback, staticSeconds };
}

// No GPS from the phone: the driver is most likely at the stop they just finished, so route from there.
async function lastCompletedStopCoords(slotId) {
  const stop = await prisma.orders.findFirst({
    where: { time_slot_id: slotId, order_status: { in: ['Delivered', 'Failed'] } },
    orderBy: { updated_at: 'desc' },
    include: { buildings: true, customers: true },
  });
  if (!stop) return null;
  try { const coords = await resolveOrderCoords(stop); return validCoords(coords) ? coords : null; } catch { return null; }
}

async function calculateSlot(slot, options = {}, requestedIds = null) {
  const orders = slot.orders || [];
  if (!orders.length) return { applied: false, reason: 'NO_ACTIVE_ORDERS' };
  // A stop the driver is already serving stays first; only the stops after it are re-ordered.
  const isActive = order => ['In Progress', 'Installing', 'Arrived'].includes(order.order_status) ||
    Boolean(order.actual_arrival_date_time && !order.delivery_end_date_time);
  const { warehouseAddress = DEFAULT_WAREHOUSE_ADDRESS, warehouseCoords, originCoords, departureAt, dynamic = false,
    reason = 'initial_optimisation', allowAccessWindowViolation = false, preview = false } = options;
  // A preview only estimates a manual order: it never stores a plan or flags the run for review.
  const review = (why, issues) => preview ? { applied: false, preview: true, needs_review: true, reason: why, issues } : markNeedsReview(slot, why, issues);
  // Admin-configurable gap after each stop (Schedule > Settings); callers may inject it (tests, batches).
  const graceSeconds = options.graceSeconds ?? await loadGraceSeconds();
  const slotStart = slotDateTime(slot.date, slot.time_window_start).getTime();
  const onRoad = Boolean(slot.departed_at) || reason === 'departure_traffic_check';
  const departureMs = onRoad ? (departureAt ? new Date(departureAt).getTime() : Date.now()) : slotStart;
  if (!Number.isFinite(departureMs) || (!onRoad && slotStart < Date.now())) {
    return review('PAST_OR_INVALID_SESSION', []);
  }
  let originFromStop = null;
  if (onRoad && reason !== 'departure_traffic_check' && !originCoords) {
    originFromStop = await lastCompletedStopCoords(slot.id);
    // Nothing completed yet and no location: there is no honest starting point.
    if (!originFromStop) return review('CURRENT_LOCATION_REQUIRED', []);
  }
  let origin;
  try { origin = (onRoad && originCoords) || originFromStop || warehouseCoords || await geocodeAddress(warehouseAddress); }
  catch { return review('WAREHOUSE_COORDINATES_UNAVAILABLE', []); }
  if (!validCoords(origin)) return review('INVALID_ORIGIN_COORDINATES', []);
  const resolved = [], unresolved = [];
  for (const order of orders) {
    try {
      const coords = await resolveOrderCoords(order);
      if (!validCoords(coords)) throw new Error('Invalid coordinates');
      resolved.push({ ...order, coords });
    }
    catch { unresolved.push({ order_id: order.id, reason: 'UNRESOLVED_ADDRESS' }); }
  }
  // A stop with no usable address cannot be routed. The others are still optimised and the
  // unresolved one is flagged for review (a hand-picked order cannot be judged without it).
  if (!resolved.length || (unresolved.length && requestedIds)) return review('UNRESOLVED_ADDRESS', unresolved);
  let matrix;
  try { matrix = await buildTravelMetricsMatrix([origin, ...resolved.map(order => order.coords)], departureMs); }
  catch { matrix = { durations: Array.from({ length: resolved.length + 1 }, () => Array(resolved.length + 1).fill(null)),
    distances: Array.from({ length: resolved.length + 1 }, () => Array(resolved.length + 1).fill(null)), usedFallback: true }; }
  fillFallbackMatrices([origin, ...resolved.map(order => order.coords)], matrix);
  const pinned = currentSequence(resolved).filter(index => isActive(resolved[index]));
  const pinnedIds = new Set(pinned.map(index => resolved[index].id));
  const baselineSequence = [...pinned, ...currentSequence(resolved).filter(index => !pinned.includes(index))];
  const proposedSequence = requestedIds
    ? requestedIds.map(id => resolved.findIndex(order => order.id === id))
    : selectBestSequence(resolved, slot, matrix, departureMs, graceSeconds, pinned).sequence;
  // A hand-picked order may not move the stop that is in progress.
  if (requestedIds && pinned.some((index, k) => proposedSequence[k] !== index)) {
    return preview ? review('ACTIVE_STOP_IN_PROGRESS', []) : { applied: false, reason: 'ACTIVE_STOP_IN_PROGRESS' };
  }
  const cache = new Map();
  if (preview && requestedIds) {
    const estimate = await finalEvaluation(proposedSequence, resolved, slot, origin, departureMs, matrix, cache, graceSeconds);
    return { applied: false, preview: true, used_fallback: Boolean(matrix.usedFallback || estimate.usedFallback),
      total_distance_m: estimate.distanceMeters, total_travel_time_s: estimate.travelSeconds,
      violations: reviewDetails(estimate), stops: estimate.stops, segments: estimate.segments };
  }
  const baseline = await finalEvaluation(baselineSequence, resolved, slot, origin, departureMs, matrix, cache, graceSeconds);
  let best = JSON.stringify(baselineSequence) === JSON.stringify(proposedSequence) ? baseline
    : await finalEvaluation(proposedSequence, resolved, slot, origin, departureMs, matrix, cache, graceSeconds);
  // A matrix candidate may be worse once leg departures include service/wait.
  if (!requestedIds && best.score > baseline.score) best = baseline;
  const violations = reviewDetails(best);
  if (violations.length && requestedIds && !allowAccessWindowViolation) {
    return { applied: false, requires_confirmation: true, needs_review: true, violations };
  }
  // A stop already in progress cannot be moved, so its own lateness does not stop the rest being optimised.
  const blocking = violations.filter(violation => !pinnedIds.has(violation.order_id));
  if (blocking.length && !requestedIds) return review('NO_FEASIBLE_SEQUENCE', blocking);
  const savedSeconds = baseline.travelSeconds - best.travelSeconds;
  const savedRatio = baseline.travelSeconds > 0 ? savedSeconds / baseline.travelSeconds : 0;
  const preventsViolation = baseline.hardViolationSeconds + baseline.slotViolationSeconds > best.hardViolationSeconds + best.slotViolationSeconds;
  // Do not claim a saving by comparing road data with straight-line estimates.
  if (dynamic && !requestedIds && baseline.usedFallback !== best.usedFallback) {
    return { applied: false, reason: 'INCOMPARABLE_TRAFFIC_ESTIMATES' };
  }
  if (!requestedIds && !shouldApplyDynamicRoute({ dynamic, hasExistingPlan: !!slot.route_plan, preventsViolation, savedSeconds, savedRatio })) {
    // Refresh timing without sequence churn when the recommended route is kept.
    best = baseline;
  }
  // Loading numbers stay unique: unresolved stops sit at the end of the route, so they load first.
  const tailOrders = orders.filter(order => unresolved.some(item => item.order_id === order.id))
    .sort((a, b) => Number(a.truck_loading_sequence || 0) - Number(b.truck_loading_sequence || 0));
  const tail = tailOrders.map((order, index) => ({ order_id: order.id, loading_sequence: index + 1 }));
  const stops = best.stops.map(stop => ({ ...stop, loading_sequence: stop.loading_sequence + tail.length }));
  const usedFallback = matrix.usedFallback || best.usedFallback;
  const geometry = usedFallback ? null : await computeOrderedRoute(origin, best.sequence.map(index => resolved[index]), departureMs).catch(() => null);
  const plan = {
    algorithm: requestedIds ? 'manual-road-time-sequence' : 'road-time-matrix-multi-objective-2opt', reason,
    generated_at: new Date().toISOString(), used_fallback: usedFallback,
    traffic_model: usedFallback ? null : 'BEST_GUESS',
    traffic_departure_at: new Date(predictiveDeparture(departureMs)).toISOString(),
    traffic_basis: onRoad ? 'actual_departure' : 'session_forecast',
    origin: { address: onRoad ? (originFromStop ? 'Last completed stop (location unavailable)' : 'Current position') : warehouseAddress, latitude: origin.lat, longitude: origin.lon },
    total_distance_m: best.distanceMeters, total_travel_time_s: best.travelSeconds,
    static_travel_time_s: usedFallback ? null : best.staticSeconds,
    predicted_traffic_delay_s: usedFallback ? null : Math.max(0, best.travelSeconds - best.staticSeconds),
    wait_time_s: best.waitSeconds, late_time_s: best.lateSeconds, hard_violation_s: best.hardViolationSeconds,
    session_violation_s: best.slotViolationSeconds, feasibility: violations.length || unresolved.length ? 'needs_review' : 'feasible',
    ...(unresolved.length ? { review: { reason: 'UNRESOLVED_ADDRESS', issues: unresolved, checked_at: new Date().toISOString() } } : {}),
    violations, manual_override: Boolean(requestedIds && violations.length && allowAccessWindowViolation),
    score: best.score, stops, segments: best.segments, polyline: geometry?.polyline || null,
  };
  return { ...await persistPlan(slot, plan, stops, tail), saved_seconds: savedSeconds, saved_ratio: savedRatio,
    ...(unresolved.length ? { reason: 'UNRESOLVED_ADDRESS', issues: unresolved } : {}) };
}

async function optimizeScheduledSlot(timeSlotId, options = {}) {
  const slot = await loadSlot(timeSlotId);
  if (!slot) throw new Error('Time slot not found');
  return calculateSlot(slot, options);
}

async function reorderScheduledSlot(timeSlotId, orderedOrderIds, options = {}) {
  const slot = await loadSlot(timeSlotId);
  if (!slot) throw new Error('Time slot not found');
  const ids = slot.orders.map(order => order.id), requested = Array.isArray(orderedOrderIds) ? orderedOrderIds : [];
  if (requested.length !== ids.length || new Set(requested).size !== ids.length || requested.some(id => !ids.includes(id))) {
    throw new Error('Manual order must contain every active stop exactly once');
  }
  return calculateSlot(slot, { ...options, reason: options.reason || 'manual_reorder' }, requested);
}

async function optimizeScheduledSlots({ timeSlotIds = [], warehouseAddress = DEFAULT_WAREHOUSE_ADDRESS, warehouseCoords = null } = {}) {
  const results = [];
  for (const id of timeSlotIds) {
    try { results.push({ time_slot_id: id, ...(await optimizeScheduledSlot(id, { warehouseAddress, warehouseCoords })) }); }
    catch (error) { results.push({ time_slot_id: id, applied: false, reason: error.message }); }
  }
  return results;
}

module.exports = {
  DEFAULT_WAREHOUSE_ADDRESS,
  MIN_IMPROVEMENT_SECONDS,
  MIN_IMPROVEMENT_RATIO,
  ORDER_GRACE_SECONDS,
  DEFAULT_GRACE_SECONDS,
  graceSecondsFrom,
  loadGraceSeconds,
  shouldApplyDynamicRoute,
  evaluateSequence,
  selectBestSequence,
  optimizeScheduledSlot,
  optimizeScheduledSlots,
  reorderScheduledSlot,
};
