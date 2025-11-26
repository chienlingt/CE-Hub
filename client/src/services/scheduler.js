import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import {
  getAllOrders,
  getOrderProductsByOrderId,
  getProductById,
  getBuildingById,
  getAllTimeSlots,
  addTimeSlot,
  updateOrder
} from "../services/informationService";

dayjs.extend(weekday);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

// OSRM API Configuration (Open Source Routing Machine)
const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

// Depot/warehouse coordinates
const DEPOT_LOCATION = {
  latitude: 3.1390,  // Petaling Jaya
  longitude: 101.6869
};

// Helper: Geocode address to coordinates using Nominatim (OpenStreetMap)
async function geocodeAddress(address) {
  if (!address) throw new Error("No address provided for geocoding");

  try {
    const response = await fetch(
      `${NOMINATIM_BASE_URL}/search?` +
      `q=${encodeURIComponent(address)}&` +
      `format=json&` +
      `limit=1`,
      {
        headers: {
          'User-Agent': 'TBMDelivery-Scheduler/1.0'
        }
      }
    );

    const data = await response.json();

    if (data.length === 0) {
      throw new Error(`Could not geocode address: ${address}`);
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    };
  } catch (error) {
    console.error("❌ Geocoding error:", error.message);
    throw error;
  }
}

// OSRM travel time calculation using address or coordinates
async function calculateTravelTimeOSRM(fromAddress, fromLat, fromLng, toAddress, toLat, toLng) {
  try {
    // Priority 1: Use coordinates if available
    let originCoords = { lat: fromLat, lng: fromLng };
    let destCoords = { lat: toLat, lng: toLng };

    // Geocode addresses if coordinates not available
    if ((!fromLat || !fromLng) && fromAddress) {
      console.log(`🗺️ Geocoding origin address: ${fromAddress}`);
      originCoords = await geocodeAddress(fromAddress);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit for Nominatim
    }
    if ((!toLat || !toLng) && toAddress) {
      console.log(`🗺️ Geocoding destination address: ${toAddress}`);
      destCoords = await geocodeAddress(toAddress);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit for Nominatim
    }

    // Validate coordinates
    if (!originCoords.lat || !originCoords.lng || !destCoords.lat || !destCoords.lng) {
      console.warn("⚠️ Missing coordinates, using Haversine fallback");
      return calculateHaversineTime(fromLat || originCoords.lat, fromLng || originCoords.lng, toLat || destCoords.lat, toLng || destCoords.lng);
    }

    // OSRM expects lon,lat format (reversed)
    const response = await fetch(
      `${OSRM_BASE_URL}/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?overview=false&alternatives=false`
    );

    if (!response.ok) {
      console.warn("⚠️ OSRM API error, using fallback");
      return calculateHaversineTime(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng);
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn("⚠️ No routes found, using fallback");
      return calculateHaversineTime(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng);
    }

    const route = data.routes[0];

    return {
      distanceKm: (route.distance / 1000).toFixed(2),  // OSRM returns meters
      durationMinutes: Math.ceil(route.duration / 60),  // OSRM returns seconds
      durationText: `${Math.ceil(route.duration / 60)} min`
    };
  } catch (error) {
    console.warn("⚠️ OSRM API error:", error.message);
    // Fallback to Haversine if coordinates available
    if (fromLat && fromLng && toLat && toLng) {
      return calculateHaversineTime(fromLat, fromLng, toLat, toLng);
    }
    throw new Error("No coordinates available for travel calculation");
  }
}

// Fallback calculation (unchanged)
function calculateHaversineTime(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;
  
  const durationMinutes = Math.ceil((distanceKm / 25) * 60); // Reduced to 25 km/h for Malaysian urban traffic
  
  return {
    distanceKm: distanceKm.toFixed(2),
    durationMinutes: durationMinutes
  };
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

// NEW: Identify partially filled timeslots and nearby orders
async function identifyPartiallyFilledSlots(allOrders, buildings) {
  console.log("🔍 Identifying partially filled timeslots...");
  
  const scheduledOrders = allOrders.filter(o => o.OrderStatus === "Scheduled");
  const slotOccupancy = {};
  
  // Map scheduled orders to their timeslots
  for (const order of scheduledOrders) {
    const slotKey = `${order.TimeSlotID}_${dayjs(order.ScheduledStartDateTime).format('YYYY-MM-DD')}`;
    
    if (!slotOccupancy[slotKey]) {
      const timeSlot = await getAllTimeSlots().then(slots => 
        slots.find(s => s.id === order.TimeSlotID)
      );
      
      slotOccupancy[slotKey] = {
        timeSlot,
        orders: [],
        totalDuration: 0,
        availableMinutes: 0,
        lastOrderEndTime: null
      };
    }
    
    slotOccupancy[slotKey].orders.push(order);
    const workTime = await calculateOrderTime(order);
    slotOccupancy[slotKey].totalDuration += workTime + (order.TravelTimeMinutes || 0);
  }
  
  // Calculate available time in each slot
  for (const [slotKey, slotData] of Object.entries(slotOccupancy)) {
    const slotStart = dayjs(`${slotData.timeSlot.Date} ${slotData.timeSlot.TimeWindowStart}`);
    const slotEnd = dayjs(`${slotData.timeSlot.Date} ${slotData.timeSlot.TimeWindowEnd}`);
    const totalSlotMinutes = slotEnd.diff(slotStart, 'minute');
    
    slotData.availableMinutes = totalSlotMinutes - slotData.totalDuration;
    
    // Find the last scheduled order's end time
    const lastOrder = slotData.orders
      .sort((a, b) => dayjs(a.ScheduledEndDateTime).diff(dayjs(b.ScheduledEndDateTime)))
      .pop();
    
    slotData.lastOrderEndTime = lastOrder ? dayjs(lastOrder.ScheduledEndDateTime) : slotStart;
  }
  
  return slotOccupancy;
}

// NEW: Find nearby orders for partially filled slots
async function findNearbyOrdersForSlot(partialSlot, pendingOrders, buildings, maxTravelTime = 45) {
  const candidateOrders = [];
  const lastBuilding = await getBuildingById(
    partialSlot.orders[partialSlot.orders.length - 1]?.BuildingID
  ) || DEPOT_LOCATION;
  
  for (const order of pendingOrders) {
    const building = buildings[order.BuildingID];
    if (!building) continue;
    
    // Check if order can fit in remaining time
    const orderWorkTime = await calculateOrderTime(order);
    const travel = await calculateTravelTimeOSRM(
      lastBuilding.address,
      lastBuilding.latitude || lastBuilding.Latitude,
      lastBuilding.longitude || lastBuilding.Longitude,
      building.address,
      building.latitude,
      building.longitude
    );
    
    const totalTimeNeeded = orderWorkTime + travel.durationMinutes + 15; // 15 min buffer
    
    if (totalTimeNeeded <= partialSlot.availableMinutes && travel.durationMinutes <= maxTravelTime) {
      candidateOrders.push({
        ...order,
        workMinutes: orderWorkTime,
        travelTime: travel.durationMinutes,
        travelDistance: travel.distanceKm,
        totalTimeNeeded
      });
    }
  }
  
  // Sort by travel time (nearest first)
  return candidateOrders.sort((a, b) => a.travelTime - b.travelTime);
}

// OSRM distance matrix calculation
async function calculateDistanceMatrixOSRM(orders, buildings) {
  const n = orders.length;
  const matrix = Array(n).fill(null).map(() => Array(n).fill(null));

  console.log("🗺️ Calculating OSRM distance matrix...");

  // Calculate distances between all pairs
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const buildingI = buildings[orders[i].BuildingID];
      const buildingJ = buildings[orders[j].BuildingID];

      try {
        const travel = await calculateTravelTimeOSRM(
          buildingI.address,
          buildingI.latitude || buildingI.Latitude,
          buildingI.longitude || buildingI.Longitude,
          buildingJ.address,
          buildingJ.latitude || buildingJ.Latitude,
          buildingJ.longitude || buildingJ.Longitude
        );

        matrix[i][j] = travel;
        matrix[j][i] = travel; // Symmetric
      } catch (error) {
        console.warn(`⚠️ Failed to calculate distance between order ${i} and ${j}:`, error.message);
        // Use fallback Haversine
        const travel = calculateHaversineTime(
          buildingI.latitude || buildingI.Latitude,
          buildingI.longitude || buildingI.Longitude,
          buildingJ.latitude || buildingJ.Latitude,
          buildingJ.longitude || buildingJ.Longitude
        );
        matrix[i][j] = travel;
        matrix[j][i] = travel;
      }

      // Rate limiting - be nice to public OSRM server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return matrix;
}

// Enhanced main scheduler
export async function scheduleOrders() {
  console.log("🚚 Starting enhanced smart order scheduling with OSRM...");
  
  await generateTimeSlots();
  
  const allOrders = await getAllOrders();
  const pendingOrders = allOrders.filter(o => o.OrderStatus === "Pending");
  console.log(`📦 Found ${pendingOrders.length} pending orders to schedule.`);
  
  if (pendingOrders.length === 0) return [];
  
  // Build cache
  const buildingCache = {};
  for (const order of [...pendingOrders, ...allOrders.filter(o => o.OrderStatus === "Scheduled")]) {
    if (!buildingCache[order.BuildingID]) {
      const building = await getBuildingById(order.BuildingID);
      buildingCache[order.BuildingID] = building;
    }
  }
  
  // Calculate work time for pending orders
  for (const order of pendingOrders) {
    order.workMinutes = await calculateOrderTime(order);
  }
  
  // NEW: Check for partially filled slots first
  const partialSlots = await identifyPartiallyFilledSlots(allOrders, buildingCache);
  const schedule = [];
  let remainingOrders = [...pendingOrders];
  
  console.log(`\n🔍 Found ${Object.keys(partialSlots).length} existing scheduled slots`);
  
  // Try to fill partially filled slots with nearby orders
  for (const [slotKey, slotData] of Object.entries(partialSlots)) {
    if (slotData.availableMinutes > 60 && remainingOrders.length > 0) { // Only if >60 min available
      console.log(`\n🎯 Attempting to fill partial slot: ${slotKey} (${slotData.availableMinutes} min available)`);
      
      const nearbyOrders = await findNearbyOrdersForSlot(slotData, remainingOrders, buildingCache);
      
      if (nearbyOrders.length > 0) {
        const bestOrder = nearbyOrders[0]; // Nearest order
        console.log(`✅ Adding order ${bestOrder.OrderID} to existing slot (${bestOrder.travelTime} min travel)`);
        
        const startTime = slotData.lastOrderEndTime.add(bestOrder.travelTime, 'minute');
        const endTime = startTime.add(bestOrder.workMinutes, 'minute');
        
        await updateOrder(bestOrder.id, {
          ScheduledStartDateTime: startTime.toDate(),
          ScheduledEndDateTime: endTime.toDate(),
          TravelTimeMinutes: bestOrder.travelTime,
          TravelDistanceKm: parseFloat(bestOrder.travelDistance),
          TimeSlotID: slotData.timeSlot.id,
          OrderStatus: "Scheduled",
          UpdatedAt: new Date()
        });
        
        schedule.push({
          OrderID: bestOrder.OrderID,
          BuildingID: bestOrder.BuildingID,
          ScheduledStart: startTime.toDate(),
          ScheduledEnd: endTime.toDate(),
          WorkMinutes: bestOrder.workMinutes,
          TravelMinutes: bestOrder.travelTime,
          TravelDistanceKm: bestOrder.travelDistance,
          SlotDate: slotData.timeSlot.Date,
          SlotWindow: `${slotData.timeSlot.TimeWindowStart} - ${slotData.timeSlot.TimeWindowEnd}`,
          FilledPartialSlot: true
        });
        
        remainingOrders = remainingOrders.filter(o => o.OrderID !== bestOrder.OrderID);
      }
    }
  }
  
  // Continue with regular scheduling for remaining orders
  const allSlots = await getAllTimeSlots();
  const today = dayjs().startOf('day');
  const tomorrow = today.add(1, 'day');

  // Filter slots: only future slots (tomorrow or later), available, and not already partial
  const availableSlots = allSlots
    .filter(s => {
      const slotDate = dayjs(s.Date);
      return s.AvailableFlag &&
             slotDate.isSameOrAfter(tomorrow, 'day') && // Only tomorrow or later
             !Object.keys(partialSlots).includes(`${s.id}_${s.Date}`);
    })
    .sort((a, b) => dayjs(a.Date + " " + a.TimeWindowStart).diff(dayjs(b.Date + " " + b.TimeWindowStart)));

  console.log(`📆 Found ${availableSlots.length} available future timeslots (starting from ${tomorrow.format('YYYY-MM-DD')})`);
  
  // Rest of the scheduling logic remains the same but uses Google Maps matrix
  for (const slot of availableSlots) {
    if (remainingOrders.length === 0) break;
    
    console.log(`\n📅 Processing new slot: ${slot.Date} ${slot.TimeWindowStart}-${slot.TimeWindowEnd}`);
    
    const slotStart = dayjs(`${slot.Date} ${slot.TimeWindowStart}`);
    const slotEnd = dayjs(`${slot.Date} ${slot.TimeWindowEnd}`);
    
    // Find candidate orders for this slot
    const candidateOrders = [];
    for (const order of remainingOrders) {
      const building = buildingCache[order.BuildingID];
      const customer = order.customers; // Customer data included in order from API

      let windowStart = slotStart;
      let windowEnd = slotEnd;

      // Apply building access time window
      if (building?.AccessTimeWindowStart && building?.AccessTimeWindowEnd) {
        const accessStartDT = dayjs(`${slot.Date} ${building.AccessTimeWindowStart}`);
        const accessEndDT = dayjs(`${slot.Date} ${building.AccessTimeWindowEnd}`);
        windowStart = dayjs.max(windowStart, accessStartDT);
        windowEnd = dayjs.min(windowEnd, accessEndDT);
      }

      // Apply customer preferred time window
      if (customer?.preferred_delivery_time_start && customer?.preferred_delivery_time_end) {
        const preferredStartDT = dayjs(`${slot.Date} ${customer.preferred_delivery_time_start}`);
        const preferredEndDT = dayjs(`${slot.Date} ${customer.preferred_delivery_time_end}`);

        // HARD CONSTRAINT: If number_of_attempts > 1, skip order if can't satisfy preference
        if (order.number_of_attempts > 1) {
          windowStart = dayjs.max(windowStart, preferredStartDT);
          windowEnd = dayjs.min(windowEnd, preferredEndDT);

          // If no time window overlap, skip this order for this slot
          if (windowStart.isAfter(windowEnd) || windowStart.isSame(windowEnd)) {
            console.log(`⏭️ Skipping order ${order.OrderID} - customer preferred time not satisfied (attempt ${order.number_of_attempts})`);
            continue; // Skip order
          }
        } else {
          // SOFT PREFERENCE: Still apply window but log if not satisfied
          const originalWindow = { start: windowStart.clone(), end: windowEnd.clone() };
          windowStart = dayjs.max(windowStart, preferredStartDT);
          windowEnd = dayjs.min(windowEnd, preferredEndDT);

          if (windowStart.isAfter(windowEnd) || windowStart.isSame(windowEnd)) {
            // Reset to original window (ignore preference)
            windowStart = originalWindow.start;
            windowEnd = originalWindow.end;
            console.log(`ℹ️ Order ${order.OrderID} - customer preferred time not satisfied (attempt ${order.number_of_attempts}, soft preference)`);
          }
        }
      }

      const availableTime = windowEnd.diff(windowStart, 'minute');

      if (availableTime >= order.workMinutes + 30) {
        candidateOrders.push({
          ...order,
          windowStart,
          windowEnd
        });
      }
    }
    
    if (candidateOrders.length === 0) continue;
    
    console.log(`🎯 ${candidateOrders.length} candidate orders for this slot`);

    // Use OSRM for distance matrix
    const distanceMatrix = await calculateDistanceMatrixOSRM(candidateOrders, buildingCache);
    
    // Optimize and schedule orders (rest of logic unchanged)
    const optimizedOrders = optimizeOrderSequence(candidateOrders, distanceMatrix, slotStart, slotEnd, DEPOT_LOCATION);
    
    let currentTime = slotStart.clone();
    let prevBuilding = DEPOT_LOCATION;
    
    for (let i = 0; i < optimizedOrders.length; i++) {
      const order = optimizedOrders[i];
      const building = buildingCache[order.BuildingID];

      const travel = await calculateTravelTimeOSRM(
        prevBuilding.address,
        prevBuilding.latitude || prevBuilding.Latitude,
        prevBuilding.longitude || prevBuilding.Longitude,
        building.address,
        building.latitude,
        building.longitude
      );
      
      currentTime = currentTime.add(travel.durationMinutes, 'minute');
      const orderStart = currentTime.clone();
      const orderEnd = currentTime.add(order.workMinutes, 'minute');

      // Check if adding this order + return trip to warehouse fits in slot
      // Get warehouse location from DEPOT_LOCATION (we'll fetch from API later)
      const returnTravel = await calculateTravelTimeOSRM(
        building.address,
        building.latitude,
        building.longitude,
        null, // Warehouse address (use depot coordinates)
        DEPOT_LOCATION.latitude,
        DEPOT_LOCATION.longitude
      );

      const returnArrivalTime = orderEnd.add(returnTravel.durationMinutes, 'minute');

      // Validate return trip fits in slot
      if (returnArrivalTime.isAfter(slotEnd)) {
        console.log(`⚠️ Order ${order.OrderID} + return trip exceeds slot (${returnArrivalTime.format('HH:mm')} > ${slotEnd.format('HH:mm')})`);
        console.log(`🔄 Stopping at ${schedule.filter(s => s.SlotDate === slot.Date && s.SlotWindow === `${slot.TimeWindowStart} - ${slot.TimeWindowEnd}`).length} orders for this slot`);
        break; // Don't schedule this order, move to next slot
      }

      if (orderEnd.isAfter(slotEnd)) {
        console.log(`⚠️ Order ${order.OrderID} exceeds slot time, moving to next slot`);
        break;
      }
      
      await updateOrder(order.id, {
        ScheduledStartDateTime: orderStart.toDate(),
        ScheduledEndDateTime: orderEnd.toDate(),
        TravelTimeMinutes: travel.durationMinutes,
        TravelDistanceKm: parseFloat(travel.distanceKm),
        TimeSlotID: slot.id,
        OrderStatus: "Scheduled",
        UpdatedAt: new Date()
      });
      
      schedule.push({
        OrderID: order.OrderID,
        BuildingID: order.BuildingID,
        ScheduledStart: orderStart.toDate(),
        ScheduledEnd: orderEnd.toDate(),
        WorkMinutes: order.workMinutes,
        TravelMinutes: travel.durationMinutes,
        TravelDistanceKm: travel.distanceKm,
        SlotDate: slot.Date,
        SlotWindow: `${slot.TimeWindowStart} - ${slot.TimeWindowEnd}`,
        SequenceInSlot: i + 1
      });
      
      const idx = remainingOrders.findIndex(o => o.OrderID === order.OrderID);
      if (idx !== -1) remainingOrders.splice(idx, 1);
      
      currentTime = orderEnd.clone();
      prevBuilding = building;
    }
  }
  
  console.log("\n🕒 Final Enhanced Schedule Summary:");
  console.log(`✅ Scheduled: ${schedule.length} orders`);
  console.log(`⏳ Unscheduled: ${remainingOrders.length} orders`);
  console.log(`🔄 Partial slots filled: ${schedule.filter(s => s.FilledPartialSlot).length}`);

  // Assign trucks to time slots
  let truckAssignments = [];
  if (schedule.length > 0) {
    truckAssignments = await assignTrucksToTimeSlots(schedule, buildingCache);
  }

  return {
    schedule,
    truckAssignments,
    unscheduledOrders: remainingOrders
  };
}

// Truck assignment to time slots
async function assignTrucksToTimeSlots(schedule, buildingCache) {
  console.log("\n🚛 Starting truck assignment to time slots...");

  // Group scheduled orders by time slot (date + time window)
  const slotGroups = {};
  for (const order of schedule) {
    const slotKey = `${order.SlotDate}_${order.SlotWindow}`;
    if (!slotGroups[slotKey]) {
      slotGroups[slotKey] = {
        date: order.SlotDate,
        timeWindow: order.SlotWindow,
        orders: []
      };
    }
    slotGroups[slotKey].orders.push(order);
  }

  const { getAllDocs } = await import("./informationService");
  const allTrucks = await getAllDocs("Truck");
  const allTimeSlots = await getAllTimeSlots();
  const truckAssignments = [];

  // For each slot, assign ONE truck
  for (const [slotKey, slotData] of Object.entries(slotGroups)) {
    const orders = slotData.orders;

    // Calculate total load for slot
    let totalVolumeCm3 = 0;
    const zoneIds = new Set();

    for (const order of orders) {
      const orderProducts = await getOrderProductsByOrderId(order.OrderID);
      for (const op of orderProducts) {
        const product = await getProductById(op.ProductID);
        const volume = (product.PackageLengthCm || 0) *
                       (product.PackageWidthCm || 0) *
                       (product.PackageHeightCm || 0);
        totalVolumeCm3 += volume * (op.Quantity || 1);
      }

      const building = buildingCache[order.BuildingID];
      if (building?.zone_id) zoneIds.add(building.zone_id);
    }

    console.log(`\n📦 Slot ${slotKey}:`);
    console.log(`   Orders: ${orders.length}`);
    console.log(`   Total Volume: ${totalVolumeCm3.toLocaleString()} cm³`);
    console.log(`   Zones: [${[...zoneIds].join(', ')}]`);

    // Find time slot record
    const timeSlot = allTimeSlots.find(ts =>
      ts.Date === slotData.date &&
      `${ts.TimeWindowStart} - ${ts.TimeWindowEnd}` === slotData.timeWindow
    );

    if (!timeSlot) {
      console.error(`❌ Time slot not found for ${slotKey}`);
      continue;
    }

    // Find available trucks (not already assigned to this date + time)
    const assignedTruckIds = truckAssignments
      .filter(ta => ta.date === slotData.date && ta.timeWindow === slotData.timeWindow)
      .map(ta => ta.truckId);

    const availableTrucks = allTrucks.filter(t => !assignedTruckIds.includes(t.id));

    let assignedTruck = null;

    // STEP 1: Try to assign truck from primary zone that fits load
    for (const zoneId of zoneIds) {
      const zoneTrucks = availableTrucks.filter(truck => {
        return truck.truck_zones?.some(tz => tz.zone_id === zoneId && tz.is_primary_zone);
      });

      const fitTrucks = zoneTrucks.filter(truck => {
        const truckVolume = (truck.length_cm || 0) * (truck.width_cm || 0) * (truck.height_cm || 0);
        return truckVolume >= totalVolumeCm3;
      });

      if (fitTrucks.length > 0) {
        // Randomly select from zone trucks that fit
        assignedTruck = fitTrucks[Math.floor(Math.random() * fitTrucks.length)];
        console.log(`✅ Assigned zone truck ${assignedTruck.plate_no} (primary zone, random selection)`);
        break;
      }
    }

    // STEP 2: If no zone truck fits, check if any truck can fit load
    if (!assignedTruck) {
      const fitTrucks = availableTrucks.filter(truck => {
        const truckVolume = (truck.length_cm || 0) * (truck.width_cm || 0) * (truck.height_cm || 0);
        return truckVolume >= totalVolumeCm3;
      });

      if (fitTrucks.length === 0) {
        // Load exceeds all truck capacity - move orders to next slot
        console.log(`⚠️ Load ${totalVolumeCm3.toLocaleString()} cm³ exceeds all truck capacity`);
        console.log(`🔄 Orders need to be rescheduled to accommodate load...`);
        // Note: Actual rescheduling would require re-running scheduler
        continue;
      }

      // Randomly select from trucks that fit
      assignedTruck = fitTrucks[Math.floor(Math.random() * fitTrucks.length)];
      console.log(`⚠️ No zone truck available, randomly assigned ${assignedTruck.plate_no}`);
    }

    // STEP 3: If no truck available (all assigned), randomly select any truck
    if (!assignedTruck && availableTrucks.length === 0) {
      assignedTruck = allTrucks[Math.floor(Math.random() * allTrucks.length)];
      console.log(`⚠️ All trucks busy, randomly assigned ${assignedTruck.plate_no} (may have conflict)`);
    }

    // If still no truck (edge case), skip
    if (!assignedTruck) {
      console.error(`❌ No truck could be assigned to slot ${slotKey}`);
      continue;
    }

    // Update time slot with truck assignment via API
    try {
      const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";
      await fetch(`${API_BASE_URL}/api/time-slots/${timeSlot.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truck_id: assignedTruck.id
        })
      });

      truckAssignments.push({
        slotId: timeSlot.id,
        date: slotData.date,
        timeWindow: slotData.timeWindow,
        truckId: assignedTruck.id,
        truckPlateNo: assignedTruck.plate_no,
        orderIds: orders.map(o => o.OrderID),
        totalVolumeCm3,
        zones: [...zoneIds]
      });

      console.log(`✅ Truck ${assignedTruck.plate_no} assigned to slot ${slotKey}`);
    } catch (error) {
      console.error(`❌ Failed to update time slot ${timeSlot.id}:`, error.message);
    }
  }

  console.log(`\n🚛 Truck Assignment Summary: ${truckAssignments.length} slots assigned`);
  return truckAssignments;
}

// Helper function remains the same
async function calculateOrderTime(order) {
  const orderProducts = await getOrderProductsByOrderId(order.OrderID);
  let totalMinutes = 0;

  for (const op of orderProducts) {
    const product = await getProductById(op.ProductID);
    if (!product) continue;

    // PRIORITY 1: Use custom installation time from order_products
    if (op.CustomInstallationTimeMin) {
      totalMinutes += op.CustomInstallationTimeMin;
    }
    // PRIORITY 2: Use dismantle time if required
    else if (op.DismantleRequired) {
      totalMinutes += (op.DismantleTimeMin || product.DismantleTimeMin || 0);
    }
    // PRIORITY 3: Use product default installation time
    else {
      totalMinutes += (product.EstimatedInstallationTimeMin || 0);
    }
  }

  return totalMinutes;
}

// Generate time slots for next 2 weeks
async function generateTimeSlots() {
  console.log("🗓️ Generating default timeslots for next 2 weeks (14 days)...");
  const today = dayjs().startOf("day");
  const timeslotTemplate = [
    { start: "08:00", end: "12:00" },
    { start: "13:00", end: "19:00" },
    { start: "19:00", end: "21:00" }
  ];

  let createdCount = 0;

  for (let i = 1; i <= 14; i++) {
    const day = today.add(i, "day");
    const dayOfWeek = day.day();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    for (const t of timeslotTemplate) {
      const existingSlots = await getAllTimeSlots();
      const exists = existingSlots.find(
        s => s.Date === day.format("YYYY-MM-DD") && s.TimeWindowStart === t.start
      );
      if (!exists) {
        await addTimeSlot({
          Date: day.format("YYYY-MM-DD"),
          TimeWindowStart: t.start,
          TimeWindowEnd: t.end,
          AvailableFlag: true
        });
        createdCount++;
        console.log(`➕ Created timeslot ${t.start}-${t.end} on ${day.format("YYYY-MM-DD")}`);
      }
    }
  }
  console.log(`📌 Total new timeslots created: ${createdCount}`);
}

// Optimized sequence function remains the same
function optimizeOrderSequence(orders, distanceMatrix, slotStartTime, slotEndTime, depot) {
  if (orders.length <= 1) return orders;
  
  const optimized = [];
  const unvisited = new Set(orders.map((_, i) => i));
  let currentIdx = 0;
  let currentTime = slotStartTime.clone();
  
  optimized.push(orders[currentIdx]);
  unvisited.delete(currentIdx);
  
  while (unvisited.size > 0) {
    let nearestIdx = -1;
    let minTime = Infinity;
    
    for (const idx of unvisited) {
      const travel = distanceMatrix[currentIdx][idx];
      if (travel && travel.durationMinutes < minTime) {
        minTime = travel.durationMinutes;
        nearestIdx = idx;
      }
    }
    
    if (nearestIdx === -1) break;
    
    const travelTime = distanceMatrix[currentIdx][nearestIdx].durationMinutes;
    const nextOrder = orders[nearestIdx];
    
    currentTime = currentTime.add(travelTime, "minute");
    
    if (currentTime.add(nextOrder.workMinutes, "minute").isAfter(slotEndTime)) {
      break;
    }
    
    optimized.push(nextOrder);
    unvisited.delete(nearestIdx);
    currentIdx = nearestIdx;
    currentTime = currentTime.add(nextOrder.workMinutes, "minute");
  }
  
  return optimized;
}
