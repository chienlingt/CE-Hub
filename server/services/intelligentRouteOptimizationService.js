// B.2 authoritative optimiser. B.1 owns Team + Truck + Time Slot assignment;
// this service only changes stop order, ETA and last-stop-first-loaded sequence.

const prisma = require('../prismaClient');
const {
  geocodeAddress,
  resolveOrderCoords,
  estimateFallbackLeg,
  buildTravelMetricsMatrix,
  computeOrderedRoute,
} = require('./googleRoutingService');

const DEFAULT_WAREHOUSE_ADDRESS = 'Lot 33, Jalan Delima 1/3, Subang Hi-tech Industrial Park, 40000 Shah Alam, Selangor';
const MIN_IMPROVEMENT_SECONDS = 10 * 60;
const MIN_IMPROVEMENT_RATIO = 0.10;
const TERMINAL_STATUSES = ['Delivered', 'Failed', 'Cancelled'];

function shouldApplyDynamicRoute({ dynamic, hasExistingPlan, preventsViolation, savedSeconds, savedRatio }) {
  return !dynamic || !hasExistingPlan || preventsViolation ||
    savedSeconds >= MIN_IMPROVEMENT_SECONDS || savedRatio >= MIN_IMPROVEMENT_RATIO;
}

function slotDateTime(date, clock) {
  return new Date(`${date}T${clock || '00:00'}:00+08:00`);
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

function evaluateSequence(sequence, orders, slot, metrics, departureMs) {
  let currentIndex = 0; // matrix index 0 is origin; order i is i + 1
  let clock = departureMs;
  let travelSeconds = 0;
  let distanceMeters = 0;
  let waitSeconds = 0;
  let lateSeconds = 0;
  let hardViolationSeconds = 0;
  const segments = [];
  const stops = [];

  sequence.forEach((orderIndex, stopIndex) => {
    const matrixIndex = orderIndex + 1;
    const durationSeconds = metrics.durations[currentIndex][matrixIndex] || 0;
    const distanceM = metrics.distances[currentIndex][matrixIndex] || 0;
    clock += durationSeconds * 1000;
    const bounds = accessBounds(orders[orderIndex], slot);
    if (bounds.start && clock < bounds.start) {
      waitSeconds += Math.round((bounds.start - clock) / 1000);
      clock = bounds.start;
    }
    const arrivalMs = clock;
    const preferredMs = orders[orderIndex].scheduled_start_date_time
      ? new Date(orders[orderIndex].scheduled_start_date_time).getTime() : null;
    if (preferredMs && arrivalMs > preferredMs) lateSeconds += Math.round((arrivalMs - preferredMs) / 1000);
    const endMs = arrivalMs + serviceSeconds(orders[orderIndex]) * 1000;
    const accessWindowViolationSeconds = bounds.end && endMs > bounds.end
      ? Math.round((endMs - bounds.end) / 1000) : 0;
    hardViolationSeconds += accessWindowViolationSeconds;

    segments.push({
      from_order_id: stopIndex === 0 ? null : orders[sequence[stopIndex - 1]].id,
      to_order_id: orders[orderIndex].id,
      distance_m: distanceM,
      travel_time_s: durationSeconds,
      departure_at: new Date(arrivalMs - durationSeconds * 1000).toISOString(),
      arrival_at: new Date(arrivalMs).toISOString(),
    });
    stops.push({
      order_id: orders[orderIndex].id,
      eta: new Date(arrivalMs).toISOString(),
      service_end_at: new Date(endMs).toISOString(),
      delivery_sequence: stopIndex + 1,
      loading_sequence: sequence.length - stopIndex,
      access_window_violation_s: accessWindowViolationSeconds,
    });
    travelSeconds += durationSeconds;
    distanceMeters += distanceM;
    clock = endMs;
    currentIndex = matrixIndex;
  });

  // Lexicographic priorities represented by weights: hard feasibility,
  // lateness, travel time, distance, then operational waiting/disruption.
  const score = hardViolationSeconds * 1e9 + lateSeconds * 1e5 + travelSeconds * 100 + distanceMeters + waitSeconds;
  return { sequence, score, travelSeconds, distanceMeters, waitSeconds, lateSeconds, hardViolationSeconds, segments, stops };
}

function nearestNeighbour(orders, metrics) {
  const remaining = orders.map((_, i) => i);
  const result = [];
  let from = 0;
  while (remaining.length) {
    remaining.sort((a, b) => (metrics.durations[from][a + 1] || Infinity) - (metrics.durations[from][b + 1] || Infinity));
    const next = remaining.shift();
    result.push(next);
    from = next + 1;
  }
  return result;
}

function improveTwoOpt(seed, orders, slot, metrics, departureMs) {
  let best = evaluateSequence(seed, orders, slot, metrics, departureMs);
  let changed = true;
  let passes = 0;
  while (changed && passes++ < 5) {
    changed = false;
    for (let i = 0; i < seed.length - 1; i++) {
      for (let j = i + 1; j < seed.length; j++) {
        const candidate = [...best.sequence.slice(0, i), ...best.sequence.slice(i, j + 1).reverse(), ...best.sequence.slice(j + 1)];
        const evaluated = evaluateSequence(candidate, orders, slot, metrics, departureMs);
        if (evaluated.score < best.score) { best = evaluated; changed = true; }
      }
    }
  }
  return best;
}

function selectBestSequence(orders, slot, metrics, departureMs) {
  const current = orders.map((_, i) => i).sort((a, b) =>
    Number(orders[b].truck_loading_sequence || 0) - Number(orders[a].truck_loading_sequence || 0));
  const earliestWindow = orders.map((_, i) => i).sort((a, b) => {
    const aa = accessBounds(orders[a], slot).end || Infinity;
    const bb = accessBounds(orders[b], slot).end || Infinity;
    return aa - bb;
  });
  const seeds = [current, nearestNeighbour(orders, metrics), earliestWindow];
  return seeds.map(seed => improveTwoOpt(seed, orders, slot, metrics, departureMs))
    .sort((a, b) => a.score - b.score)[0];
}

async function loadSlot(slotId) {
  return prisma.time_slots.findUnique({
    where: { id: slotId },
    include: {
      orders: {
        where: { order_status: { notIn: TERMINAL_STATUSES } },
        include: {
          buildings: true,
          customers: true,
          order_products: { include: { products: true } },
        },
      },
    },
  });
}

async function optimiseSlot(slot, { warehouseAddress, warehouseCoords, originCoords, departureAt, reason = 'initial_optimisation', dynamic = false } = {}) {
  const orders = slot.orders || [];
  if (!orders.length) return { applied: false, reason: 'NO_ACTIVE_ORDERS' };
  const origin = originCoords || warehouseCoords || await geocodeAddress(warehouseAddress || DEFAULT_WAREHOUSE_ADDRESS);
  if (!originCoords && !warehouseCoords) {
    const config = await prisma.scheduler_config.findFirst();
    if (config) {
      await prisma.scheduler_config.update({
        where: { id: config.id },
        data: { warehouse_latitude: origin.lat, warehouse_longitude: origin.lon },
      }).catch(() => {});
    }
  }
  const resolved = [];
  for (const order of orders) resolved.push({ ...order, coords: await resolveOrderCoords(order) });
  const points = [origin, ...resolved.map(o => o.coords)];
  let metrics;
  try {
    metrics = await buildTravelMetricsMatrix(points, Math.floor((departureAt ? new Date(departureAt) : new Date()).getTime() / 1000));
  } catch (error) {
    metrics = {
      durations: Array.from({ length: points.length }, () => Array(points.length).fill(null)),
      distances: Array.from({ length: points.length }, () => Array(points.length).fill(null)),
      usedFallback: true,
    };
  }
  fillFallbackMatrices(points, metrics);
  const slotStart = slotDateTime(slot.date, slot.time_window_start).getTime();
  const departureMs = Math.max(departureAt ? new Date(departureAt).getTime() : slotStart, slotStart);
  const best = selectBestSequence(resolved, slot, metrics, departureMs);
  const ordered = best.sequence.map(i => resolved[i]);
  const geometry = await computeOrderedRoute(origin, ordered).catch(() => null);
  const oldPlan = slot.route_plan && typeof slot.route_plan === 'object' ? slot.route_plan : null;
  const activeOrderIds = new Set(resolved.map(o => o.id));
  const oldRemainingSeconds = Array.isArray(oldPlan?.segments)
    ? oldPlan.segments
        .filter(segment => activeOrderIds.has(segment.to_order_id))
        .reduce((sum, segment) => sum + Number(segment.travel_time_s || 0), 0)
    : 0;
  const oldSeconds = oldRemainingSeconds || Number(oldPlan?.total_travel_time_s ?? slot.route_duration_s ?? 0);
  const savedSeconds = oldSeconds > 0 ? oldSeconds - best.travelSeconds : 0;
  const savedRatio = oldSeconds > 0 ? savedSeconds / oldSeconds : 0;
  const preventsViolation = Number(oldPlan?.hard_violation_s || 0) > best.hardViolationSeconds;
  const shouldApply = shouldApplyDynamicRoute({
    dynamic,
    hasExistingPlan: !!oldPlan,
    preventsViolation,
    savedSeconds,
    savedRatio,
  });

  if (!shouldApply) {
    return { applied: false, reason: 'INSIGNIFICANT_IMPROVEMENT', saved_seconds: savedSeconds, saved_ratio: savedRatio };
  }

  const plan = {
    algorithm: 'road-time-matrix-multi-objective-2opt',
    reason,
    generated_at: new Date().toISOString(),
    used_fallback: metrics.usedFallback,
    origin: { address: warehouseAddress || DEFAULT_WAREHOUSE_ADDRESS, latitude: origin.lat, longitude: origin.lon },
    total_distance_m: geometry?.totalDistanceM || best.distanceMeters,
    total_travel_time_s: geometry?.totalDurationSec || best.travelSeconds,
    wait_time_s: best.waitSeconds,
    late_time_s: best.lateSeconds,
    hard_violation_s: best.hardViolationSeconds,
    score: best.score,
    stops: best.stops,
    segments: best.segments,
  };

  await prisma.$transaction([
    ...best.stops.map(stop => prisma.orders.update({
      where: { id: stop.order_id },
      data: {
        truck_loading_sequence: stop.loading_sequence,
        scheduled_start_date_time: new Date(stop.eta),
        scheduled_end_date_time: new Date(stop.service_end_at),
        updated_at: new Date(),
      },
    })),
    ...best.stops.map(stop => prisma.installation_schedules.updateMany({
      where: { order_id: stop.order_id },
      data: { estimated_arrival_time: new Date(stop.eta), updated_at: new Date() },
    })),
    prisma.time_slots.update({
      where: { id: slot.id },
      data: {
        route_polyline: geometry?.polyline || null,
        route_distance_m: plan.total_distance_m,
        route_duration_s: plan.total_travel_time_s,
        route_computed_at: new Date(),
        route_plan: plan,
        route_version: { increment: 1 },
        route_last_reason: reason,
      },
    }),
  ]);
  return { applied: true, plan, saved_seconds: savedSeconds, saved_ratio: savedRatio };
}

async function optimizeScheduledSlot(timeSlotId, options = {}) {
  const slot = await loadSlot(timeSlotId);
  if (!slot) throw new Error('Time slot not found');
  return optimiseSlot(slot, options);
}

async function reorderScheduledSlot(timeSlotId, orderedOrderIds, {
  warehouseAddress = DEFAULT_WAREHOUSE_ADDRESS,
  warehouseCoords = null,
  originCoords = null,
  departureAt = null,
  reason = 'manual_reorder',
  allowAccessWindowViolation = false,
} = {}) {
  const slot = await loadSlot(timeSlotId);
  if (!slot) throw new Error('Time slot not found');
  const orders = slot.orders || [];
  const requested = Array.isArray(orderedOrderIds) ? orderedOrderIds : [];
  const activeIds = new Set(orders.map(order => order.id));
  if (requested.length !== orders.length || new Set(requested).size !== requested.length ||
      requested.some(id => !activeIds.has(id))) {
    throw new Error('Manual order must contain every active stop exactly once');
  }

  const origin = originCoords || warehouseCoords || await geocodeAddress(warehouseAddress);
  const resolved = [];
  for (const order of orders) resolved.push({ ...order, coords: await resolveOrderCoords(order) });
  const points = [origin, ...resolved.map(order => order.coords)];
  let metrics;
  try {
    metrics = await buildTravelMetricsMatrix(
      points,
      Math.floor((departureAt ? new Date(departureAt) : new Date()).getTime() / 1000)
    );
  } catch (error) {
    metrics = {
      durations: Array.from({ length: points.length }, () => Array(points.length).fill(null)),
      distances: Array.from({ length: points.length }, () => Array(points.length).fill(null)),
      usedFallback: true,
    };
  }
  fillFallbackMatrices(points, metrics);

  const indexById = new Map(resolved.map((order, index) => [order.id, index]));
  const sequence = requested.map(id => indexById.get(id));
  const slotStart = slotDateTime(slot.date, slot.time_window_start).getTime();
  const departureMs = Math.max(departureAt ? new Date(departureAt).getTime() : slotStart, slotStart);
  const evaluated = evaluateSequence(sequence, resolved, slot, metrics, departureMs);
  const violations = evaluated.stops
    .filter(stop => stop.access_window_violation_s > 0)
    .map(stop => ({
      order_id: stop.order_id,
      minutes_late: Math.ceil(stop.access_window_violation_s / 60),
      service_end_at: stop.service_end_at,
    }));
  if (violations.length && !allowAccessWindowViolation) {
    return { applied: false, requires_confirmation: true, violations };
  }
  const ordered = sequence.map(index => resolved[index]);
  const geometry = await computeOrderedRoute(origin, ordered).catch(() => null);
  const plan = {
    algorithm: 'manual-road-time-sequence',
    reason,
    generated_at: new Date().toISOString(),
    used_fallback: metrics.usedFallback,
    origin: { address: warehouseAddress, latitude: origin.lat, longitude: origin.lon },
    total_distance_m: geometry?.totalDistanceM || evaluated.distanceMeters,
    total_travel_time_s: geometry?.totalDurationSec || evaluated.travelSeconds,
    wait_time_s: evaluated.waitSeconds,
    late_time_s: evaluated.lateSeconds,
    hard_violation_s: evaluated.hardViolationSeconds,
    score: evaluated.score,
    stops: evaluated.stops,
    segments: evaluated.segments,
  };

  await prisma.$transaction([
    ...evaluated.stops.map(stop => prisma.orders.update({
      where: { id: stop.order_id },
      data: {
        truck_loading_sequence: stop.loading_sequence,
        scheduled_start_date_time: new Date(stop.eta),
        scheduled_end_date_time: new Date(stop.service_end_at),
        updated_at: new Date(),
      },
    })),
    ...evaluated.stops.map(stop => prisma.installation_schedules.updateMany({
      where: { order_id: stop.order_id },
      data: { estimated_arrival_time: new Date(stop.eta), updated_at: new Date() },
    })),
    prisma.time_slots.update({
      where: { id: slot.id },
      data: {
        route_polyline: geometry?.polyline || null,
        route_distance_m: plan.total_distance_m,
        route_duration_s: plan.total_travel_time_s,
        route_computed_at: new Date(),
        route_plan: plan,
        route_version: { increment: 1 },
        route_last_reason: reason,
      },
    }),
  ]);
  return { applied: true, plan };
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
  shouldApplyDynamicRoute,
  evaluateSequence,
  selectBestSequence,
  optimizeScheduledSlot,
  optimizeScheduledSlots,
  reorderScheduledSlot,
};
