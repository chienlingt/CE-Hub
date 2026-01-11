// server/services/routingService.js
const axios = require('axios');

/**
 * OpenStreetMap Routing Service using OSRM and Nominatim
 * FREE and open source - no API key needed!
 * Malaysia-focused routing
 */

// Public OSRM server (free to use)
const OSRM_BASE_URL = 'https://router.project-osrm.org';
// Nominatim for geocoding (address to coordinates)
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

/**
 * Traffic multiplier based on time of day
 * Malaysia traffic patterns (especially Kuala Lumpur)
 */
function getTrafficMultiplier(hour) {
  // Morning rush (7-9 AM): 1.6x
  if (hour >= 7 && hour <= 9) return 1.6;

  // Evening rush (5-7 PM): 1.7x (worse in KL)
  if (hour >= 17 && hour <= 19) return 1.7;

  // Lunch time (12-2 PM): 1.3x
  if (hour >= 12 && hour <= 14) return 1.3;

  // Late evening (8-10 PM): 1.2x
  if (hour >= 20 && hour <= 22) return 1.2;

  // Off-peak: 1.1x (baseline traffic)
  return 1.1;
}

/**
 * Get coordinates from address using Nominatim (OpenStreetMap)
 * @param {string} address - Full address or building name
 * @returns {Promise<{lat: number, lon: number}>}
 */
async function getCoordinatesFromAddress(address) {
  try {
    console.log(`   Geocoding address: ${address}`);

    const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
      params: {
        q: `${address}, Malaysia`,
        format: 'json',
        limit: 1,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'TBMDeliveryScheduler/1.0'
      },
      timeout: 5000
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      console.log(`   Coordinates found: ${result.lat}, ${result.lon}`);
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        displayName: result.display_name
      };
    }

    throw new Error(`Address not found: ${address}`);

  } catch (error) {
    console.error(`   Error geocoding address: ${error.message}`);
    throw error;
  }
}

/**
 * Calculate route using OSRM
 * @param {Array<{lat: number, lon: number}>} waypoints - Array of coordinates
 * @param {Date} departureTime - Estimated departure time for traffic calculation
 * @returns {Promise<{distance: number, duration: number, durationWithTraffic: number, geometry: string}>}
 */
async function calculateRoute(waypoints, departureTime = new Date()) {
  try {
    if (waypoints.length < 2) {
      throw new Error('At least 2 waypoints required');
    }

    // Format coordinates for OSRM: lon,lat;lon,lat;...
    const coordinates = waypoints
      .map(wp => `${wp.lon},${wp.lat}`)
      .join(';');

    console.log(`   OSRM Route Request: ${waypoints.length} waypoints`);
    const startTime = Date.now();

    // Call OSRM routing API
    const response = await axios.get(
      `${OSRM_BASE_URL}/route/v1/driving/${coordinates}`,
      {
        params: {
          overview: 'full',
          geometries: 'geojson',
          steps: false,
          alternatives: false
        },
        timeout: 10000
      }
    );

    const requestTime = Date.now() - startTime;
    console.log(`   OSRM Response received in ${requestTime}ms`);

    if (!response.data?.routes?.[0]) {
      throw new Error('No route found');
    }

    const route = response.data.routes[0];
    const distanceMeters = route.distance; // meters
    const durationSeconds = route.duration; // seconds
    const legDurationsSeconds = Array.isArray(route.legs)
      ? route.legs.map(leg => leg.duration || 0)
      : [];

    const durationWithTrafficSeconds = durationSeconds;
    const legDurationsWithTrafficSeconds = legDurationsSeconds;

    console.log(`   Distance: ${(distanceMeters / 1000).toFixed(2)} km`);
    console.log(`   Base Duration: ${Math.round(durationSeconds / 60)} minutes`);
    console.log(`   Duration with Traffic: ${Math.round(durationWithTrafficSeconds / 60)} minutes`);

    return {
      distance: distanceMeters, // meters
      duration: durationSeconds, // seconds (no traffic)
      durationWithTraffic: durationWithTrafficSeconds, // seconds (with traffic)
      legsDurationWithTrafficSeconds: legDurationsWithTrafficSeconds,
      geometry: route.geometry,
      waypoints: route.waypoints || []
    };

  } catch (error) {
    console.error(`   OSRM Error: ${error.message}`);

    // Fallback: estimate based on straight-line distance
    console.log(`   Using fallback distance estimation`);
    return estimateRouteFallback(waypoints, departureTime);
  }
}

/**
 * Fallback route estimation using Haversine formula
 * @param {Array<{lat: number, lon: number}>} waypoints
 * @param {Date} departureTime
 * @returns {{distance: number, duration: number, durationWithTraffic: number}}
 */
function estimateRouteFallback(waypoints, departureTime = new Date()) {
  let totalDistance = 0;
  const segmentDistances = [];

  // Calculate straight-line distance between consecutive waypoints
  for (let i = 0; i < waypoints.length - 1; i++) {
    const segmentDistance = haversineDistance(waypoints[i], waypoints[i + 1]);
    segmentDistances.push(segmentDistance);
    totalDistance += segmentDistance;
  }

  // Add 40% for road network in Malaysia (winding roads, detours)
  totalDistance *= 1.4;
  const adjustedSegmentDistances = segmentDistances.map(d => d * 1.4);

  // Estimate duration: average 30 km/h in city, 50 km/h outside
  const averageSpeed = 30; // km/h (conservative for urban delivery)
  const durationHours = totalDistance / averageSpeed;
  const durationSeconds = durationHours * 3600;

  const durationWithTrafficSeconds = durationSeconds;
  const legDurationsWithTrafficSeconds = adjustedSegmentDistances.map(distanceKm => {
    const segmentSeconds = (distanceKm / averageSpeed) * 3600;
    return segmentSeconds;
  });

  console.log(`   Estimated Distance: ${totalDistance.toFixed(2)} km`);
  console.log(`   Estimated Duration: ${Math.round(durationSeconds / 60)} minutes`);
  console.log(`   Duration with Traffic: ${Math.round(durationWithTrafficSeconds / 60)} minutes`);

  return {
    distance: totalDistance * 1000, // convert to meters
    duration: durationSeconds,
    durationWithTraffic: durationWithTrafficSeconds,
    legsDurationWithTrafficSeconds: legDurationsWithTrafficSeconds,
    geometry: null
  };
}

/**
 * Haversine formula for great-circle distance
 * @param {{lat: number, lon: number}} coord1
 * @param {{lat: number, lon: number}} coord2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(coord1, coord2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLon = toRadians(coord2.lon - coord1.lon);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) * Math.cos(toRadians(coord2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Optimize route order using nearest neighbor algorithm
 * @param {Array} orders - Orders with addresses
 * @param {string} warehouseAddress - Starting address
 * @returns {Promise<Array>} Optimized order sequence
 */
async function optimizeRouteOrder(orders, warehouseAddress) {
  console.log(`   Optimizing route order for ${orders.length} orders...`);

  if (orders.length <= 1) {
    return orders;
  }

  try {
    // Get coordinates for warehouse
    const warehouseCoords = await getCoordinatesFromAddress(warehouseAddress);

    // Get coordinates for all orders
    const ordersWithCoords = await Promise.all(
      orders.map(async (order) => {
        const address = order.customers?.address || order.buildings?.building_name;
        const coords = await getCoordinatesFromAddress(address);
        return { ...order, coords, address };
      })
    );

    // Nearest neighbor algorithm
    const optimized = [];
    const remaining = [...ordersWithCoords];
    let currentCoords = warehouseCoords;

    while (remaining.length > 0) {
      // Find nearest order from current position
      let nearestIndex = 0;
      let minDistance = haversineDistance(currentCoords, remaining[0].coords);

      for (let i = 1; i < remaining.length; i++) {
        const distance = haversineDistance(currentCoords, remaining[i].coords);
        if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = i;
        }
      }

      // Add nearest order to optimized route
      const nearestOrder = remaining.splice(nearestIndex, 1)[0];
      optimized.push(nearestOrder);
      currentCoords = nearestOrder.coords;

      console.log(`      Next stop: ${nearestOrder.address} (${minDistance.toFixed(2)} km)`);
    }

    console.log(`   Route optimized using nearest neighbor algorithm`);
    return optimized;

  } catch (error) {
    console.error(`   Route optimization failed, using original order: ${error.message}`);
    return orders;
  }
}

/**
 * Calculate total route for a sequence of orders
 * @param {Array} orders - Ordered list of orders
 * @param {string} warehouseAddress - Starting address
 * @param {Date} departureTime - Departure time
 * @returns {Promise<Object>} Route details with total time and distances
 */
async function calculateCompleteRoute(orders, warehouseAddress, departureTime = new Date()) {
  console.log(`\n   Calculating complete route for ${orders.length} orders`);
  console.log(`   Departure Time: ${departureTime.toLocaleTimeString()}`);

  try {
    // Get warehouse coordinates
    const warehouseCoords = await getCoordinatesFromAddress(warehouseAddress);

    // Get coordinates for all delivery locations
    const waypoints = [warehouseCoords];

    for (const order of orders) {
      const address = order.customers?.address || order.buildings?.building_name;
      const coords = await getCoordinatesFromAddress(address);
      waypoints.push(coords);
    }

    // Calculate route through all waypoints
    const route = await calculateRoute(waypoints, departureTime);
    const legTimesMinutes = Array.isArray(route.legsDurationWithTrafficSeconds)
      ? route.legsDurationWithTrafficSeconds.map(seconds => Math.max(1, Math.ceil(seconds / 60)))
      : [];

    console.log(`\n   COMPLETE ROUTE SUMMARY:`);
    console.log(`   ========================================`);
    console.log(`   Stops: ${orders.length} deliveries`);
    console.log(`   Total Distance: ${(route.distance / 1000).toFixed(2)} km`);
    console.log(`   Travel Time (no traffic): ${Math.round(route.duration / 60)} minutes`);
    console.log(`   Travel Time (with traffic): ${Math.round(route.durationWithTraffic / 60)} minutes`);
    console.log(`   ========================================\n`);

    return {
      totalDistance: route.distance,
      totalTravelTime: route.duration,
      totalTravelTimeWithTraffic: route.durationWithTraffic,
      legTravelTimesMinutes: legTimesMinutes,
      waypoints: waypoints,
      geometry: route.geometry
    };

  } catch (error) {
    console.error(`   Route calculation failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  getCoordinatesFromAddress,
  calculateRoute,
  optimizeRouteOrder,
  calculateCompleteRoute,
  getTrafficMultiplier
};
