// server/services/googleRoutingService.js
//
// Route Optimisation (B.2) — Google Maps API implementation.
//
// Supplies clustering estimates and the forecast leg requests used by B.2.
// Final old/new route evaluation makes additional calls at predicted leg
// departures; only address geocoding is reused through the durable cache.
//
//   1. Convert a delivery address into GPS coordinates (Geocoding API)
//   2. Group nearby orders by real road travel time (Routes API, computeRouteMatrix)
//   3. Find the most efficient delivery sequence per group (Routes API)
//   4. Calculate distance/time for each leg of the journey (Routes API)
//   5. Work out the truck loading sequence (reverse of delivery order)
//   6. Fall back to straight-line distance if Google is unreachable
//
// Requires GOOGLE_MAPS_SERVER_KEY in server/.env. If unset, every function
// can fall back to Haversine only when valid coordinates are already known.
// Missing coordinates must be resolved or explicitly flagged for review.

const axios  = require('axios');
const { geocodeCachedAddress, readCachedAddress, normalizeAddress, validCoords } = require('./routeGeocodeCache');

// The legacy Distance Matrix API is no longer enabled for new/changed Google projects (REQUEST_DENIED), so the
// matrices use the Routes API instead. Same pricing unit (per origin x destination element).
const ROUTE_MATRIX_URL  = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const ROUTES_URL        = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const NEARBY_TRAVEL_MINUTES = 20;
const GOOGLE_TRAFFIC_MODEL = 'BEST_GUESS';

// Google only accepts driving departure times that are now or in the future.
// A small buffer prevents a timestamp becoming "past" while the request is in flight.
function predictiveDeparture(departureTime) {
  const requested = departureTime === 'now'
    ? Date.now()
    : new Date(typeof departureTime === 'number' && departureTime < 1e12
      ? departureTime * 1000
      : departureTime).getTime();
  return Math.max(Number.isFinite(requested) ? requested : Date.now(), Date.now() + 60_000);
}

function apiKey() {
  return process.env.GOOGLE_MAPS_SERVER_KEY || null;
}

// ── 6. Haversine fallback (no API call) ────────────────────────────────────

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// +40% for real road winding, ~30km/h conservative urban delivery speed
function estimateFallbackLeg(a, b) {
  const straightKm = haversineKm(a, b);
  const roadKm      = straightKm * 1.4;
  const seconds     = (roadKm / 30) * 3600;
  return { distanceMeters: roadKm * 1000, durationSeconds: seconds };
}

// ── 1. Geocoding (with buildings.latitude/longitude cache) ─────────────────

function getOrderAddress(order) {
  return [
    order.remarks_delivery_address || order.delivery_address || order.original_delivery_address || order.customers?.address,
    order.delivery_city || order.customers?.city,
    order.delivery_postcode || order.customers?.postcode || order.buildings?.postal_code,
    order.delivery_state || order.customers?.state,
  ].filter(Boolean).join(', ') || order.buildings?.building_name || 'UNKNOWN';
}

async function geocodeAddress(address) {
  return geocodeCachedAddress(address);
}

/**
 * Resolve an exact full address through the expiring durable cache. Legacy
 * building coordinates require an exact address match, not just a name.
 */
async function resolveOrderCoords(order) {
  const cached = await cachedOrderCoords(order);
  if (cached) return cached;
  return geocodeAddress(getOrderAddress(order));
}

async function cachedOrderCoords(order) {
  const building = order.buildings;

  // Never reuse a building-name match for an unrelated/changed street address.
  if (building?.address && normalizeAddress(building.address) === normalizeAddress(getOrderAddress(order)) && validCoords({ lat: building.latitude, lon: building.longitude })) {
    return { lat: Number(building.latitude), lon: Number(building.longitude) };
  }

  return readCachedAddress(getOrderAddress(order));
}

// ── 2. Group nearby orders by real travel time (Routes API matrix, batched) ──

const MATRIX_FIELDS = 'originIndex,destinationIndex,duration,distanceMeters,status,condition';
const matrixWaypoint = c => ({ waypoint: { location: { latLng: { latitude: c.lat, longitude: c.lon } } } });
// A usable element has a route and no error status. `duration` is a string such as "1104s".
const matrixElementOk = el => el && el.condition === 'ROUTE_EXISTS' && !(el.status && el.status.code);
const matrixSeconds = value => { const n = parseFloat(String(value)); return Number.isFinite(n) ? Math.round(n) : null; };

// One computeRouteMatrix request. Elements come back with their own indexes (not necessarily in order).
async function routeMatrixRequest(key, origins, destinations, extra) {
  const res = await axios.post(ROUTE_MATRIX_URL, {
    origins: origins.map(matrixWaypoint),
    destinations: destinations.map(matrixWaypoint),
    travelMode: 'DRIVE',
    ...extra,
  }, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': MATRIX_FIELDS, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  if (!Array.isArray(res.data)) throw new Error('Routes matrix error: unexpected response');
  return res.data;
}

/**
 * One Routes matrix call for the whole candidate set (NxN), instead of
 * the old pattern of one call per pair — this is the single biggest cost
 * lever versus the previous per-pair OSRM approach.
 */
async function buildTravelTimeMatrix(coordsList, departureTime = 'now') {
  if (!apiKey() || !coordsList.length) return null;
  const metrics = await buildTravelMetricsMatrix(coordsList, departureTime);
  return metrics.durations;
}

/** Road-time and road-distance matrices. Traffic-aware matrix calls are kept to
 * 100 elements per request (10 x 10 tiles), so larger capacity-driven runs are
 * transparently tiled instead of imposing an artificial stop limit. */
async function buildTravelMetricsMatrix(coordsList, departureTime = 'now') {
  const key = apiKey();
  const size = coordsList.length;
  const durations = Array.from({ length: size }, () => Array(size).fill(null));
  const distances = Array.from({ length: size }, () => Array(size).fill(null));
  if (!key || size === 0) return { durations, distances, usedFallback: true };

  // Traffic-aware requests stay within 100 elements (origins x destinations): 10 x 10 tiles.
  const chunkSize = 10;
  const departureTimeIso = new Date(predictiveDeparture(departureTime)).toISOString();
  for (let oi = 0; oi < size; oi += chunkSize) {
    for (let di = 0; di < size; di += chunkSize) {
      const origins = coordsList.slice(oi, oi + chunkSize);
      const destinations = coordsList.slice(di, di + chunkSize);
      const elements = await routeMatrixRequest(key, origins, destinations, {
        // Google rejects trafficModel unless the preference is TRAFFIC_AWARE_OPTIMAL; plain TRAFFIC_AWARE already uses BEST_GUESS.
        routingPreference: 'TRAFFIC_AWARE',
        departureTime: departureTimeIso,
      });
      for (const el of elements) {
        if (!matrixElementOk(el)) continue;
        const r = oi + el.originIndex, c = di + el.destinationIndex;
        if (!(r >= oi && r < oi + origins.length && c >= di && c < di + destinations.length)) continue;
        durations[r][c] = matrixSeconds(el.duration);
        distances[r][c] = Number.isFinite(el.distanceMeters) ? el.distanceMeters : null;
      }
    }
  }
  return { durations, distances, usedFallback: false };
}

async function computeOrderedRoute(originCoords, orderedStops, departureTime = 'now') {
  const key = apiKey();
  if (!key || orderedStops.length === 0) return null;
  // Routes API waypoint limits vary by SKU. Matrix/optimisation still works
  // for larger capacity-driven runs; omit geometry rather than failing them.
  if (orderedStops.length > 25) return null;

  const destination = orderedStops[orderedStops.length - 1].coords;
  const intermediates = orderedStops.slice(0, -1).map(o => ({
    location: { latLng: { latitude: o.coords.lat, longitude: o.coords.lon } },
  }));
  const body = {
    origin: { location: { latLng: { latitude: originCoords.lat, longitude: originCoords.lon } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lon } } },
    intermediates,
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
    trafficModel: GOOGLE_TRAFFIC_MODEL,
    departureTime: new Date(predictiveDeparture(departureTime)).toISOString(),
    polylineQuality: 'OVERVIEW',
  };
  const res = await axios.post(ROUTES_URL, body, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline',
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  const route = res.data?.routes?.[0];
  if (!route) return null;
  return {
    polyline: route.polyline?.encodedPolyline || null,
    totalDistanceM: route.distanceMeters || 0,
    totalDurationSec: parseInt(route.duration, 10) || 0,
    staticDurationSec: parseInt(route.staticDuration, 10) || 0,
    trafficDelaySec: Math.max(0, (parseInt(route.duration, 10) || 0) - (parseInt(route.staticDuration, 10) || 0)),
    trafficModel: GOOGLE_TRAFFIC_MODEL,
  };
}

async function groupNearbyOrders(ordersWithCoords, departureTime) {
  if (ordersWithCoords.length <= 1) return [ordersWithCoords];

  let matrix;
  try {
    matrix = await buildTravelTimeMatrix(ordersWithCoords.map(o => o.coords), departureTime);
  } catch (err) {
    console.warn('[GoogleRouting] Routes matrix failed, falling back to Haversine clustering:', err.message);
    matrix = null;
  }

  const travelMinutes = (i, j) => {
    if (matrix?.[i]?.[j] != null) return matrix[i][j] / 60;
    const { durationSeconds } = estimateFallbackLeg(ordersWithCoords[i].coords, ordersWithCoords[j].coords);
    return durationSeconds / 60;
  };

  const clockMinutes = value => {
    if (!value || !/^\d{1,2}:\d{2}/.test(value)) return null;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  };
  const feasibleTogether = (a, b) => {
    const aStart = clockMinutes(a.buildings?.access_time_window_start);
    const aEnd = clockMinutes(a.buildings?.access_time_window_end);
    const bStart = clockMinutes(b.buildings?.access_time_window_start);
    const bEnd = clockMinutes(b.buildings?.access_time_window_end);
    if ([aStart, aEnd, bStart, bEnd].some(v => v == null)) return true;
    return Math.max(aStart, bStart) <= Math.min(aEnd, bEnd);
  };

  // Complete-link clustering: every new stop must be road-time-near every
  // existing stop. This avoids the chain effect of anchor-only clustering
  // where a cluster can gradually spread far beyond the threshold.
  const clusters = [];
  ordersWithCoords.forEach((order, i) => {
    const cluster = clusters.find(c => c.indexes.every(j =>
      (travelMinutes(j, i) <= NEARBY_TRAVEL_MINUTES || travelMinutes(i, j) <= NEARBY_TRAVEL_MINUTES) &&
      feasibleTogether(ordersWithCoords[j], order)
    ));
    if (cluster) {
      cluster.orders.push(order);
      cluster.indexes.push(i);
    } else {
      clusters.push({ indexes: [i], orders: [order] });
    }
  });

  return clusters.map(c => c.orders);
}

// ── 3 & 4. Sequence + per-leg distance/time (Routes API, one call per cluster) ──

function decodePolylinePlaceholder(encoded) {
  // Kept as the raw encoded string — the frontend Google Maps JS SDK can
  // decode it directly via google.maps.geometry.encoding.decodePath(),
  // so no server-side decoding is needed.
  return encoded || null;
}

async function computeClusterRoute(warehouseCoords, clusterOrders) {
  const key = apiKey();
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not configured');
  const traffic = { routingPreference: 'TRAFFIC_AWARE_OPTIMAL', trafficModel: GOOGLE_TRAFFIC_MODEL,
    departureTime: new Date(predictiveDeparture(clusterOrders[0]?.preferred_timeslot || 'now')).toISOString() };

  if (clusterOrders.length === 1) {
    // Single stop — no waypoint optimisation needed, just warehouse -> stop.
    const body = {
      origin:      { location: { latLng: { latitude: warehouseCoords.lat, longitude: warehouseCoords.lon } } },
      destination: { location: { latLng: { latitude: clusterOrders[0].coords.lat, longitude: clusterOrders[0].coords.lon } } },
      travelMode:  'DRIVE',
      polylineQuality: 'OVERVIEW',
      ...traffic,
    };
    const res = await axios.post(ROUTES_URL, body, {
      headers: {
        'X-Goog-Api-Key':    key,
        'X-Goog-FieldMask':  'routes.legs,routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        'Content-Type':      'application/json',
      },
      timeout: 10000,
    });
    const route = res.data?.routes?.[0];
    if (!route) throw new Error('Routes API returned no route');

    return {
      orderSequence:   [0],
      legDurationsSec: [parseInt(route.duration, 10) || 0],
      legDistancesM:   [route.distanceMeters || 0],
      totalDistanceM:  route.distanceMeters || 0,
      totalDurationSec: parseInt(route.duration, 10) || 0,
      polyline:        decodePolylinePlaceholder(route.polyline?.encodedPolyline),
    };
  }

  // Multi-stop: warehouse -> intermediates (optimised) -> last stop as destination.
  // The last order is used as `destination`; all others are `intermediates` so
  // Google is free to reorder them for the shortest total path.
  const last = clusterOrders[clusterOrders.length - 1];
  const intermediates = clusterOrders.slice(0, -1);

  const body = {
    origin:      { location: { latLng: { latitude: warehouseCoords.lat, longitude: warehouseCoords.lon } } },
    destination: { location: { latLng: { latitude: last.coords.lat, longitude: last.coords.lon } } },
    intermediates: intermediates.map(o => ({
      location: { latLng: { latitude: o.coords.lat, longitude: o.coords.lon } },
    })),
    travelMode:            'DRIVE',
    optimizeWaypointOrder: true,
    polylineQuality:       'OVERVIEW',
    routingPreference: 'TRAFFIC_AWARE',
    departureTime: traffic.departureTime,
  };

  const res = await axios.post(ROUTES_URL, body, {
    headers: {
      'X-Goog-Api-Key':   key,
      'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.legs,routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      'Content-Type':     'application/json',
    },
    timeout: 15000,
  });

  const route = res.data?.routes?.[0];
  if (!route) throw new Error('Routes API returned no route');

  // optimizedIntermediateWaypointIndex maps intermediates[] -> visiting order.
  // The final stop (destination) is always visited last.
  const optimizedIntermediateOrder = route.optimizedIntermediateWaypointIndex ?? intermediates.map((_, i) => i);
  const orderSequence = [...optimizedIntermediateOrder, intermediates.length]; // append destination index

  const legs = route.legs || [];
  const legDurationsSec = legs.map(l => parseInt(l.duration, 10) || 0);
  const legDistancesM   = legs.map(l => l.distanceMeters || 0);

  return {
    orderSequence,
    legDurationsSec,
    legDistancesM,
    totalDistanceM:   route.distanceMeters || 0,
    totalDurationSec: parseInt(route.duration, 10) || 0,
    polyline:         decodePolylinePlaceholder(route.polyline?.encodedPolyline),
  };
}

// ── 5. Truck loading sequence (pure logic, no API) ─────────────────────────

function assignLoadingSequence(orderedList) {
  orderedList.forEach((order, deliveryIndex) => {
    order.truck_loading_sequence = orderedList.length - deliveryIndex;
  });
  return orderedList;
}

// ── Fallback path: nearest-neighbour + Haversine, used when Google errors ──

function fallbackSequenceCluster(warehouseCoords, clusterOrders) {
  const remaining = [...clusterOrders];
  const ordered   = [];
  let current     = warehouseCoords;
  const legDurationsSec = [];
  const legDistancesM   = [];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestKm  = haversineKm(current, remaining[0].coords) * 1.4;
    for (let i = 1; i < remaining.length; i++) {
      const km = haversineKm(current, remaining[i].coords) * 1.4;
      if (km < bestKm) { bestKm = km; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    const { distanceMeters, durationSeconds } = estimateFallbackLeg(current, next.coords);
    legDistancesM.push(distanceMeters);
    legDurationsSec.push(durationSeconds);
    ordered.push(next);
    current = next.coords;
  }

  return {
    ordered,
    legDurationsSec,
    legDistancesM,
    totalDistanceM:   legDistancesM.reduce((a, b) => a + b, 0),
    totalDurationSec: legDurationsSec.reduce((a, b) => a + b, 0),
    polyline:         null, // no geometry available without a real routing call
  };
}

// ── Main entry point — called once per scheduler run by scheduler.js ───────

/**
 * B.1 -> B.2 contract.
 *
 * @param {Array} orders            - pending orders (with buildings/customers included)
 * @param {string} warehouseAddress - scheduler_config.warehouse_address
 * @returns {Promise<Array<{
 *   orders: Array,                 // in visiting order, each with truck_loading_sequence set
 *   legDurationsSec: number[],     // travel time for each leg, warehouse -> stop1 -> stop2 ...
 *   legDistancesM: number[],
 *   totalDistanceM: number,
 *   totalDurationSec: number,
 *   polyline: string|null,         // encoded polyline for the driver Route tab map
 *   usedFallback: boolean,
 * }>>}
 */
async function planRoutes(orders, warehouseAddress) {
  if (!orders.length) return [];

  let warehouseCoords;
  try {
    warehouseCoords = await geocodeAddress(warehouseAddress);
  } catch (err) {
    console.warn('[GoogleRouting] Warehouse geocode failed, planning aborted for this run:', err.message);
    return orders.map(order => ({
      orders: assignLoadingSequence([order]),
      legDurationsSec: [17 * 60],
      legDistancesM:   [0],
      totalDistanceM:  0,
      totalDurationSec: 17 * 60,
      polyline: null,
      usedFallback: true,
    }));
  }

  // 1. Geocode every order (cached — most calls should hit buildings.latitude/longitude)
  const ordersWithCoords = [];
  const unresolved = [];
  for (const order of orders) {
    try {
      const coords = await resolveOrderCoords(order);
      ordersWithCoords.push({ ...order, coords });
    } catch (err) {
      console.warn(`[GoogleRouting] Geocode failed for order ${order.id}; keeping it visible for review.`);
      unresolved.push(order);
    }
  }

  // 2. Group nearby orders
  // These are pending orders for potentially different sessions. Forecast each
  // requested session separately, not the traffic at the 5 PM scheduler run.
  const groups = new Map();
  ordersWithCoords.forEach(order => {
    const departure = order.preferred_timeslot || order.scheduled_start_date_time;
    const key = departure ? new Date(departure).toISOString() : 'unconfirmed';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(order);
  });
  const clusters = [];
  for (const [departure, group] of groups) clusters.push(...await groupNearbyOrders(group, departure === 'unconfirmed' ? 'now' : departure));

  // 3 & 4. Sequence + per-leg timing for each cluster
  const results = unresolved.map(order => ({ orders: assignLoadingSequence([order]), legDurationsSec: [17 * 60], legDistancesM: [0], totalDistanceM: 0, totalDurationSec: 17 * 60, polyline: null, usedFallback: true, needs_review: true, reason: 'UNRESOLVED_ADDRESS' }));
  for (const cluster of clusters) {
    try {
      const { orderSequence, legDurationsSec, legDistancesM, totalDistanceM, totalDurationSec, polyline } =
        await computeClusterRoute(warehouseCoords, cluster);

      const ordered = orderSequence.map(i => cluster[i]);

      results.push({
        orders: assignLoadingSequence(ordered),
        legDurationsSec,
        legDistancesM,
        totalDistanceM,
        totalDurationSec,
        polyline,
        usedFallback: false,
      });
    } catch (err) {
      console.warn('[GoogleRouting] Routes API failed for a cluster, using Haversine fallback:', err.message);
      const fb = fallbackSequenceCluster(warehouseCoords, cluster);
      results.push({
        orders: assignLoadingSequence(fb.ordered),
        legDurationsSec: fb.legDurationsSec,
        legDistancesM:   fb.legDistancesM,
        totalDistanceM:  fb.totalDistanceM,
        totalDurationSec: fb.totalDurationSec,
        polyline:        fb.polyline,
        usedFallback:    true,
      });
    }
  }

  return results;
}

// ── B.1 nearby check: road km from one point to many (Routes matrix) ──────

/**
 * Road distance in km from `origin` to each destination, in order. One origin
 * and up to 25 destinations per request; no departure time, so these are basic
 * (non-traffic) elements. null where Google has no route. Throws when the key
 * is missing or Google refuses, so the caller can fall back to an estimate.
 */
async function roadDistancesKm(origin, destinations) {
  const key = apiKey();
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not configured');
  const out = Array(destinations.length).fill(null);
  const chunkSize = 25;
  for (let i = 0; i < destinations.length; i += chunkSize) {
    const chunk = destinations.slice(i, i + chunkSize);
    // No departure time: basic (non-traffic) distances.
    const elements = await routeMatrixRequest(key, [origin], chunk, { routingPreference: 'TRAFFIC_UNAWARE' });
    for (const el of elements) {
      if (matrixElementOk(el) && el.originIndex === 0 && Number.isFinite(el.distanceMeters)) out[i + el.destinationIndex] = el.distanceMeters / 1000;
    }
  }
  return out;
}

module.exports = {
  planRoutes,
  roadDistancesKm,
  groupNearbyOrders,
  geocodeAddress,
  resolveOrderCoords,
  getOrderAddress,
  haversineKm,
  estimateFallbackLeg,
  buildTravelMetricsMatrix,
  computeOrderedRoute,
  predictiveDeparture,
  getCachedOrderCoords: cachedOrderCoords,
};
