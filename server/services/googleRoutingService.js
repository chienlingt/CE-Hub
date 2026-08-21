// server/services/googleRoutingService.js
//
// Route Optimisation (B.2) — Google Maps API implementation.
//
// Owns exactly six responsibilities, called once per scheduler run by
// scheduler.js (B.1) via planRoutes(), never inside the per-timeslot
// fitting loop — every Google call costs money, so this module is
// deliberately written to make each geocode/route call exactly once.
//
//   1. Convert a delivery address into GPS coordinates (Geocoding API)
//   2. Group nearby orders by real road travel time (Distance Matrix API)
//   3. Find the most efficient delivery sequence per group (Routes API)
//   4. Calculate distance/time for each leg of the journey (Routes API)
//   5. Work out the truck loading sequence (reverse of delivery order)
//   6. Fall back to straight-line distance if Google is unreachable
//
// Requires GOOGLE_MAPS_SERVER_KEY in server/.env. If unset, every function
// falls back to the Haversine estimate so the scheduler keeps working
// (degraded, not broken) — matching the existing fallback behaviour of
// the OSRM-based routingService.js this module replaces.

const axios  = require('axios');
const prisma = require('../prismaClient');

const GEOCODE_URL       = 'https://maps.googleapis.com/maps/api/geocode/json';
const DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const ROUTES_URL        = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const NEARBY_TRAVEL_MINUTES = 20;

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
  return order.customers?.address || order.buildings?.building_name || 'UNKNOWN';
}

async function geocodeAddress(address) {
  const key = apiKey();
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not configured');

  const res = await axios.get(GEOCODE_URL, {
    params:  { address: `${address}, Malaysia`, key },
    timeout: 5000,
  });

  const result = res.data?.results?.[0];
  if (!result) throw new Error(`Geocoding failed for address: ${address}`);

  return { lat: result.geometry.location.lat, lon: result.geometry.location.lng };
}

/**
 * Resolve coordinates for one order, preferring the permanent buildings
 * cache over a fresh Geocoding API call. Writes the result back to
 * buildings.latitude/longitude on first lookup so it is never paid for
 * again (fixes the "geocode cache lost on restart" problem the old
 * in-memory-only OSRM cache had).
 */
async function resolveOrderCoords(order) {
  const building = order.buildings;

  if (building?.latitude != null && building?.longitude != null) {
    return { lat: Number(building.latitude), lon: Number(building.longitude) };
  }

  const address = getOrderAddress(order);
  const coords  = await geocodeAddress(address);

  if (building?.id) {
    await prisma.buildings.update({
      where: { id: building.id },
      data:  { latitude: coords.lat, longitude: coords.lon },
    }).catch(e => console.warn(`[GoogleRouting] Failed to cache coords for building ${building.id}:`, e.message));
  }

  return coords;
}

// ── 2. Group nearby orders by real travel time (Distance Matrix, batched) ──

/**
 * One Distance Matrix call for the whole candidate set (NxN), instead of
 * the old pattern of one call per pair — this is the single biggest cost
 * lever versus the previous per-pair OSRM approach.
 */
async function buildTravelTimeMatrix(coordsList) {
  const key = apiKey();
  if (!key || coordsList.length === 0) return null;

  const points = coordsList.map(c => `${c.lat},${c.lon}`).join('|');

  const res = await axios.get(DISTANCE_MATRIX_URL, {
    params: {
      origins:      points,
      destinations: points,
      key,
      mode: 'driving',
    },
    timeout: 10000,
  });

  if (res.data?.status !== 'OK') throw new Error(`Distance Matrix error: ${res.data?.status}`);

  // rows[i].elements[j].duration.value → seconds from point i to point j
  return res.data.rows.map(row => row.elements.map(el => el.duration?.value ?? null));
}

async function groupNearbyOrders(ordersWithCoords) {
  if (ordersWithCoords.length <= 1) return [ordersWithCoords];

  let matrix;
  try {
    matrix = await buildTravelTimeMatrix(ordersWithCoords.map(o => o.coords));
  } catch (err) {
    console.warn('[GoogleRouting] Distance Matrix failed, falling back to Haversine clustering:', err.message);
    matrix = null;
  }

  const travelMinutes = (i, j) => {
    if (matrix?.[i]?.[j] != null) return matrix[i][j] / 60;
    const { durationSeconds } = estimateFallbackLeg(ordersWithCoords[i].coords, ordersWithCoords[j].coords);
    return durationSeconds / 60;
  };

  const clusters = [];
  ordersWithCoords.forEach((order, i) => {
    const cluster = clusters.find(c => travelMinutes(c.anchorIndex, i) <= NEARBY_TRAVEL_MINUTES);
    if (cluster) {
      cluster.orders.push(order);
    } else {
      clusters.push({ anchorIndex: i, orders: [order] });
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

  if (clusterOrders.length === 1) {
    // Single stop — no waypoint optimisation needed, just warehouse -> stop.
    const body = {
      origin:      { location: { latLng: { latitude: warehouseCoords.lat, longitude: warehouseCoords.lon } } },
      destination: { location: { latLng: { latitude: clusterOrders[0].coords.lat, longitude: clusterOrders[0].coords.lon } } },
      travelMode:  'DRIVE',
      polylineQuality: 'OVERVIEW',
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
  for (const order of orders) {
    try {
      const coords = await resolveOrderCoords(order);
      ordersWithCoords.push({ ...order, coords });
    } catch (err) {
      console.warn(`[GoogleRouting] Geocode failed for order ${order.id}, excluding from this run:`, err.message);
    }
  }

  // 2. Group nearby orders
  const clusters = await groupNearbyOrders(ordersWithCoords);

  // 3 & 4. Sequence + per-leg timing for each cluster
  const results = [];
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

module.exports = {
  planRoutes,
  geocodeAddress,
  resolveOrderCoords,
  getOrderAddress,
  haversineKm,
};
