// server/services/scheduler.js
const dayjs = require('dayjs');
const weekday = require('dayjs/plugin/weekday');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const prisma = require('../prismaClient');
const { optimizeRouteOrder, calculateCompleteRoute } = require('./routingService');

dayjs.extend(weekday);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/**
 * Main scheduler function - optimizes and schedules pending orders
 * @param {Object} options - Scheduler options
 * @returns {Object} Results with scheduled/unscheduled orders and statistics
 */
async function scheduleOrders(options = {}) {
  console.log('\n=== AUTO-SCHEDULER STARTED ===\n');

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
    console.log('Loading scheduler configuration...');
    const config = await loadConfiguration();

    // Step 2: Generate timeslots for next 7 days
    console.log('\nGenerating timeslots...');
    results.timeslotsCreated = await generateTimeSlots();

    // Step 3: Fetch pending orders (FIFO)
    console.log('\nFetching pending orders...');
    const pendingOrders = await fetchPendingOrders();

    if (pendingOrders.length === 0) {
      console.log('No pending orders to schedule.\n');
      return results;
    }

    // Step 4: Group by address/location
    console.log('\nGrouping orders by location...');
    const locationGroups = groupByLocation(pendingOrders);
    results.postalCodeGroups = Object.keys(locationGroups).length;

    // Step 5: Calculate installation time and requirements
    console.log('\nCalculating installation times...');
    await calculateOrderTimes(pendingOrders);

    // Step 6: Fetch available teams and trucks
    console.log('\nLoading available teams and trucks...');
    const teams = await fetchTeams();
    const trucks = await fetchTrucks();

    // Step 7: Fetch available timeslots
    console.log('\nLoading available timeslots...');
    const availableTimeslots = await fetchAvailableTimeslots();

    if (availableTimeslots.length === 0) {
      console.log('No available timeslots found. All orders remain unscheduled.');
      // Return full order objects with reason
      results.unscheduled = pendingOrders.map(o => {
        o.unscheduled_reason = 'No available timeslots';
        return o;
      });
      return results;
    }

    // Step 8: Optimize routes and assign to timeslots
    console.log('\nOptimizing routes and scheduling...');
    const schedulingResults = await optimizeAndSchedule(
      locationGroups,
      availableTimeslots,
      teams,
      trucks,
      config
    );

    results.scheduled = schedulingResults.scheduled;
    results.unscheduled = schedulingResults.unscheduled;
    results.installationSchedulesCreated = schedulingResults.installationSchedulesCreated;

    // Step 9: Update last run timestamp
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

/**
 * Generate timeslots for next 7 days (skip weekends & Thursday for normal delivery)
 */
async function generateTimeSlots() {
  console.log('Generating default timeslots for next 7 days...');
  const today = dayjs().startOf('day');

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

  for (let i = 1; i <= 7; i++) {
    const day = today.add(i, 'day');
    const dayOfWeek = day.day(); // 0=Sunday, 4=Thursday, 6=Saturday

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`Skipping ${day.format('YYYY-MM-DD')} (weekend)`);
      continue;
    }

    // Thursday = far area deliveries only (e.g., Genting)
    const slotType = dayOfWeek === 4 ? 'far-area' : 'normal';

    for (const t of timeslotTemplates.normal) {
      const existingSlots = await prisma.time_slots.findMany({
        where: {
          date: day.format('YYYY-MM-DD'),
          time_window_start: t.start
        }
      });

      if (existingSlots.length === 0) {
        await prisma.time_slots.create({
          data: {
            date: day.format('YYYY-MM-DD'),
            time_window_start: t.start,
            time_window_end: t.end,
            available_flag: true,
            created_at: new Date()
          }
        });
        createdCount++;
        console.log(`Created ${slotType} slot: ${day.format('YYYY-MM-DD')} ${t.start}-${t.end}`);
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
function groupByLocation(orders) {
  const groups = {};

  for (const order of orders) {
    const location = order.customers?.address || order.buildings?.building_name || 'UNKNOWN';

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

    for (const op of order.order_products) {
      const product = op.products;

      // Check if installation team is required
      if (product.installer_team_required_flag) {
        requiresInstallation = true;
      }

      // Calculate dismantle time if needed
      if (op.dismantle_required) {
        totalInstallationTime += (product.dismantle_time || 0);
      }

      // Add installation time from products table
      if (product.estimated_installation_time_min) {
        totalInstallationTime += product.estimated_installation_time_min;
      }

      // Delivery time (unloading, positioning) - 15 min per product
      totalDeliveryTime += 15;
    }

    // Store calculated times on order object
    order.calculatedDeliveryTime = totalDeliveryTime;
    order.calculatedInstallationTime = totalInstallationTime;
    order.requiresInstallation = requiresInstallation;

    console.log(`Order ${order.id}: Delivery ${totalDeliveryTime}min, Installation ${totalInstallationTime}min${requiresInstallation ? ' (Installation Required)' : ''}`);
  }
}

/**
 * Fetch all teams by type
 */
async function fetchTeams() {
  const deliveryTeams = await prisma.teams.findMany({
    where: { team_type: 'delivery' },
    include: { assignments: { include: { employee: true } } }
  });

  const warehouseTeams = await prisma.teams.findMany({
    where: { team_type: 'warehouse' },
    include: { assignments: { include: { employee: true } } }
  });

  const installationTeams = await prisma.teams.findMany({
    where: { team_type: 'installation' },
    include: { assignments: { include: { employee: true } } }
  });

  console.log(`Delivery teams: ${deliveryTeams.length}`);
  console.log(`Warehouse teams: ${warehouseTeams.length}`);
  console.log(`Installation teams: ${installationTeams.length}`);

  return { deliveryTeams, warehouseTeams, installationTeams };
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
async function optimizeAndSchedule(locationGroups, timeslots, teams, trucks, config) {
  const scheduled = [];
  const unscheduled = [];
  let installationSchedulesCreated = 0;

  // Team assignment counters (round-robin)
  let deliveryTeamIndex = 0;
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
          availableStartTime = lastOrderEnd.add(10, 'minute'); // 10 min buffer
        }
      }

      const slotDuration = slotEnd.diff(availableStartTime, 'minute');

      console.log(`\nTrying slot: ${timeslot.date} ${timeslot.time_window_start}-${timeslot.time_window_end} (${slotDuration} min remaining from ${availableStartTime.format('HH:mm')})`);

      // Find orders that can fit in this slot
      const suitableOrders = orders.filter(order => {
        const building = order.buildings;

        // Check building access window
        if (building?.access_time_window_start && building?.access_time_window_end) {
          const accessStart = dayjs(`${timeslot.date} ${building.access_time_window_start}`);
          const accessEnd = dayjs(`${timeslot.date} ${building.access_time_window_end}`);

          // Timeslot must overlap with building access window
          if (slotEnd.isBefore(accessStart) || slotStart.isAfter(accessEnd)) {
            return false;
          }
        }

        // Order must fit in slot (delivery time + buffer)
        const totalTime = order.calculatedDeliveryTime + 30; // 30 min buffer
        return totalTime <= slotDuration;
      });

      if (suitableOrders.length === 0) {
        console.log(`   No suitable orders for this slot`);
        continue;
      }

      console.log(`   ${suitableOrders.length} suitable orders found`);

      // Optimize route for these orders
      const optimizedRoute = await optimizeRoute(suitableOrders, config.warehouse_address, slotStart.toDate());

      // Assign teams to this timeslot
      if (!timeslot.delivery_team_id && teams.deliveryTeams.length > 0) {
        const deliveryTeam = teams.deliveryTeams[deliveryTeamIndex % teams.deliveryTeams.length];
        const warehouseTeam = teams.warehouseTeams[warehouseTeamIndex % teams.warehouseTeams.length];

        await prisma.time_slots.update({
          where: { id: timeslot.id },
          data: {
            delivery_team_id: deliveryTeam.id,
            warehouse_team_id: warehouseTeam.id
          }
        });

        console.log(`   Assigned Delivery Team: ${deliveryTeam.id}, Warehouse Team: ${warehouseTeam.id}`);

        deliveryTeamIndex++;
        warehouseTeamIndex++;
      }

      // Start scheduling from the available start time calculated above
      let currentTime = availableStartTime.clone();
      let travelTimeAccumulated = 0;

      for (let i = 0; i < optimizedRoute.orders.length; i++) {
        const order = optimizedRoute.orders[i];

        // Add travel time to this location
        if (i < optimizedRoute.travelTimes.length) {
          travelTimeAccumulated += optimizedRoute.travelTimes[i];
          currentTime = currentTime.add(optimizedRoute.travelTimes[i], 'minute');
        }

        const orderStart = currentTime.clone();
        const orderEnd = currentTime.add(order.calculatedDeliveryTime, 'minute');

        // Check if order still fits in slot
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

        console.log(`   Scheduled Order ${order.id}: ${orderStart.format('HH:mm')}-${orderEnd.format('HH:mm')} (Load Seq: ${order.truck_loading_sequence})`);

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

        scheduled.push(fullOrder);

        // Create installation schedule if needed
        if (order.requiresInstallation && teams.installationTeams.length > 0) {
          const installationTeam = teams.installationTeams[installationTeamIndex % teams.installationTeams.length];
          installationTeamIndex++;

          // Estimated arrival = delivery end time + 30 min travel buffer
          const estimatedArrival = orderEnd.add(30, 'minute');

          await prisma.installation_schedules.create({
            data: {
              order_id: order.id,
              installation_team_id: installationTeam.id,
              estimated_arrival_time: estimatedArrival.toDate(),
              status: 'Scheduled',
              created_at: new Date(),
              updated_at: new Date()
            }
          });

          console.log(`   Installation scheduled: Team ${installationTeam.id}, ETA ${estimatedArrival.format('HH:mm')}`);
          installationSchedulesCreated++;
        }

        // Remove scheduled order from array
        const orderIndex = orders.findIndex(o => o.id === order.id);
        if (orderIndex !== -1) {
          orders.splice(orderIndex, 1);
        }

        // Update current time for next order
        currentTime = orderEnd.clone().add(10, 'minute'); // 10 min buffer between orders
      }

      console.log(`   Total travel time for this route: ${Math.round(travelTimeAccumulated)} minutes (with traffic)`);
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
    const waypoints = routeInfo.waypoints;

    // Split total travel time proportionally based on segments
    const totalSegments = waypoints.length - 1; // Number of segments
    const avgTravelTime = routeInfo.totalTravelTimeWithTraffic / 60 / totalSegments; // Convert to minutes

    for (let i = 0; i < optimizedOrders.length; i++) {
      travelTimes.push(avgTravelTime);
      console.log(`   Stop ${i + 1} travel time: ${Math.round(avgTravelTime)} minutes (with traffic)`);
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

    // Estimate travel times (10 min per stop)
    const travelTimes = new Array(route.length).fill(10);

    return {
      orders: route,
      travelTimes: travelTimes,
      totalDistance: 0,
      totalTravelTime: 0
    };
  }
}

module.exports = {
  scheduleOrders,
  generateTimeSlots,
  loadConfiguration
};
