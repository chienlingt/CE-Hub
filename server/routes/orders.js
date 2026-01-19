// server/routes/orders.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { extractBuildingName, normalizeBuildingName } = require('../utils/addressParser');
const { scheduleOrders, updateTimeslotResources } = require('../services/scheduler');
const dayjs = require('dayjs');
const { getCoordinatesFromAddress, calculateRoute } = require('../services/routingService');

const TRAVEL_FALLBACK_MINUTES = 17;

function getTruckVolumeCm3(truck) {
  const length = Number(truck?.length_cm || 0);
  const width = Number(truck?.width_cm || 0);
  const height = Number(truck?.height_cm || 0);
  return length * width * height;
}

function getMaxCapacityByTone(trucks, tonePredicate) {
  let maxCapacity = 0;
  for (const truck of trucks) {
    const tone = Number(truck?.tone || 0);
    if (!tonePredicate(tone)) continue;
    const volume = getTruckVolumeCm3(truck);
    if (volume > maxCapacity) maxCapacity = volume;
  }
  return maxCapacity;
}

function pickTruckForVolume(trucks, minTone, totalVolumeCm3) {
  const candidates = trucks
    .filter(truck => Number(truck?.tone || 0) >= minTone)
    .map(truck => ({ truck, volume: getTruckVolumeCm3(truck) }))
    .filter(entry => entry.volume >= totalVolumeCm3)
    .sort((a, b) => {
      const toneA = Number(a.truck?.tone || 0);
      const toneB = Number(b.truck?.tone || 0);
      if (toneA !== toneB) return toneA - toneB;
      return a.volume - b.volume;
    });

  return candidates.length > 0 ? candidates[0].truck : null;
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
    where: { [fieldName]: { in: teamIds } },
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

async function ensureTimeslotAssignments(timeslotId, totalVolumeCm3) {
  const orderCount = await prisma.orders.count({
    where: { time_slot_id: timeslotId, order_status: 'Scheduled' }
  });

  if (orderCount === 0) {
    await prisma.time_slots.update({
      where: { id: timeslotId },
      data: { delivery_team_id: null, warehouse_team_id: null, truck_id: null }
    });
    return;
  }

  const [timeslot, teams, trucks] = await Promise.all([
    prisma.time_slots.findUnique({ where: { id: timeslotId } }),
    prisma.teams.findMany({
      include: { assignments: { include: { employee: { include: { role: true } } } } }
    }),
    prisma.trucks.findMany()
  ]);

  if (!timeslot) return;

  const deliveryCandidates = teams.filter(t => teamHasSomeRoles(t, 'delivery'));
  const warehouseCandidates = teams.filter(t => teamHasAllRoles(t, 'storekeeper'));

  const deliveryCounts = await getTeamAssignmentCounts(deliveryCandidates.map(t => t.id), 'delivery_team_id');
  const warehouseCounts = await getTeamAssignmentCounts(warehouseCandidates.map(t => t.id), 'warehouse_team_id');

  const deliveryTeam = timeslot.delivery_team_id && deliveryCandidates.some(t => t.id === timeslot.delivery_team_id)
    ? deliveryCandidates.find(t => t.id === timeslot.delivery_team_id)
    : pickLeastUsedTeam(deliveryCandidates, deliveryCounts);

  const warehouseTeam = timeslot.warehouse_team_id && warehouseCandidates.some(t => t.id === timeslot.warehouse_team_id)
    ? warehouseCandidates.find(t => t.id === timeslot.warehouse_team_id)
    : pickLeastUsedTeam(warehouseCandidates, warehouseCounts);

  const maxOneTonCapacity = getMaxCapacityByTone(trucks, tone => tone > 0 && tone <= 1);
  const requiredTone = totalVolumeCm3 > maxOneTonCapacity && maxOneTonCapacity > 0 ? 3 : 1;
  const truckCounts = await getTruckAssignmentCounts(trucks.map(t => t.id));
  const currentTruck = timeslot.truck_id ? trucks.find(t => t.id === timeslot.truck_id) : null;
  const currentTruckFits = currentTruck
    && Number(currentTruck?.tone || 0) >= requiredTone
    && getTruckVolumeCm3(currentTruck) >= totalVolumeCm3;
  const chosenTruck = currentTruckFits ? currentTruck : pickLeastUsedTruck(trucks, truckCounts, requiredTone, totalVolumeCm3);

  await prisma.time_slots.update({
    where: { id: timeslotId },
    data: {
      delivery_team_id: deliveryTeam?.id || null,
      warehouse_team_id: warehouseTeam?.id || null,
      truck_id: chosenTruck?.id || null
    }
  });
}

async function clearTimeslotIfEmpty(timeslotId) {
  const remaining = await prisma.orders.count({
    where: { time_slot_id: timeslotId, order_status: 'Scheduled' }
  });
  if (remaining === 0) {
    await prisma.time_slots.update({
      where: { id: timeslotId },
      data: { delivery_team_id: null, warehouse_team_id: null, truck_id: null }
    });
  }
}

function calculateOrderServiceMinutes(order) {
  let totalDeliveryMinutes = 0;
  let totalInstallationMinutes = 0;
  let hasAnyInstallationNeeded = false;

  for (const op of order.order_products || []) {
    const product = op.products || {};
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

    if (includeInstallation) {
      hasAnyInstallationNeeded = true;
      if (op.dismantle_required) {
        const dismantleMinutes = (op.custom_dismantle_time ?? product.dismantle_time) || 0;
        totalInstallationMinutes += Number(dismantleMinutes || 0) * Math.max(quantity, 1);
      }

      let installationMinutes = 0;
      if (minMinutes !== null && maxMinutes !== null) {
        installationMinutes = (Number(minMinutes) + Number(maxMinutes)) / 2;
      } else if (minMinutes !== null) {
        installationMinutes = Number(minMinutes);
      } else if (maxMinutes !== null) {
        installationMinutes = Number(maxMinutes);
      }

      totalInstallationMinutes += installationMinutes * Math.max(quantity, 1);
    }
  }

  totalDeliveryMinutes = order.order_products?.length ? (hasAnyInstallationNeeded ? 0 : 10) : 0;
  return totalDeliveryMinutes + totalInstallationMinutes;
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

async function estimateTravelMinutes(fromAddress, toAddress) {
  if (!fromAddress || !toAddress) {
    return TRAVEL_FALLBACK_MINUTES;
  }

  try {
    const fromCoords = await getCoordinatesFromAddress(fromAddress);
    const toCoords = await getCoordinatesFromAddress(toAddress);
    const route = await calculateRoute([fromCoords, toCoords], new Date());
    const durationSeconds = route.durationWithTraffic ?? route.duration ?? 0;
    return Math.max(Math.ceil(durationSeconds / 60), 1);
  } catch (error) {
    console.warn('[Order Reassign] Travel estimate fallback:', error.message);
    return TRAVEL_FALLBACK_MINUTES;
  }
}

router.get('/', async (req, res) => {
  try {
    const { status, search, date_from, date_to, sort = 'created_desc' } = req.query;
    const includeProducts = req.query.include_products !== 'false';

    // Build where clause
    const where = {};

    // Status filter
    if (status && status !== 'all') {
      where.order_status = status;
    }

    // Date range filter (on created_at)
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) {
        where.created_at.gte = new Date(date_from);
      }
      if (date_to) {
        // Include the entire end date
        const endDate = new Date(date_to);
        endDate.setHours(23, 59, 59, 999);
        where.created_at.lte = endDate;
      }
    }

    // Search filter (customer name, phone, building, order id)
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { customers: { full_name: { contains: search, mode: 'insensitive' } } },
        { customers: { phone: { contains: search } } },
        { buildings: { building_name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    // Issues filter
    if (req.query.issues_only === 'true') {
        where.AND = [
            { issue_reason: { not: null } },
            { issue_reason: { not: '' } }
        ];
    }

    // Build orderBy clause
    let orderBy = {};
    switch (sort) {
      case 'created_desc':
        orderBy = { created_at: 'desc' };
        break;
      case 'created_asc':
        orderBy = { created_at: 'asc' };
        break;
      case 'scheduled_desc':
        orderBy = { scheduled_start_date_time: 'desc' };
        break;
      case 'scheduled_asc':
        orderBy = { scheduled_start_date_time: 'asc' };
        break;
      case 'customer':
        orderBy = { customers: { full_name: 'asc' } };
        break;
      default:
        orderBy = { created_at: 'desc' };
    }

    const include = {
      customers: true,
      employees: true,
      buildings: true,
    };

    if (includeProducts) {
      include.order_products = {
        include: {
          products: {
            select: {
              id: true,
              product_name: true,
              package_length_cm: true,
              package_width_cm: true,
              package_height_cm: true,
              fragile_flag: true,
              installer_team_required_flag: true,
              dismantle_time: true,
              estimated_installation_time_min: true,
              estimated_installation_time_max: true,
              no_lie_down_flag: true,
              dismantle_required_flag: true
            }
          }
        }
      };
    }

    const orders = await prisma.orders.findMany({
      where,
      include,
      orderBy
    });

    res.json(orders);
  } catch (err) {
    console.error('GET /api/orders error', err);
    res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customer, building, products, employee, service_type } = req.body;

    // Create customer (or use existing if id provided)
    let createdCustomer;
    if (customer.id) {
      // Use existing customer
      createdCustomer = await prisma.customers.findUnique({
        where: { id: customer.id }
      });
    } else {
      // Create new customer
      createdCustomer = await prisma.customers.create({
        data: {
          full_name: customer.full_name,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          city: customer.city,
          state: customer.state,
          postcode: customer.postcode,
        },
      });
    }

    // Extract building name from customer address
    const extractedBuildingName = extractBuildingName(customer.address);
    const normalizedName = normalizeBuildingName(extractedBuildingName);

    console.log(`Extracted building name from address "${customer.address}": ${extractedBuildingName}`);

    // Check if building already exists (to share access constraints)
    let existingBuilding = await prisma.buildings.findFirst({
      where: {
        building_name: {
          equals: extractedBuildingName,
          mode: 'insensitive' // Case-insensitive search
        }
      }
    });

    let finalBuilding;

    if (existingBuilding) {
      // Use existing building (shares access constraints)
      console.log(`Using existing building: ${existingBuilding.building_name} (ID: ${existingBuilding.id})`);
      finalBuilding = existingBuilding;
    } else {
      // Create new building with extracted name
      console.log(`Creating new building: ${extractedBuildingName}`);
      finalBuilding = await prisma.buildings.create({
        data: {
          building_name: extractedBuildingName,
          housing_type: building?.housing_type || 'Residential',
          zone_id: building?.zone_id || null,
          postal_code: customer.postcode,
          // Default access constraints (can be updated later by admin)
          loading_bay_available: building?.loading_bay_available || false,
          lift_available: building?.lift_available || false,
          access_time_window_start: building?.access_time_window_start || '08:00',
          access_time_window_end: building?.access_time_window_end || '20:00',
          pre_registration_required: building?.pre_registration_required || false,
          created_at: new Date()
        },
      });
    }

    // Create order
    const order = await prisma.orders.create({
      data: {
        customer_id: createdCustomer.id,
        building_id: finalBuilding.id,
        employee_id: employee || null,
        order_status: 'Pending',
        special_equipment_needed: req.body.special_equipment_needed || null,
        created_at: new Date(),
        updated_at: new Date(),
        // Snapshot the delivery address at the time of order creation
        delivery_address: customer.address,
        delivery_city: customer.city,
        delivery_postcode: customer.postcode,
        delivery_state: customer.state,
        order_products: {
          create: products.map((p) => ({
            product_id: p.product_id,
            quantity: p.quantity,
            dismantle_required: p.dismantle_required,
            service_type: p.service_type || service_type || 'delivery',
            custom_installation_time_min: p.custom_installation_time_min || null,
            custom_installation_time_max: p.custom_installation_time_max || null,
          })),
        },
      },
      include: {
        customers: true,
        buildings: true,
        order_products: {
          include: {
            products: {
              select: {
                id: true,
                product_name: true,
                package_length_cm: true,
                package_width_cm: true,
                package_height_cm: true,
                fragile_flag: true,
                installer_team_required_flag: true,
                dismantle_time: true,
                estimated_installation_time_min: true,
                estimated_installation_time_max: true,
                no_lie_down_flag: true,
                dismantle_required_flag: true
              }
            }
          }
        },
      },
    });

    res.status(201).json({
      success: true,
      order,
      buildingInfo: {
        buildingId: finalBuilding.id,
        buildingName: finalBuilding.building_name,
        isExisting: !!existingBuilding,
        accessTimeWindowStart: finalBuilding.access_time_window_start,
        accessTimeWindowEnd: finalBuilding.access_time_window_end
      }
    });
  } catch (err) {
    console.error('POST /api/orders error', err);
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: err.message,
    });
  }
});


router.put('/:id', async (req, res) => {
  try {
    const { customer, building, employee, products, ...data } = req.body;

    // Fetch current order
    const existingOrder = await prisma.orders.findUnique({
      where: { id: req.params.id }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const previousTimeSlotId = existingOrder.time_slot_id;

    // Check if order status allows editing
    if (existingOrder.order_status === 'Delivered') {
      return res.status(400).json({ error: 'Cannot edit delivered orders' });
    }

    // Check edit deadline if order is scheduled
    if (existingOrder.scheduled_start_date_time) {
      // Fetch edit deadline setting
      const editDeadlineSetting = await prisma.system_settings.findUnique({
        where: { setting_key: 'order_edit_deadline_hours' }
      });

      const deadlineHours = editDeadlineSetting ? parseInt(editDeadlineSetting.setting_value) : 24;
      const scheduledTime = new Date(existingOrder.scheduled_start_date_time);
      const editDeadline = new Date(scheduledTime.getTime() - (deadlineHours * 60 * 60 * 1000));

      if (new Date() > editDeadline) {
        return res.status(400).json({
          error: `Edit deadline has passed. Orders cannot be edited within ${deadlineHours} hours of scheduled delivery.`,
          deadline: editDeadline.toISOString()
        });
      }
    }

    // Build update data
    const updateData = { ...data, updated_at: new Date() };
    if (customer) updateData.customer_id = customer;
    if (building) updateData.building_id = building;
    if (employee) updateData.employee_id = employee;

    // If products array is provided, update order_products
    if (products && Array.isArray(products)) {
      // Delete existing order_products
      await prisma.order_products.deleteMany({
        where: { order_id: req.params.id }
      });

      // Update order with new products
      const order = await prisma.orders.update({
        where: { id: req.params.id },
        data: {
          ...updateData,
          order_products: {
            create: products.map((p) => ({
              product_id: p.product_id,
              quantity: p.quantity,
              dismantle_required: p.dismantle_required,
              service_type: p.service_type || 'delivery',
              custom_installation_time_min: p.custom_installation_time_min || null,
              custom_installation_time_max: p.custom_installation_time_max || null,
            }))
          }
        },
        include: {
          customers: true,
          employees: true,
          buildings: true,
          order_products: {
            include: {
              products: {
                select: {
                  id: true,
                  product_name: true,
                  package_length_cm: true,
                  package_width_cm: true,
                  package_height_cm: true,
                  fragile_flag: true,
                  installer_team_required_flag: true,
                  dismantle_time: true,
                  estimated_installation_time_min: true,
                  estimated_installation_time_max: true,
                  no_lie_down_flag: true,
                  dismantle_required_flag: true
                }
              }
            }
          }
        }
      });

      return res.json({ success: true, order });
    } else {
      // Update order without changing products
      const order = await prisma.orders.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          customers: true,
          employees: true,
          buildings: true,
          order_products: {
            include: {
              products: {
                select: {
                  id: true,
                  product_name: true,
                  package_length_cm: true,
                  package_width_cm: true,
                  package_height_cm: true,
                  fragile_flag: true,
                  installer_team_required_flag: true,
                  dismantle_time: true,
                  estimated_installation_time_min: true,
                  estimated_installation_time_max: true,
                  no_lie_down_flag: true,
                  dismantle_required_flag: true
                }
              }
            }
          }
        }
      });

      return res.json({ success: true, order });
    }
  } catch (err) {
    console.error('PUT /api/orders/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Failed to update order', details: err.message });
  }
});

// PATCH /:id/status - Update order_status only (shared by warehouse/delivery/installer)
router.patch('/:id/status', async (req, res) => {
  try {
    const { order_status } = req.body || {};

    if (!order_status || typeof order_status !== 'string') {
      return res.status(400).json({ error: 'order_status is required' });
    }

    const now = new Date();
    const existingOrder = await prisma.orders.findUnique({
      where: { id: req.params.id },
      select: {
        delivery_start_date_time: true,
        delivery_end_date_time: true,
        install_start_date_time: true,
        install_end_date_time: true
      }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const data = {
      order_status,
      updated_at: now
    };

    if (order_status === 'Delivering') {
      data.delivery_start_date_time = now;
      data.actual_start_date_time = now;
    }

    if (order_status === 'Delivered') {
      data.delivery_end_date_time = now;
      data.actual_arrival_date_time = now;
    }

    if (order_status === 'Installing') {
      data.install_start_date_time = now;
    }

    if (order_status === 'Completed') {
      if (!existingOrder.delivery_end_date_time) {
        data.delivery_end_date_time = now;
        data.actual_arrival_date_time = now;
      }
      if (existingOrder.install_start_date_time && !existingOrder.install_end_date_time) {
        data.install_end_date_time = now;
      }
    }

    const updatedOrder = await prisma.orders.update({
      where: { id: req.params.id },
      data
    });

    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('PATCH /api/orders/:id/status error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Failed to update order status', details: err.message });
  }
});

// PATCH /:id - Reassign order to different timeslot (admin only)
router.patch('/:id', async (req, res) => {
  try {
    const { time_slot_id, force_truck_tone, scheduled_start_date_time, scheduled_end_date_time } = req.body;

    if (time_slot_id === undefined) {
      return res.status(400).json({ error: 'time_slot_id is required' });
    }

    // Fetch current order
    const existingOrder = await prisma.orders.findUnique({
      where: { id: req.params.id },
      include: {
        customers: true,
        buildings: true,
        order_products: { include: { products: true } }
      }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const previousTimeSlotId = existingOrder.time_slot_id;

    // Check if order status allows reassignment
    if (existingOrder.order_status === 'Delivered') {
      return res.status(400).json({ error: 'Cannot reassign delivered orders' });
    }

    if (!time_slot_id) {
      const updatedOrder = await prisma.orders.update({
        where: { id: req.params.id },
        data: {
          time_slot_id: null,
          scheduled_start_date_time: null,
          scheduled_end_date_time: null,
          order_status: 'Pending',
          updated_at: new Date()
        },
        include: {
          time_slots: true,
          customers: true,
          buildings: true,
          order_products: {
            include: {
              products: {
                select: {
                  id: true,
                  product_name: true,
                  package_length_cm: true,
                  package_width_cm: true,
                  package_height_cm: true,
                  fragile_flag: true,
                  installer_team_required_flag: true,
                  dismantle_time: true,
                  estimated_installation_time_min: true,
                  estimated_installation_time_max: true,
                  no_lie_down_flag: true,
                  dismantle_required_flag: true
                }
              }
            }
          }
        }
      });

      if (previousTimeSlotId) {
        await updateTimeslotResources(previousTimeSlotId);
      }

      return res.json({
        success: true,
        order: updatedOrder,
        message: 'Order unassigned'
      });
    }

    // Verify new timeslot exists
    const newTimeslot = await prisma.time_slots.findUnique({
      where: { id: time_slot_id }
    });

    if (!newTimeslot) {
      return res.status(404).json({ error: 'Timeslot not found' });
    }

    const slotDate = newTimeslot.date;
    const slotStart = dayjs(`${slotDate} ${newTimeslot.time_window_start}`);
    const slotEnd = dayjs(`${slotDate} ${newTimeslot.time_window_end}`);

    const building = existingOrder.buildings;

    const slotOrders = await prisma.orders.findMany({
      where: {
        time_slot_id,
        id: { not: existingOrder.id }
      },
      include: {
        customers: true,
        buildings: true,
        order_products: { include: { products: true } }
      },
      orderBy: {
        scheduled_end_date_time: 'desc'
      }
    });

    const lastOrder = slotOrders.find(o => o.scheduled_end_date_time);
    const orderVolumeCm3 = calculateOrderVolumeCm3(existingOrder);
    const slotVolumeCm3 = slotOrders.reduce((sum, order) => sum + calculateOrderVolumeCm3(order), 0);
    const totalVolumeCm3 = slotVolumeCm3 + orderVolumeCm3;

    const manualStart = scheduled_start_date_time ? dayjs(scheduled_start_date_time) : null;
    const manualEnd = scheduled_end_date_time ? dayjs(scheduled_end_date_time) : null;

    if (manualStart && manualEnd) {
      if (!manualStart.isValid() || !manualEnd.isValid()) {
        return res.status(400).json({ error: 'Invalid scheduled time provided' });
      }

      if (!manualEnd.isAfter(manualStart)) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }

      if (manualStart.isBefore(slotStart) || manualEnd.isAfter(slotEnd)) {
        return res.status(409).json({
          error: 'Selected time is outside the timeslot window',
          code: 'TIME_WINDOW'
        });
      }

      if (building?.access_time_window_start && building?.access_time_window_end) {
        const accessStart = dayjs(`${slotDate} ${building.access_time_window_start}`);
        const accessEnd = dayjs(`${slotDate} ${building.access_time_window_end}`);
        if (manualStart.isBefore(accessStart) || manualEnd.isAfter(accessEnd)) {
          return res.status(409).json({
            error: 'Order exceeds building access window',
            code: 'ACCESS_WINDOW'
          });
        }
      }

      const hasOverlap = slotOrders.some(existing => {
        const existingStart = existing.scheduled_start_date_time ? dayjs(existing.scheduled_start_date_time) : null;
        const existingEnd = existing.scheduled_end_date_time ? dayjs(existing.scheduled_end_date_time) : null;
        if (!existingStart || !existingEnd) return false;
        return manualStart.isBefore(existingEnd) && manualEnd.isAfter(existingStart);
      });

      if (hasOverlap) {
        return res.status(409).json({
          error: 'Timeslot is occupied for the selected time range',
          code: 'TIME_CONFLICT'
        });
      }

    } else {
      const orderServiceMinutes = calculateOrderServiceMinutes(existingOrder);
      let fromAddress = null;
      if (lastOrder) {
        fromAddress = lastOrder.customers?.address || lastOrder.buildings?.address || lastOrder.buildings?.building_name || null;
      }
      if (!fromAddress) {
        const config = await prisma.scheduler_config.findFirst();
        fromAddress = config?.warehouse_address || null;
      }

      const toAddress = existingOrder.customers?.address || existingOrder.buildings?.address || existingOrder.buildings?.building_name || null;
      const travelMinutes = await estimateTravelMinutes(fromAddress, toAddress);

      let availableStart = slotStart.clone();
      if (lastOrder?.scheduled_end_date_time) {
        const lastEnd = dayjs(lastOrder.scheduled_end_date_time);
        if (lastEnd.isAfter(availableStart)) {
          availableStart = lastEnd;
        }
      }

      let orderStart = availableStart.add(travelMinutes, 'minute');
      if (building?.access_time_window_start) {
        const accessStart = dayjs(`${slotDate} ${building.access_time_window_start}`);
        if (orderStart.isBefore(accessStart)) {
          orderStart = accessStart;
        }
      }

      const orderEnd = orderStart.add(orderServiceMinutes, 'minute');
      if (building?.access_time_window_end) {
        const accessEnd = dayjs(`${slotDate} ${building.access_time_window_end}`);
        if (orderEnd.isAfter(accessEnd)) {
          return res.status(409).json({
            error: 'Order exceeds building access window',
            code: 'ACCESS_WINDOW'
          });
        }
      }

      if (orderEnd.isAfter(slotEnd)) {
        return res.status(409).json({
          error: 'Timeslot is occupied or not enough time in selected timeslot',
          code: 'TIME_WINDOW'
        });
      }

      req.body.scheduled_start_date_time = orderStart.toDate();
      req.body.scheduled_end_date_time = orderEnd.toDate();
    }

    const allTrucks = await prisma.trucks.findMany();
    const maxThreeTonCapacity = getMaxCapacityByTone(allTrucks, tone => tone >= 3);
    if (maxThreeTonCapacity > 0 && totalVolumeCm3 > maxThreeTonCapacity) {
      return res.status(409).json({
        error: 'Truck not fit for this order size',
        code: 'TRUCK_NOT_FIT'
      });
    }

    // Update order timeslot
    const updatedOrder = await prisma.orders.update({
      where: { id: req.params.id },
      data: {
        time_slot_id: time_slot_id,
        scheduled_start_date_time: manualStart ? manualStart.toDate() : req.body.scheduled_start_date_time,
        scheduled_end_date_time: manualEnd ? manualEnd.toDate() : req.body.scheduled_end_date_time,
        order_status: 'Scheduled',
        updated_at: new Date()
      },
      include: {
        time_slots: true,
        customers: true,
        buildings: true,
        order_products: {
          include: {
            products: {
              select: {
                id: true,
                product_name: true,
                package_length_cm: true,
                package_width_cm: true,
                package_height_cm: true,
                fragile_flag: true,
                installer_team_required_flag: true,
                dismantle_time: true,
                estimated_installation_time_min: true,
                estimated_installation_time_max: true,
                no_lie_down_flag: true,
                dismantle_required_flag: true
              }
            }
          }
        }
      }
    });

    await updateTimeslotResources(time_slot_id);
    if (previousTimeSlotId && previousTimeSlotId !== time_slot_id) {
      await updateTimeslotResources(previousTimeSlotId);
    }

    console.log(`Order ${req.params.id} reassigned to timeslot ${time_slot_id}`);
    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('PATCH /api/orders/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Failed to reassign order', details: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.orders.delete({ where: { id: req.params.id } });
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/orders/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Failed to delete order', details: err.message });
  }
});

router.patch('/:id/issue', async (req, res) => {
  try {
    const { issue_status, issue_priority_level, issue_reason, issue_desc } = req.body;
    
    // Construct update data with only provided fields
    const data = {};
    if (issue_status !== undefined) data.issue_status = issue_status;
    if (issue_priority_level !== undefined) data.issue_priority_level = issue_priority_level;
    if (issue_reason !== undefined) data.issue_reason = issue_reason;
    if (issue_desc !== undefined) data.issue_desc = issue_desc;

    data.updated_at = new Date();

    const order = await prisma.orders.update({
      where: { id: req.params.id },
      data
    });
    
    res.json(order);
  } catch (err) {
    console.error('PATCH /api/orders/:id/issue error', err);
    res.status(500).json({ error: 'Failed to update order issue', details: err.message });
  }
});

module.exports = router;
