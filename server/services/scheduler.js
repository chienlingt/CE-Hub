// server/services/scheduler.js
const dayjs = require('dayjs');
const weekday = require('dayjs/plugin/weekday');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const prisma = require('../prismaClient');
const {
  optimizeRouteOrder,
  calculateCompleteRoute,
  getCoordinatesFromAddress,
  calculateRoute
} = require('./routingService');

dayjs.extend(weekday);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

const SMALL_GROUP_THRESHOLD = 8;
const NEARBY_TRAVEL_MINUTES = 20;
const TRAFFIC_MULTIPLIER = 1.5;

function scaleTravelMinutes(minutes) {
  if (minutes === null || minutes === undefined) return minutes;
  const scaled = Number(minutes) * TRAFFIC_MULTIPLIER;
  return Math.max(Math.ceil(scaled), 1);
}

function getTruckVolumeCm3(truck) {
  const length = Number(truck?.length_cm || 0);
  const width = Number(truck?.width_cm || 0);
  const height = Number(truck?.height_cm || 0);
  return length * width * height;
}

function getTruckCapacitySummary(trucks) {
  let maxOneTonCapacity = 0;
  let maxThreeTonCapacity = 0;

  for (const truck of trucks) {
    const tone = Number(truck?.tone || 0);
    const volume = getTruckVolumeCm3(truck);
    if (tone > 0 && tone <= 1 && volume > maxOneTonCapacity) {
      maxOneTonCapacity = volume;
    }
    if (tone >= 3 && volume > maxThreeTonCapacity) {
      maxThreeTonCapacity = volume;
    }
  }

  return { maxOneTonCapacity, maxThreeTonCapacity };
}

function pickTruckForVolume(trucks, minTone, totalVolumeCm3, excludedTruckIds = []) {
  let candidates = trucks
    .filter(truck => !excludedTruckIds.includes(truck.id))
    .filter(truck => Number(truck?.tone || 0) >= minTone)
    .map(truck => ({ truck, tone: Number(truck?.tone || 0), volume: getTruckVolumeCm3(truck) }))
    .filter(entry => entry.volume >= totalVolumeCm3);

  if (candidates.length === 0) {
    // If no trucks are available from the non-excluded list, try again with all trucks.
    candidates = trucks
      .filter(truck => Number(truck?.tone || 0) >= minTone)
      .map(truck => ({ truck, tone: Number(truck?.tone || 0), volume: getTruckVolumeCm3(truck) }))
      .filter(entry => entry.volume >= totalVolumeCm3);
  }
  
  if (candidates.length === 0) return null;

  const minCandidateTone = Math.min(...candidates.map(c => c.tone));
  const toneCandidates = candidates.filter(c => c.tone === minCandidateTone);
  const chosen = toneCandidates[Math.floor(Math.random() * toneCandidates.length)];
  return chosen.truck;
}

async function getTimeslotVolumeCm3(timeslotId) {
  const orders = await prisma.orders.findMany({
    where: { time_slot_id: timeslotId, order_status: 'Scheduled' },
    include: { order_products: { include: { products: true } } }
  });

  return orders.reduce((sum, order) => sum + (order.calculatedVolumeCm3 || calculateOrderVolumeCm3(order)), 0);
}

function calculateOrderVolumeCm3(order) {
  let totalVolume = 0;
  for (const op of order.order_products || []) {
    const product = op.products || {};
    const length = Number(product.package_length_cm || 0);
    const width = Number(product.package_width_cm || 0);
    const height = Number(product.package_height_cm || 0);
    const quantity = Number(op.quantity || 0);
    totalVolume += length * width * height * Math.max(quantity, 1);
  }
  return totalVolume;
}

function copyCalculatedFields(target, source) {
  if (!target || !source) return;
  target.calculatedDeliveryTime = source.calculatedDeliveryTime ?? null;
  target.calculatedInstallationTime = source.calculatedInstallationTime ?? null;
  target.calculatedServiceTime = source.calculatedServiceTime ?? null;
  target.calculatedVolumeCm3 = source.calculatedVolumeCm3 ?? null;
  target.requiresInstallation = source.requiresInstallation ?? null;
}

/**
 * Main scheduler function - optimizes and schedules pending orders
 * @param {Object} options - Scheduler options
 * @returns {Object} Results with scheduled/unscheduled orders and statistics
 */
async function scheduleOrders(options = {}) {
  console.log('\n=== AUTO-SCHEDULER STARTED ===\n');
  console.log('[Scheduler] Step 0: initialize results');

  const results = {
    scheduled: [],
    unscheduled: [],
    installationSchedulesCreated: 0,
    timeslotsCreated: 0,
    postalCodeGroups: 0,
    warnings: []
  };

  try {
    // Step 1: Load configuration
    console.log('[Scheduler] Step 1: loading scheduler configuration...');
    const config = await loadConfiguration();

    // Step 2: Generate timeslots for next 7 days
    console.log('\n[Scheduler] Step 2: generating timeslots...');
    results.timeslotsCreated = await generateTimeSlots();

    // Step 3: Fetch pending orders (FIFO)
    console.log('\n[Scheduler] Step 3: fetching pending orders...');
    const pendingOrders = await fetchPendingOrders();

    if (pendingOrders.length === 0) {
      console.log('No pending orders to schedule.\n');
      const teams = await fetchTeams();
      const trucks = await fetchTrucks();
      await reconcileTimeslotAssignments(teams, trucks);
      return results;
    }

    // Step 4: Group by address/location
    console.log('\n[Scheduler] Step 4: grouping orders by location...');
    const locationGroups = await groupByLocation(pendingOrders);
    results.postalCodeGroups = Object.keys(locationGroups).length;

    // Step 5: Calculate installation time and requirements
    console.log('\n[Scheduler] Step 5: calculating installation times...');
    await calculateOrderTimes(pendingOrders);

    // Step 6: Fetch available teams and trucks
    console.log('\n[Scheduler] Step 6: loading available teams and trucks...');
    const teams = await fetchTeams();
    const trucks = await fetchTrucks();
    const truckCapacity = getTruckCapacitySummary(trucks);

    // Step 7: Fetch available timeslots
    console.log('\n[Scheduler] Step 7: loading available timeslots...');
    const availableTimeslots = await fetchAvailableTimeslots();

    if (availableTimeslots.length === 0) {
      console.log('No available timeslots found. All orders remain unscheduled.');
      // Return full order objects with reason
      results.unscheduled = pendingOrders.map(o => {
        o.unscheduled_reason = 'No available timeslots';
        return o;
      });
      await reconcileTimeslotAssignments(teams, trucks);
      return results;
    }

    // Step 8: Optimize routes and assign to timeslots
    console.log('\n[Scheduler] Step 8: optimizing routes and scheduling...');
    const schedulingResults = await optimizeAndSchedule(
      locationGroups,
      availableTimeslots,
      teams,
      trucks,
      truckCapacity,
      config
    );

    results.scheduled = schedulingResults.scheduled;
    results.unscheduled = schedulingResults.unscheduled;
    results.installationSchedulesCreated = schedulingResults.installationSchedulesCreated;
    await reconcileTimeslotAssignments(teams, trucks);

    // Step 9: Update last run timestamp
    console.log('[Scheduler] Step 9: updating last_run_at...');
    await prisma.scheduler_config.update({
      where: { id: config.id },
      data: { last_run_at: new Date(), updated_at: new Date() }
    });

  } catch (error) {
    console.error('Scheduler error:', error);
    throw error;
  } finally {
    // Final summary
    console.log('\n=== SCHEDULER RUN SUMMARY ===');
    console.log(`Total pending orders processed: ${results.scheduled.length + results.unscheduled.length}`);
    console.log(`Successfully scheduled: ${results.scheduled.length}`);
    console.log(`Unscheduled: ${results.unscheduled.length}`);
    console.log(`Installation schedules created: ${results.installationSchedulesCreated}`);
    console.log(`Location groups: ${results.postalCodeGroups}`);
    console.log(`Timeslots created: ${results.timeslotsCreated}`);
    console.log('================================\n');
    console.log('=== AUTO-SCHEDULER FINISHED ===\n');
  }

  return results;
}

/**
 * Load scheduler configuration from database
 */
async function loadConfiguration() {
  let config = await prisma.scheduler_config.findFirst();

  if (!config) {
    // Create default configuration
    console.log('No configuration found. Creating default configuration...');
    config = await prisma.scheduler_config.create({
      data: {
        warehouse_address: 'University of Malaya, Kuala Lumpur',
        warehouse_postal: '50603',
        cron_expression: '0 0 * * *',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    });
  }

  console.log(`Warehouse: ${config.warehouse_address} (${config.warehouse_postal})`);
  console.log(`Schedule: ${config.cron_expression}`);
  console.log(`Enabled: ${config.enabled}`);

  return config;
}

async function getTeamWorkload(teamIds, startDate, endDate) {
    const workloads = await prisma.time_slots.groupBy({
        by: ['delivery_team_id'],
        where: {
            delivery_team_id: {
                in: teamIds,
            },
            date: {
                gte: startDate.format('YYYY-MM-DD'),
                lte: endDate.format('YYYY-MM-DD'),
            },
        },
        _count: {
            id: true,
        },
    });

    const workloadMap = new Map();
    teamIds.forEach(id => workloadMap.set(id, 0));
    workloads.forEach(w => workloadMap.set(w.delivery_team_id, w._count.id));
    return workloadMap;
}

async function getUsedTruckIdsForDate(date) {
    const timeslots = await prisma.time_slots.findMany({
        where: {
            date: date,
            truck_id: {
                not: null,
            },
        },
        select: {
            truck_id: true,
        },
    });
    return timeslots.map(ts => ts.truck_id);
}

/**
 * Generate timeslots for next 7 days in KL timezone (skip weekends & Thursday for normal delivery)
 */
async function generateTimeSlots() {
  console.log('Generating default timeslots for the next 7 weekdays (KL Time)...');
  
  // Get current date in Kuala Lumpur timezone
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Kuala_Lumpur', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });
  const klDateStr = formatter.format(new Date()); // Returns "YYYY-MM-DD"
  
  // Initialize start date from KL time
  const today = dayjs(klDateStr).startOf('day');

  const timeslotTemplates = {
    normal: [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '19:00' },
      { start: '19:00', end: '21:00' }
    ],
    farArea: [
      { start: '07:00', end: '13:00' },  // Earlier start for far areas like Genting
      { start: '13:00', end: '19:00' }
    ]
  };

  let createdCount = 0;
  let daysChecked = 0;
  let date = today;

  while (daysChecked < 7) {
    date = date.add(1, 'day');
    const dayOfWeek = date.day(); // 0=Sunday, 1=Monday, ..., 6=Saturday

    // Skip weekends (Friday & Saturday as per user request)
    if (dayOfWeek === 6 || dayOfWeek === 0) {
      // console.log(`Skipping weekend: ${date.format('YYYY-MM-DD')} (${dayOfWeek === 5 ? 'Friday' : 'Saturday'})`);
      continue;
    }
    daysChecked++;

    // Thursday = far area deliveries only (e.g., Genting)
    const slotType = dayOfWeek === 4 ? 'far-area' : 'normal';

    for (const t of timeslotTemplates.normal) {
      const existingSlots = await prisma.time_slots.findMany({
        where: {
          date: date.format('YYYY-MM-DD'),
          time_window_start: t.start
        }
      });

      if (existingSlots.length === 0) {
        await prisma.time_slots.create({
          data: {
            date: date.format('YYYY-MM-DD'),
            time_window_start: t.start,
            time_window_end: t.end,
            available_flag: true,
            created_at: new Date()
          }
        });
        createdCount++;
        console.log(`Created ${slotType} slot: ${date.format('YYYY-MM-DD')} ${t.start}-${t.end}`);
      }
    }
  }

  console.log(`Total new timeslots created: ${createdCount}`);
  return createdCount;
}

/**
 * Fetch all pending orders (FIFO by created_at)
 */
async function fetchPendingOrders() {
  const orders = await prisma.orders.findMany({
    where: { order_status: 'Pending' },
    orderBy: { created_at: 'asc' },  // FIFO: First In First Out
    include: {
      buildings: { include: { zone: true } },
      order_products: { include: { products: true } },
      customers: true
    }
  });

  console.log(`Found ${orders.length} pending orders (sorted by creation time - FIFO)`);

  if (orders.length > 0) {
    console.log(`   Oldest order: ${dayjs(orders[0].created_at).format('YYYY-MM-DD HH:mm')}`);
    console.log(`   Newest order: ${dayjs(orders[orders.length - 1].created_at).format('YYYY-MM-DD HH:mm')}`);
  }

  return orders;
}

/**
 * Group orders by location (address) for efficient routing
 */
function getOrderAddress(order) {
  return order.customers?.address || order.buildings?.building_name || 'UNKNOWN';
}

async function getOrderCoords(order, cache) {
  const address = getOrderAddress(order);
  if (!address || address === 'UNKNOWN') return null;
  if (cache.has(address)) return cache.get(address);
  try {
    const coords = await getCoordinatesFromAddress(address);
    cache.set(address, coords);
    return coords;
  } catch (error) {
    console.warn(`[Scheduler] Geocode failed for ${address}: ${error.message}`);
    cache.set(address, null);
    return null;
  }
}

async function getTravelMinutes(aOrder, bOrder, coordCache, travelCache) {
  const aAddress = getOrderAddress(aOrder);
  const bAddress = getOrderAddress(bOrder);
  const key = [aAddress, bAddress].sort().join('|');
  if (travelCache.has(key)) return travelCache.get(key);

  const aCoords = await getOrderCoords(aOrder, coordCache);
  const bCoords = await getOrderCoords(bOrder, coordCache);

  if (!aCoords || !bCoords) {
    travelCache.set(key, null);
    return null;
  }

  try {
    const route = await calculateRoute([aCoords, bCoords], new Date());
    const durationSeconds = route.legsDurationWithTrafficSeconds?.[0]
      ?? route.durationWithTraffic
      ?? route.duration
      ?? 0;
    const minutes = Math.max(Math.ceil(durationSeconds / 60), 1);
    const scaledMinutes = scaleTravelMinutes(minutes);
    travelCache.set(key, scaledMinutes);
    return scaledMinutes;
  } catch (error) {
    console.warn(`[Scheduler] Travel time estimate failed: ${error.message}`);
    travelCache.set(key, null);
    return null;
  }
}

async function groupByLocation(orders) {
  const groups = {};

  if (orders.length <= SMALL_GROUP_THRESHOLD) {
    const coordCache = new Map();
    const travelCache = new Map();

    for (const order of orders) {
      let placed = false;

      for (const group of Object.values(groups)) {
        const anchorOrder = group.anchor;
        const minutes = await getTravelMinutes(order, anchorOrder, coordCache, travelCache);
        if (minutes !== null && minutes <= NEARBY_TRAVEL_MINUTES) {
          group.orders.push(order);
          placed = true;
          break;
        }
      }

      if (!placed) {
        const label = getOrderAddress(order);
        const groupKey = `${label}-${Object.keys(groups).length + 1}`;
        groups[groupKey] = { anchor: order, orders: [order] };
      }
    }

    const clustered = {};
    for (const [key, group] of Object.entries(groups)) {
      clustered[key] = group.orders;
    }

    console.log(`Grouped into ${Object.keys(clustered).length} nearby clusters (OSRM travel time):`);
    Object.entries(clustered).forEach(([location, orders]) => {
      console.log(`   ${location}: ${orders.length} order(s)`);
    });

    return clustered;
  }

  for (const order of orders) {
    const location = getOrderAddress(order);

    if (!groups[location]) {
      groups[location] = [];
    }
    groups[location].push(order);
  }

  console.log(`Grouped into ${Object.keys(groups).length} location areas:`);
  Object.entries(groups).forEach(([location, orders]) => {
    console.log(`   ${location}: ${orders.length} order(s)`);
  });

  return groups;
}

/**
 * Calculate installation time and requirements for each order
 */
async function calculateOrderTimes(orders) {
  for (const order of orders) {
    let totalDeliveryTime = 0;
    let totalInstallationTime = 0;
    let requiresInstallation = false;
    let totalVolumeCm3 = 0;
    let hasAnyInstallationNeeded = false;

    for (const op of order.order_products) {
      const product = op.products;
      const quantity = Number(op.quantity || 0);

      const serviceType = String(op.service_type || '').toLowerCase();
      const customMin = op.custom_installation_time_min ?? null;
      const customMax = op.custom_installation_time_max ?? null;
      const productMin = product.estimated_installation_time_min ?? null;
      const productMax = product.estimated_installation_time_max ?? null;
      const minMinutes = customMin ?? productMin ?? null;
      const maxMinutes = customMax ?? productMax ?? null;
      const hasInstallationEstimate = minMinutes !== null || maxMinutes !== null;
      const requiresInstallerTeam = !!product.installer_team_required_flag;
      const includeInstallation = serviceType
        ? serviceType === 'delivery_installation'
        : (hasInstallationEstimate || requiresInstallerTeam);

      if (includeInstallation && requiresInstallerTeam) {
        requiresInstallation = true;
      }

      if (includeInstallation) {
        hasAnyInstallationNeeded = true;
      }

      if (includeInstallation && hasInstallationEstimate) {
        if (op.dismantle_required) {
          const dismantleMinutes = (op.custom_dismantle_time ?? product.dismantle_time) || 0;
          totalInstallationTime += Number(dismantleMinutes || 0) * Math.max(quantity, 1);
        }

        let installationMinutes = 0;
        if (minMinutes !== null && maxMinutes !== null) {
          installationMinutes = (Number(minMinutes) + Number(maxMinutes)) / 2;
        } else if (minMinutes !== null) {
          installationMinutes = Number(minMinutes);
        } else if (maxMinutes !== null) {
          installationMinutes = Number(maxMinutes);
        }

        totalInstallationTime += installationMinutes * Math.max(quantity, 1);
      }

      const length = Number(product.package_length_cm || 0);
      const width = Number(product.package_width_cm || 0);
      const height = Number(product.package_height_cm || 0);
      totalVolumeCm3 += length * width * height * Math.max(quantity, 1);
    }

    // Delivery time (unloading, positioning) - apply only when no installation is needed
    totalDeliveryTime = order.order_products?.length ? (hasAnyInstallationNeeded ? 0 : 10) : 0;

    // Store calculated times on order object
    order.calculatedDeliveryTime = totalDeliveryTime;
    order.calculatedInstallationTime = totalInstallationTime;
    order.requiresInstallation = requiresInstallation;
    order.calculatedServiceTime = totalDeliveryTime + totalInstallationTime;
    order.calculatedVolumeCm3 = totalVolumeCm3;

    console.log(`Order ${order.id}: Delivery ${totalDeliveryTime}min, Installation ${totalInstallationTime}min, Total ${order.calculatedServiceTime}min${requiresInstallation ? ' (Installation Required)' : ''}`);
  }
}

/**
 * Fetch all teams by type
 */
async function fetchTeams() {
  const allTeams = await prisma.teams.findMany({
    where: { available_flag: true },
    include: { assignments: { include: { employee: { include: { role: true } } } } }
  });

  const deliveryTeams = allTeams.filter(team =>
    (team.team_type || '').toLowerCase().includes('delivery') && teamHasSomeRoles(team, 'delivery')
  );
  const warehouseTeams = allTeams.filter(team => teamHasSomeRoles(team, 'storekeeper'));
  const installationTeams = allTeams.filter(team => teamHasSomeRoles(team, 'installation'));

  console.log(`Delivery teams: ${deliveryTeams.length}`);
  console.log(`Warehouse teams: ${warehouseTeams.length}`);
  console.log(`Installation teams: ${installationTeams.length}`);

  return { deliveryTeams, warehouseTeams, installationTeams };
}

function teamHasAllRoles(team, keyword) {
  const key = String(keyword || '').toLowerCase();
  const members = team?.assignments || [];
  if (members.length === 0) return false;
  return members.every(a => {
    const roleName = a?.employee?.role?.name || '';
    return roleName.toLowerCase().includes(key);
  });
}

function teamHasSomeRoles(team, keyword) {
  const key = String(keyword || '').toLowerCase();
  const members = team?.assignments || [];
  if (members.length === 0) return false;
  return members.some(a => {
    const roleName = a?.employee?.role?.name || '';
    return roleName.toLowerCase().includes(key);
  });
}

async function getTeamAssignmentCounts(teamIds, fieldName) {
  if (!teamIds.length) return new Map();
  const rows = await prisma.time_slots.groupBy({
    by: [fieldName],
    where: {
      [fieldName]: { in: teamIds }
    },
    _count: { id: true }
  });
  const map = new Map();
  teamIds.forEach(id => map.set(id, 0));
  rows.forEach(r => map.set(r[fieldName], r._count.id));
  return map;
}

async function getTruckAssignmentCounts(truckIds) {
  if (!truckIds.length) return new Map();
  const rows = await prisma.time_slots.groupBy({
    by: ['truck_id'],
    where: { truck_id: { in: truckIds } },
    _count: { id: true }
  });
  const map = new Map();
  truckIds.forEach(id => map.set(id, 0));
  rows.forEach(r => map.set(r.truck_id, r._count.id));
  return map;
}

function pickLeastUsedTeam(teams, countsMap) {
  if (!teams.length) return null;
  let best = teams[0];
  let bestCount = countsMap.get(best.id) ?? 0;
  for (const team of teams) {
    const count = countsMap.get(team.id) ?? 0;
    if (count < bestCount) {
      best = team;
      bestCount = count;
    }
  }
  return best;
}

function pickLeastUsedTruck(trucks, countsMap, requiredTone, totalVolumeCm3) {
  const candidates = trucks
    .map(truck => ({ truck, tone: Number(truck?.tone || 0), volume: getTruckVolumeCm3(truck) }))
    .filter(entry => entry.tone >= requiredTone && entry.volume >= totalVolumeCm3);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aCount = countsMap.get(a.truck.id) ?? 0;
    const bCount = countsMap.get(b.truck.id) ?? 0;
    if (aCount !== bCount) return aCount - bCount;
    if (a.tone !== b.tone) return a.tone - b.tone;
    return a.volume - b.volume;
  });
  return candidates[0].truck;
}

async function ensureTimeslotAssignments(timeslotId, slotVolumeCm3, teams, trucks) {
  console.log(`[ensureTimeslotAssignments] Running for timeslot: ${timeslotId}`);

  const orderCount = await prisma.orders.count({
    where: { time_slot_id: timeslotId, order_status: 'Scheduled' }
  });

  if (orderCount === 0) {
    console.log(`[ensureTimeslotAssignments] No orders in timeslot. Clearing assignments.`);
    await prisma.time_slots.update({
      where: { id: timeslotId },
      data: { delivery_team_id: null, warehouse_team_id: null, truck_id: null }
    });
    return;
  }

  const timeslot = await prisma.time_slots.findUnique({ where: { id: timeslotId } });
  if (!timeslot) {
    console.log(`[ensureTimeslotAssignments] Timeslot not found.`);
    return;
  }

  // --- Start Debug Logging ---
  console.log('[ensureTimeslotAssignments] All delivery teams fetched:', JSON.stringify(teams.deliveryTeams, null, 2));
  console.log('[ensureTimeslotAssignments] All warehouse teams fetched:', JSON.stringify(teams.warehouseTeams, null, 2));

  const deliveryCandidates = (teams.deliveryTeams || []).filter(t => teamHasSomeRoles(t, 'delivery'));
  const warehouseCandidates = (teams.warehouseTeams || []).filter(t => teamHasSomeRoles(t, 'storekeeper'));

  console.log('[ensureTimeslotAssignments] Delivery team candidates after filtering:', JSON.stringify(deliveryCandidates, null, 2));
  console.log('[ensureTimeslotAssignments] Warehouse team candidates after filtering:', JSON.stringify(warehouseCandidates, null, 2));
  // --- End Debug Logging ---

  const deliveryCounts = await getTeamAssignmentCounts(deliveryCandidates.map(t => t.id), 'delivery_team_id');
  const warehouseCounts = await getTeamAssignmentCounts(warehouseCandidates.map(t => t.id), 'warehouse_team_id');

  const deliveryTeam = timeslot.delivery_team_id && deliveryCandidates.some(t => t.id === timeslot.delivery_team_id)
    ? deliveryCandidates.find(t => t.id === timeslot.delivery_team_id)
    : pickLeastUsedTeam(deliveryCandidates, deliveryCounts);

  const warehouseTeam = timeslot.warehouse_team_id && warehouseCandidates.some(t => t.id === timeslot.warehouse_team_id)
    ? warehouseCandidates.find(t => t.id === timeslot.warehouse_team_id)
    : pickLeastUsedTeam(warehouseCandidates, warehouseCounts);
    
  // --- More Debug Logging ---
  console.log('[ensureTimeslotAssignments] Chosen delivery team:', JSON.stringify(deliveryTeam, null, 2));
  console.log('[ensureTimeslotAssignments] Chosen warehouse team:', JSON.stringify(warehouseTeam, null, 2));
  // --- End Debug Logging ---

  const requiredTone = slotVolumeCm3 > 0 ? (slotVolumeCm3 > getTruckCapacitySummary(trucks).maxOneTonCapacity ? 3 : 1) : 1;
  const truckCounts = await getTruckAssignmentCounts(trucks.map(t => t.id));
  const currentTruck = timeslot.truck_id ? trucks.find(t => t.id === timeslot.truck_id) : null;
  const currentTruckFits = currentTruck && Number(currentTruck?.tone || 0) >= requiredTone && getTruckVolumeCm3(currentTruck) >= slotVolumeCm3;
  const chosenTruck = currentTruckFits ? currentTruck : pickLeastUsedTruck(trucks, truckCounts, requiredTone, slotVolumeCm3);

  console.log(`[ensureTimeslotAssignments] Updating timeslot with DeliveryTeamID: ${deliveryTeam?.id || null}, WarehouseTeamID: ${warehouseTeam?.id || null}`);

  await prisma.time_slots.update({
    where: { id: timeslotId },
    data: {
      delivery_team_id: deliveryTeam?.id || null,
      warehouse_team_id: warehouseTeam?.id || null,
      truck_id: chosenTruck?.id || null
    }
  });
}

/**
 * Fetch all trucks with zone assignments
 */
async function fetchTrucks() {
  const trucks = await prisma.trucks.findMany({
    include: { truck_zones: { include: { zones: true } } }
  });

  console.log(`Available trucks: ${trucks.length}`);

  return trucks;
}

/**
 * Fetch available timeslots (not yet full, and in the future)
 */
async function fetchAvailableTimeslots() {
  const today = dayjs().startOf('day');
  const tomorrow = today.add(1, 'day').format('YYYY-MM-DD');

  const timeslots = await prisma.time_slots.findMany({
    where: {
      available_flag: true,
      date: {
        gte: tomorrow  // Only future dates (tomorrow or later)
      }
    },
    orderBy: [
      { date: 'asc' },
      { time_window_start: 'asc' }
    ]
  });

  console.log(`Available future timeslots: ${timeslots.length} (from ${tomorrow} onwards)`);

  return timeslots;
}

/**
 * Main optimization and scheduling logic
 */
async function optimizeAndSchedule(locationGroups, timeslots, teams, trucks, truckCapacity, config) {
  const scheduled = [];
  const unscheduled = [];
  let installationSchedulesCreated = 0;

  // Team assignment counters (round-robin)
  let warehouseTeamIndex = 0;
  let installationTeamIndex = 0;

  // Process each location group
  for (const [location, orders] of Object.entries(locationGroups)) {
    console.log(`\nProcessing location ${location} (${orders.length} orders)...`);

    // Try to fit orders into available timeslots
    for (const timeslot of timeslots) {
      if (orders.length === 0) break;

      const slotStart = dayjs(`${timeslot.date} ${timeslot.time_window_start}`);
      const slotEnd = dayjs(`${timeslot.date} ${timeslot.time_window_end}`);
      let slotVolumeCm3 = await getTimeslotVolumeCm3(timeslot.id);
      let slotRequiresThreeTon = truckCapacity.maxOneTonCapacity > 0 && slotVolumeCm3 > truckCapacity.maxOneTonCapacity;

      // Check for existing scheduled orders in this timeslot to calculate remaining time
      const existingOrdersCheck = await prisma.orders.findMany({
        where: {
          time_slot_id: timeslot.id,
          order_status: 'Scheduled'
        },
        orderBy: {
          scheduled_end_date_time: 'desc'
        }
      });

      // Calculate available start time and remaining duration
      let availableStartTime = slotStart.clone();
      if (existingOrdersCheck.length > 0) {
        const lastOrderEnd = dayjs(existingOrdersCheck[0].scheduled_end_date_time);
        if (lastOrderEnd.isAfter(slotStart)) {
          availableStartTime = lastOrderEnd;
        }
      }

      const slotDuration = slotEnd.diff(availableStartTime, 'minute');

      console.log(`\n[Scheduler] Step 8.1: trying slot ${timeslot.date} ${timeslot.time_window_start}-${timeslot.time_window_end} (${slotDuration} min remaining from ${availableStartTime.format('HH:mm')})`);

      // Find orders that can fit in this slot
      const suitableOrders = orders.filter(order => {
        const building = order.buildings;

        // Check building access window overlap with slot
        if (building?.access_time_window_start && building?.access_time_window_end) {
          const accessStart = dayjs(`${timeslot.date} ${building.access_time_window_start}`);
          const accessEnd = dayjs(`${timeslot.date} ${building.access_time_window_end}`);
          if (slotEnd.isBefore(accessStart) || slotStart.isAfter(accessEnd)) {
            return false;
          }
        }

        // Order must fit in slot (delivery + installation time)
        const totalTime = (order.calculatedServiceTime || order.calculatedDeliveryTime);
        return totalTime <= slotDuration;
      });

      if (suitableOrders.length === 0) {
        console.log(`   No suitable orders for this slot`);
        continue;
      }

      console.log(`   [Scheduler] ${suitableOrders.length} suitable orders found`);

      // Optimize route for these orders
      console.log('   [Scheduler] Step 8.2: optimizing route for suitable orders');
      const optimizedRoute = await optimizeRoute(suitableOrders, config.warehouse_address, slotStart.toDate());

      // Start scheduling from the available start time calculated above
      let currentTime = availableStartTime.clone();
      let travelTimeAccumulated = 0;

      for (let i = 0; i < optimizedRoute.orders.length; i++) {
        const order = optimizedRoute.orders[i];
        const orderVolumeCm3 = order.calculatedVolumeCm3 || 0;

        if (truckCapacity.maxThreeTonCapacity > 0 && slotVolumeCm3 + orderVolumeCm3 > truckCapacity.maxThreeTonCapacity) {
          console.log(`   [Scheduler] Order ${order.id} exceeds 3-ton truck capacity for this slot, moving to next slot`);
          break;
        }

        if (truckCapacity.maxOneTonCapacity > 0 && slotVolumeCm3 + orderVolumeCm3 > truckCapacity.maxOneTonCapacity) {
          slotRequiresThreeTon = true;
        }

        // Add travel time to this location
        if (i < optimizedRoute.travelTimes.length) {
          travelTimeAccumulated += optimizedRoute.travelTimes[i];
          currentTime = currentTime.add(optimizedRoute.travelTimes[i], 'minute');
        }

        console.log(`   [Scheduler] Step 8.3: scheduling order ${order.id} at ${currentTime.format('HH:mm')}`);
        const building = order.buildings;
        let orderStart = currentTime.clone();
        const serviceMinutes = order.calculatedServiceTime || order.calculatedDeliveryTime;
        if (building?.access_time_window_start && building?.access_time_window_end) {
          const accessStart = dayjs(`${timeslot.date} ${building.access_time_window_start}`);
          if (orderStart.isBefore(accessStart)) {
            orderStart = accessStart;
          }
        }
        const orderEnd = orderStart.add(serviceMinutes, 'minute');

        // Check if order still fits in slot
        if (building?.access_time_window_end) {
          const accessEnd = dayjs(`${timeslot.date} ${building.access_time_window_end}`);
          if (orderEnd.isAfter(accessEnd)) {
            console.log(`   Order ${order.id} exceeds access window, skipping remaining orders`);
            break;
          }
        }

        if (orderEnd.isAfter(slotEnd)) {
          console.log(`   Order ${order.id} exceeds slot time, skipping remaining orders`);
          break;
        }

        // Update order in database
        await prisma.orders.update({
          where: { id: order.id },
          data: {
            scheduled_start_date_time: orderStart.toDate(),
            scheduled_end_date_time: orderEnd.toDate(),
            time_slot_id: timeslot.id,
            order_status: 'Scheduled',
            truck_loading_sequence: order.truck_loading_sequence,
            updated_at: new Date()
          }
        });

        console.log(`   [Scheduler] Scheduled Order ${order.id}: ${orderStart.format('HH:mm')}-${orderEnd.format('HH:mm')} (Load Seq: ${order.truck_loading_sequence})`);

        // Fetch the full order with all relations for UI display
        const fullOrder = await prisma.orders.findUnique({
          where: { id: order.id },
          include: {
            customers: true,
            buildings: { include: { zone: true } },
            order_products: { include: { products: true } },
            time_slots: true
          }
        });

        copyCalculatedFields(fullOrder, order);
        scheduled.push(fullOrder);
        slotVolumeCm3 += orderVolumeCm3;

        // Create installation schedule if needed
        if (order.requiresInstallation && teams.installationTeams.length > 0) {
          const installationTeam = teams.installationTeams[installationTeamIndex % teams.installationTeams.length];
          installationTeamIndex++;

          // Estimated arrival = delivery start time (installation begins on arrival)
          const estimatedArrival = orderStart.clone();

          await prisma.installation_schedules.upsert({
            where: { order_id: order.id },
            update: {
              installation_team_id: installationTeam.id,
              estimated_arrival_time: estimatedArrival.toDate(),
              status: 'Scheduled',
              updated_at: new Date()
            },
            create: {
              order_id: order.id,
              installation_team_id: installationTeam.id,
              estimated_arrival_time: estimatedArrival.toDate(),
              status: 'Scheduled',
              created_at: new Date(),
              updated_at: new Date()
            }
          });

          console.log(`   [Scheduler] Installation scheduled: Team ${installationTeam.id}, ETA ${estimatedArrival.format('HH:mm')}`);
          installationSchedulesCreated++;
        }

        // Remove scheduled order from array
        const orderIndex = orders.findIndex(o => o.id === order.id);
        if (orderIndex !== -1) {
          orders.splice(orderIndex, 1);
        }

        // Update current time for next order
        currentTime = orderEnd.clone();
      }

      console.log(`   [Scheduler] Total travel time for this route: ${Math.round(travelTimeAccumulated)} minutes (with traffic)`);

      await ensureTimeslotAssignments(timeslot.id, slotVolumeCm3, teams, trucks);
    }

    // Any remaining orders are unscheduled
    for (const order of orders) {
      // Fetch the full order with all relations for UI display
      const fullOrder = await prisma.orders.findUnique({
        where: { id: order.id },
        include: {
          customers: true,
          buildings: { include: { zone: true } },
          order_products: { include: { products: true } },
          time_slots: true
        }
      });

      // Add reason field to the order object
      fullOrder.unscheduled_reason = 'No suitable timeslot found (access window conflict or insufficient time)';
      copyCalculatedFields(fullOrder, order);

      unscheduled.push(fullOrder);
      console.log(`   Unscheduled Order ${order.id}: No suitable timeslot`);
    }
  }

  return { scheduled, unscheduled, installationSchedulesCreated };
}

/**
 * Optimize delivery route using OpenStreetMap routing
 * CRITICAL: Assigns truck loading sequence (REVERSE of delivery order)
 */
async function optimizeRoute(orders, warehouseAddress, departureTime) {
  console.log(`   Optimizing route for ${orders.length} orders using OpenStreetMap...`);

  try {
    // Optimize route order using nearest neighbor algorithm
    const optimizedOrders = await optimizeRouteOrder(orders, warehouseAddress);

    // Calculate complete route with travel times
    const routeInfo = await calculateCompleteRoute(optimizedOrders, warehouseAddress, departureTime);

    // Calculate travel time between each stop (warehouse -> stop1 -> stop2 -> ...)
    const travelTimes = [];
    const legTimes = Array.isArray(routeInfo.legTravelTimesMinutes) ? routeInfo.legTravelTimesMinutes : [];
    const fallbackSegments = routeInfo.waypoints.length > 1 ? routeInfo.waypoints.length - 1 : optimizedOrders.length;
    const avgTravelTime = fallbackSegments > 0
      ? Math.max(1, Math.ceil((routeInfo.totalTravelTimeWithTraffic || 0) / 60 / fallbackSegments))
      : 1;

    for (let i = 0; i < optimizedOrders.length; i++) {
      const legTime = legTimes[i] ?? avgTravelTime;
      const scaledLegTime = scaleTravelMinutes(legTime);
      travelTimes.push(scaledLegTime);
      console.log(`   Stop ${i + 1} travel time: ${Math.round(scaledLegTime)} minutes (with traffic)`);
    }

    // Assign truck loading sequence (REVERSE of delivery sequence)
    // Delivery order: [A, B, C] means A delivered first, C delivered last
    // Truck loading: C loaded first (seq=1), B middle (seq=2), A loaded last (seq=3)
    optimizedOrders.forEach((order, deliveryIndex) => {
      order.truck_loading_sequence = optimizedOrders.length - deliveryIndex;
    });

    console.log(`   Truck loading sequence assigned:`);
    optimizedOrders.forEach((order, idx) => {
      console.log(`      ${idx + 1}. Order ${order.id} -> Load Seq ${order.truck_loading_sequence} (${idx === 0 ? 'first delivery, LAST to load' : idx === optimizedOrders.length - 1 ? 'last delivery, FIRST to load' : 'middle'})`);
    });

    return {
      orders: optimizedOrders,
      travelTimes: travelTimes, // Travel time in minutes for each stop
      totalDistance: routeInfo.totalDistance,
      totalTravelTime: routeInfo.totalTravelTimeWithTraffic
    };

  } catch (error) {
    console.error(`   Route optimization failed: ${error.message}`);
    console.log(`   Using fallback: FIFO order without optimization`);

    // Fallback: use FIFO order
    const route = [...orders];

    // Assign truck loading sequence
    route.forEach((order, deliveryIndex) => {
      order.truck_loading_sequence = route.length - deliveryIndex;
    });

    // Estimate travel times (17 min per stop)
    const travelTimes = new Array(route.length).fill(17);

    return {
      orders: route,
      travelTimes: travelTimes,
      totalDistance: 0,
      totalTravelTime: 0
    };
  }
}

async function reconcileTimeslotAssignments(teams, trucks) {
  const today = dayjs().startOf('day').format('YYYY-MM-DD');
  const timeslots = await prisma.time_slots.findMany({
    where: { date: { gte: today } },
    select: { id: true }
  });

  console.log(`[Scheduler] Reconciling team assignments for ${timeslots.length} timeslots from ${today} onward...`);
  for (const slot of timeslots) {
    const slotVolumeCm3 = await getTimeslotVolumeCm3(slot.id);
    await ensureTimeslotAssignments(slot.id, slotVolumeCm3, teams, trucks);
  }
}

async function updateTimeslotResources(timeslotId) {
  if (!timeslotId) return;
  console.log(`[Scheduler] Updating resources for timeslot ${timeslotId}...`);
  try {
    const teams = await fetchTeams();
    const trucks = await fetchTrucks();
    const slotVolumeCm3 = await getTimeslotVolumeCm3(timeslotId);
    await ensureTimeslotAssignments(timeslotId, slotVolumeCm3, teams, trucks);
    console.log(`[Scheduler] Resources updated for timeslot ${timeslotId}`);
  } catch (error) {
    console.error(`[Scheduler] Failed to update resources for timeslot ${timeslotId}:`, error);
  }
}

module.exports = {
  scheduleOrders,
  generateTimeSlots,
  loadConfiguration,
  updateTimeslotResources
};

