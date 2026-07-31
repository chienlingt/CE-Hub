// server/routes/orders.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { extractBuildingName, normalizeBuildingName } = require('../utils/addressParser');
const { scheduleOrders, updateTimeslotResources } = require('../services/scheduler');
const dayjs = require('dayjs');
const { getCoordinatesFromAddress, calculateRoute } = require('../services/routingService');

const { markOrderDelivering, markOrderDelivered, upsertEmployeeLocation } = require('../services/deliveryLifecycleService');
const { enqueue } = require('../services/integrationOutboxService');
const upload = require('../middleware/upload');
const { processDeliveryCompletion } = require('../services/deliveryCompletionService');

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

function isDeliveryTeamType(team) {
  return (team?.team_type || '').toLowerCase().includes('delivery');
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

  const deliveryCandidates = teams.filter(t => isDeliveryTeamType(t) && teamHasSomeRoles(t, 'delivery'));
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

// POST /api/orders/sync-odoo — manually trigger Odoo sync (A1.4)
// Optional query param: ?date=YYYY-MM-DD  overrides the default "tomorrow" target date
router.post('/sync-odoo', async (req, res) => {
  try {
    const { syncOrdersFromOdoo } = require('../services/odooSyncService');
    const targetDate = req.query.date || null;
    const result = await syncOrdersFromOdoo(targetDate);
    res.json({ success: true, date: targetDate || 'tomorrow', ...result });
  } catch (err) {
    console.error('POST /api/orders/sync-odoo error', err);
    res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

// GET /completed-deliveries — FR-04-004: admin view of completed delivery records
router.get('/completed-deliveries', async (req, res) => {
  try {
    const { date_from, date_to, sync_status } = req.query;

    const where = {
      order_status: { in: ['Delivered'] },
    };

    if (date_from || date_to) {
      where.delivery_end_date_time = {};
      if (date_from) where.delivery_end_date_time.gte = new Date(date_from);
      if (date_to)   where.delivery_end_date_time.lte = new Date(date_to);
    }

    const orders = await prisma.orders.findMany({
      where,
      include: {
        customers:  { select: { full_name: true, phone: true } },
        employees:  { select: { name: true, display_name: true } },
        time_slots: {
          select: {
            id: true,
            date: true,
            delivery_team: { select: { team_type: true } },
          },
        },
      },
      orderBy: { delivery_end_date_time: 'desc' },
    });

    const deliveredByIds = [...new Set(orders.map(o => o.delivered_by).filter(Boolean))];
    const deliveredByEmployees = deliveredByIds.length
      ? await prisma.employees.findMany({
          where: { id: { in: deliveredByIds } },
          select: { id: true, name: true, display_name: true },
        })
      : [];
    const deliveredByMap = new Map(
      deliveredByEmployees.map(e => [e.id, e.display_name || e.name || null])
    );

    // Attach latest outbox sync status per order
    const orderIds = orders.map(o => o.id);
    const outboxRows = orderIds.length
      ? await prisma.integration_outbox.findMany({
          where: {
            idempotency_key: { in: orders.map(o => `order:${o.id}:odoo:Delivered`) },
          },
          orderBy: { created_at: 'desc' },
        })
      : [];

    const outboxByOrder = {};
    for (const row of outboxRows) {
      const match = row.idempotency_key.match(/^order:([^:]+):odoo:/);
      if (match) outboxByOrder[match[1]] = outboxByOrder[match[1]] || row;
    }

    const result = orders.map(o => ({
      id:                     o.id,
      order_status:           o.order_status,
      customer_name:          o.customers?.full_name || '',
      driver_name:            deliveredByMap.get(o.delivered_by)
        || o.employees?.display_name || o.employees?.name
        || null,
      delivery_team_type:     o.time_slots?.delivery_team?.team_type || null,
      completed_at:           o.delivery_end_date_time,
      delivery_evidence:      o.delivery_evidence || [],
      proof_of_delivery_url:  o.proof_of_delivery_url || null,
      odoo_order_ref:         o.odoo_order_ref || null,
      delivery_address:       o.delivery_address || '',
      slot_id:                o.time_slot_id || null,
      odoo_sync: outboxByOrder[o.id]
        ? {
            status:      outboxByOrder[o.id].status,
            last_error:  outboxByOrder[o.id].last_error || null,
            attempts:    outboxByOrder[o.id].attempts,
            processed_at: outboxByOrder[o.id].processed_at || null,
          }
        : null,
    }));

    // Optional client-side filter by sync_status
    const filtered = sync_status
      ? result.filter(r => {
          if (sync_status === 'synced')  return r.odoo_sync?.status === 'processed';
          if (sync_status === 'pending') return !r.odoo_sync || r.odoo_sync.status === 'pending';
          if (sync_status === 'failed')  return r.odoo_sync?.status === 'dead';
          return true;
        })
      : result;

    res.json({ data: filtered, total: filtered.length });
  } catch (err) {
    console.error('GET /api/orders/completed-deliveries error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Driver order report predicate — full Update→Issue reports AND lightweight escalations
function driverOrderReportWhere(extra = {}) {
  return {
    AND: [
      { issue_reason: { not: null } },
      { issue_reason: { not: '' } },
      { issue_desc: { not: null } },
      { issue_desc: { not: '' } },
      {
        OR: [
          { is_complaint_submitted: true },
          { order_status: 'Issue' },
          { issue_reason: 'Driver Escalation' },
        ],
      },
    ],
    ...extra,
  };
}

const DRIVER_ESCALATION_REASON = 'Driver Escalation';

// GET /delivery-issues — driver order reports (Cases → Delivery Issues tab)
router.get('/delivery-issues', async (req, res) => {
  try {
    const { status = 'all', priority } = req.query;

    const where = driverOrderReportWhere();

    if (status === 'open') {
      where.OR = [
        { issue_status: null },
        { issue_status: { not: 'resolved' } },
      ];
    } else if (status === 'resolved') {
      where.issue_status = 'resolved';
    }

    if (priority) {
      where.issue_priority_level = { equals: priority, mode: 'insensitive' };
    }

    const orders = await prisma.orders.findMany({
      where,
      include: {
        customers: true,
        employees: { select: { id: true, name: true, display_name: true, email: true } },
        order_products: {
          include: {
            products: { select: { id: true, product_name: true } },
          },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    res.json(orders);
  } catch (err) {
    console.error('GET /api/orders/delivery-issues error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// PATCH /:id/escalation-ack — admin acknowledges a driver escalation
router.patch('/:id/escalation-ack', async (req, res) => {
  try {
    const order = await prisma.orders.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.issue_reason !== DRIVER_ESCALATION_REASON) {
      return res.status(400).json({ error: 'Order is not a driver escalation' });
    }

    const updated = await prisma.orders.update({
      where: { id: req.params.id },
      data:  { is_escalation_acknowledged: true, updated_at: new Date() },
    });

    res.json({ success: true, is_escalation_acknowledged: updated.is_escalation_acknowledged });
  } catch (err) {
    console.error('PATCH /api/orders/:id/escalation-ack error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { status, search, date_from, date_to, sort = 'created_desc' } = req.query;
    const includeProducts = req.query.include_products !== 'false';

    // Build where clause
    const where = {};

    // Status filter — supports comma-separated values (e.g. "Delivering,Delivered")
    if (status && status !== 'all') {
      const parts = status.split(',').map(s => s.trim()).filter(Boolean);
      where.order_status = parts.length > 1 ? { in: parts } : parts[0];
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

    // Issues filter — operational failures only; exclude driver order reports
    if (req.query.issues_only === 'true') {
        where.AND = [
            { issue_reason: { not: null } },
            { issue_reason: { not: '' } },
            {
              NOT: {
                AND: [
                  { issue_desc: { not: null } },
                  { issue_desc: { not: '' } },
                  {
                    OR: [
                      { is_complaint_submitted: true },
                      { order_status: 'Issue' },
                    ],
                  },
                ],
              },
            },
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
      // Replacement order(s) created via the Reschedule flow, if any
      rescheduled_to: { select: { id: true, odoo_order_ref: true, order_status: true, created_at: true } },
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

    // Resolve resolved_by → a display name (audit trail for the Resolved badge)
    const resolvedByIds = [...new Set(orders.map(o => o.resolved_by).filter(Boolean))];
    const resolvedByMap = new Map();
    if (resolvedByIds.length) {
      const resolvers = await prisma.employees.findMany({
        where:  { id: { in: resolvedByIds } },
        select: { id: true, name: true, display_name: true },
      });
      resolvers.forEach(e => resolvedByMap.set(e.id, e.display_name || e.name || null));
    }
    const result = orders.map(o => ({
      ...o,
      resolved_by_name: o.resolved_by ? (resolvedByMap.get(o.resolved_by) || null) : null,
    }));

    res.json(result);
  } catch (err) {
    console.error('GET /api/orders error', err);
    res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customer, building, products, employee, service_type, rescheduled_from_order_id, resolved_by } = req.body;

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
        rescheduled_from_order_id: rescheduled_from_order_id || null,
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

    // Reschedule link — auto-resolve the source failed case now that its
    // replacement order has actually been created (not just navigated to).
    if (rescheduled_from_order_id) {
      const now = new Date();
      await prisma.orders.update({
        where: { id: rescheduled_from_order_id },
        data:  { issue_status: 'resolved', resolved_by: resolved_by || null, resolved_at: now, updated_at: now },
      }).catch(err =>
        console.error('Failed to auto-resolve source order on reschedule:', err.message)
      );
    }

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
      // Only delete CE Hub-managed lines — Odoo-sourced lines have no product_id so are preserved
      await prisma.order_products.deleteMany({
        where: { order_id: req.params.id, NOT: { product_id: null } }
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
    const { order_status, employee_id, latitude, longitude } = req.body || {};

    if (!order_status || typeof order_status !== 'string') {
      return res.status(400).json({ error: 'order_status is required' });
    }

    // Treat incoming 'Completed' as 'Delivered' (statuses merged)
    const canonicalStatus = order_status === 'Completed' ? 'Delivered' : order_status;

    const now = new Date();
    const existingOrder = await prisma.orders.findUnique({
      where: { id: req.params.id },
      select: {
        delivery_start_date_time: true,
        delivery_end_date_time: true,
        install_start_date_time: true,
        install_end_date_time: true,
        employee_id: true,
      }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const data = {
      order_status: canonicalStatus,
      updated_at: now
    };

    if (canonicalStatus === 'Delivering') {
      data.delivery_start_date_time = now;
      data.actual_start_date_time = now;
    }

    if (canonicalStatus === 'Delivered') {
      data.delivery_end_date_time = now;
      data.actual_arrival_date_time = now;
      if (latitude  != null) data.delivered_latitude  = parseFloat(latitude);
      if (longitude != null) data.delivered_longitude = parseFloat(longitude);
    }

    if (canonicalStatus === 'Installing') {
      data.install_start_date_time = now;
    }

    const updatedOrder = await prisma.orders.update({
      where: { id: req.params.id },
      data
    });

    // Upsert driver location on every status change (best-effort)
    const driverId = employee_id || existingOrder.employee_id;
    const lat = latitude  != null ? parseFloat(latitude)  : null;
    const lng = longitude != null ? parseFloat(longitude) : null;
    await upsertEmployeeLocation(driverId, lat, lng);

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

    const slotAfterUpdate = await prisma.time_slots.findUnique({ where: { id: time_slot_id }, select: { delivery_team_id: true, date: true } });

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

// GET /:id — single order (used by notification routing and admin views)
router.get('/:id', async (req, res) => {
  try {
    const order = await prisma.orders.findUnique({
      where: { id: req.params.id },
      include: {
        customers: true,
        employees: { select: { id: true, name: true, display_name: true } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    console.error('GET /api/orders/:id error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// GET /:id/loading-status — A2: per-item loading/unloading status for an order
router.get('/:id/loading-status', async (req, res) => {
  try {
    const items = await prisma.order_products.findMany({
      where:   { order_id: req.params.id },
      include: { products: { select: { id: true, product_name: true } } },
      orderBy: { id: 'asc' },
    });

    if (!items.length) {
      return res.json({
        items: [], all_loaded: true, all_unloaded: true,
        ready_to_dispatch: true, loaded_count: 0, unloaded_count: 0, total: 0,
      });
    }

    // Resolve employee names for loaded_by / unloaded_by
    const empIds = [...new Set([
      ...items.filter(i => i.loaded_by).map(i => i.loaded_by),
      ...items.filter(i => i.unloaded_by).map(i => i.unloaded_by),
    ])];

    const empMap = {};
    if (empIds.length > 0) {
      const emps = await prisma.employees.findMany({
        where:  { id: { in: empIds } },
        select: { id: true, name: true, display_name: true },
      });
      emps.forEach(e => { empMap[e.id] = e.name || e.display_name || 'Unknown'; });
    }

    const enriched = items.map(item => ({
      ...item,
      loaded_by_name:   item.loaded_by   ? (empMap[item.loaded_by]   || 'Unknown') : null,
      unloaded_by_name: item.unloaded_by ? (empMap[item.unloaded_by] || 'Unknown') : null,
    }));

    const all_loaded   = enriched.every(i => ['loaded','unloaded'].includes(i.picking_status));
    const all_unloaded = enriched.every(i => i.picking_status === 'unloaded');

    // Fetch order-level status + delivery info
    const order = await prisma.orders.findUnique({
      where:  { id: req.params.id },
      select: { order_status: true, delivered_by: true, delivery_end_date_time: true },
    });

    let deliveredByName = null;
    if (order?.delivered_by) {
      const emp = await prisma.employees.findUnique({
        where:  { id: order.delivered_by },
        select: { name: true, display_name: true },
      });
      deliveredByName = emp?.name || emp?.display_name || null;
    }

    res.json({
      items:             enriched,
      all_loaded,
      all_unloaded,
      ready_to_dispatch: all_loaded,
      ready_to_deliver:  all_unloaded,
      loaded_count:   enriched.filter(i => ['loaded','unloaded'].includes(i.picking_status)).length,
      unloaded_count: enriched.filter(i => i.picking_status === 'unloaded').length,
      total:          enriched.length,
      order_status:   order?.order_status || null,
      delivered_by_name: deliveredByName,
      delivered_at:   order?.delivery_end_date_time || null,
    });
  } catch (err) {
    console.error('GET /api/orders/:id/loading-status error', err);
    res.status(500).json({ error: 'Failed to fetch loading status', details: err.message });
  }
});

// GET /:id/odoo-chatter-log — FR-06-003: history of Odoo chatter post attempts for this order
router.get('/:id/odoo-chatter-log', async (req, res) => {
  try {
    const rows = await prisma.integration_outbox.findMany({
      where: {
        event_type:      'ODOO_CHATTER_POST',
        idempotency_key: { startsWith: `order:${req.params.id}:odoo_chatter:` },
      },
      orderBy: { created_at: 'desc' },
      take: 5,
    });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/orders/:id/odoo-chatter-log error', err);
    res.status(500).json({ error: 'Failed to fetch Odoo chatter log', details: err.message });
  }
});

// POST /:id/dispatch — Option A: soft-deprecated in favour of POST /api/time-slots/:id/depart.
// Per-order dispatch bypassed the full A3 trip lifecycle (no slot depart, no on-the-way
// notifications, no lorry_trips update). Use slot depart from the driver "Leave warehouse" banner.
//
// Kept here commented out for easy rollback. Returns 410 Gone.
router.post('/:id/dispatch', async (req, res) => {
  return res.status(410).json({
    error: 'Per-order dispatch is no longer supported. Use POST /api/time-slots/:id/depart (driver Leave warehouse) to move orders to Delivering.',
    code:  'USE_SLOT_DEPART',
  });

  /* Original implementation preserved for rollback:
  try {
    const { employee_id } = req.body;

    const items = await prisma.order_products.findMany({
      where:   { order_id: req.params.id },
      include: { products: { select: { product_name: true } } },
    });

    const unloaded = items.filter(i => i.picking_status !== 'loaded');
    if (unloaded.length > 0) {
      return res.status(400).json({
        error:    'Cannot dispatch — not all items have been loaded onto the truck.',
        code:     'ITEMS_NOT_LOADED',
        unloaded: unloaded.map(i => ({
          id:           i.id,
          product_name: i.products?.product_name,
          status:       i.picking_status,
        })),
      });
    }

    const now     = new Date();
    const updated = await markOrderDelivering(req.params.id, { employeeId: employee_id, now });

    let dispatchedByName = null;
    if (employee_id) {
      const emp = await prisma.employees.findUnique({
        where: { id: employee_id },
        select: { name: true, display_name: true },
      });
      dispatchedByName = emp?.name || emp?.display_name || null;
    }

    if (updated.odoo_order_ref) {
      enqueue({
        eventType:      'SLOT_STATUS_CHANGED',
        target:         'odoo',
        payload:        { orderId: updated.id, odooRef: updated.odoo_order_ref, status: 'Delivering' },
        idempotencyKey: `order:${updated.id}:odoo:Delivering`,
      }).catch(e => console.error('[Dispatch] outbox enqueue failed:', e.message));
    }

    res.json({ success: true, order: updated, dispatched_by_name: dispatchedByName, dispatched_at: now });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    console.error('POST /api/orders/:id/dispatch error', err);
    res.status(500).json({ error: 'Failed to dispatch order', details: err.message });
  }
  */
});

// POST /:id/deliver — driver marks order as Delivered after unloading all items (A2 / A4)
// Accepts multipart/form-data for POD photos (field: photos) and optional signature (field: signature).
// Falls back to JSON body (employee_id only) for backwards compatibility with warehouse tablets.
router.post('/:id/deliver', upload.fields([
  { name: 'photos',    maxCount: 10 },
  { name: 'signature', maxCount: 1  },
]), async (req, res) => {
  try {
    const { employee_id, delivery_notes, signature_data_url, latitude, longitude } = req.body;

    const photoFiles   = req.files?.photos    || [];
    const sigFiles     = req.files?.signature || [];

    // Determine if this is a driver web completion (has POD) or a legacy warehouse tablet call
    const hasAnyPod = photoFiles.length > 0 || sigFiles.length > 0 || !!signature_data_url;

    const lat = latitude  != null ? parseFloat(latitude)  : null;
    const lng = longitude != null ? parseFloat(longitude) : null;

    if (hasAnyPod) {
      // A.4 path — driver web dashboard with full POD + completion chain
      const signatureDataUrl = signature_data_url || null;

      const result = await processDeliveryCompletion(req.params.id, {
        employeeId:       employee_id || null,
        deliveryNotes:    delivery_notes || null,
        photoFiles,
        signatureDataUrl,
        latitude:         lat,
        longitude:        lng,
      });

      return res.json({
        success:         true,
        order:           result.order,
        final_status:    result.finalStatus,
        slot_auto_closed: result.slotAutoClosed,
        auto_departed:   result.autoDeparted,
        odoo_enqueued:   result.odooEnqueued,
        delivered_at:    result.order.delivery_end_date_time,
      });
    }

    // Legacy path — warehouse tablet (no POD files) — existing behaviour preserved
    const items = await prisma.order_products.findMany({
      where:   { order_id: req.params.id },
      include: { products: { select: { product_name: true } } },
    });

    const notUnloaded = items.filter(i => i.picking_status !== 'unloaded');
    if (notUnloaded.length > 0) {
      return res.status(400).json({
        error:        'Cannot mark as delivered — not all items have been unloaded.',
        code:         'ITEMS_NOT_UNLOADED',
        not_unloaded: notUnloaded.map(i => ({ id: i.id, product_name: i.products?.product_name, status: i.picking_status })),
      });
    }

    const now     = new Date();
    const updated = await markOrderDelivered(req.params.id, { employeeId: employee_id, now, latitude: lat, longitude: lng });

    let deliveredByName = null;
    if (employee_id) {
      const emp = await prisma.employees.findUnique({
        where: { id: employee_id }, select: { name: true, display_name: true },
      });
      deliveredByName = emp?.name || emp?.display_name || null;
    }

    console.log(`[A2] Order ${req.params.id} delivered by ${deliveredByName || 'unknown'}`);

    // Enqueue Odoo write-back via outbox — never inline (A.3.2)
    if (updated.odoo_order_ref) {
      enqueue({
        eventType:      'SLOT_STATUS_CHANGED',
        target:         'odoo',
        payload:        { orderId: updated.id, odooRef: updated.odoo_order_ref, status: 'Delivered' },
        idempotencyKey: `order:${updated.id}:odoo:Delivered`,
      }).catch(e => console.error('[Deliver] outbox enqueue failed:', e.message));
    }

    res.json({ success: true, order: updated, delivered_by_name: deliveredByName, delivered_at: now });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    console.error('POST /api/orders/:id/deliver error', err);
    res.status(500).json({ error: 'Failed to mark as delivered', details: err.message });
  }
});

// POST /:id/parse-remarks — Parse delivery remarks using Gemini LLM (A1.3)
router.post('/:id/parse-remarks', async (req, res) => {
  try {
    const order = await prisma.orders.findUnique({
      where:   { id: req.params.id },
      include: { customers: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!order.delivery_remarks) {
      return res.status(400).json({ error: 'This order has no delivery remarks to parse.' });
    }

    const { parseDeliveryRemarks } = require('../services/llmParserService');

    const parsed = await parseDeliveryRemarks(
      order.delivery_remarks,
      order.delivery_address || '',
      order.customers?.phone  || ''
    );

    res.json({ success: true, parsed });
  } catch (err) {
    console.error('POST /api/orders/:id/parse-remarks error:', err.message);
    res.status(500).json({ error: 'Failed to parse remarks', details: err.message });
  }
});

// POST /:id/apply-parsed — Admin confirms parsed result and applies to order (FR-01-008)
router.post('/:id/apply-parsed', async (req, res) => {
  try {
    const { delivery_address, phone, contact_name, driver_notes } = req.body;

    const order = await prisma.orders.findUnique({
      where:   { id: req.params.id },
      include: { customers: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Snapshot original address if not already saved
    const originalAddress = order.original_delivery_address || order.delivery_address;

    // Update order:
    //  - delivery_address → remarks address (active address used for delivery)
    //  - original_delivery_address → SO address (preserved, never overwritten again)
    //  - remarks_* → parsed values stored for reference
    const orderUpdate = {
      updated_at:                new Date(),
      original_delivery_address: originalAddress,
      remarks_delivery_address:  delivery_address  || null,
      remarks_contact_phone:     phone             || null,
      remarks_contact_name:      contact_name      || null,
      remarks_driver_notes:      driver_notes      || null,
    };

    if (delivery_address) orderUpdate.delivery_address = delivery_address;
    if (driver_notes)     orderUpdate.delivery_notes   = driver_notes;

    await prisma.orders.update({
      where: { id: req.params.id },
      data:  orderUpdate,
    });

    // NOTE: customers.phone is NOT updated here.
    // remarks_contact_phone is stored separately on the order for the driver's reference.
    // WhatsApp notifications always go to customers.phone (the customer who placed the order).

    console.log(`[LLM Parser] Applied parsed remarks to order ${req.params.id}`);
    res.json({ success: true, message: 'Parsed data applied to order.' });
  } catch (err) {
    console.error('POST /api/orders/:id/apply-parsed error:', err.message);
    res.status(500).json({ error: 'Failed to apply parsed data', details: err.message });
  }
});

// POST /:id/approve — Admin approves DO assignment and writes back to Odoo (A1.5)
router.post('/:id/approve', async (req, res) => {
  try {
    const order = await prisma.orders.findUnique({
      where:   { id: req.params.id },
      include: { employees: true, time_slots: true },
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!order.time_slot_id) {
      return res.status(400).json({
        error: 'Cannot approve — order has no timeslot assigned yet.'
      });
    }

    // Mark assignment as approved
    const updated = await prisma.orders.update({
      where: { id: req.params.id },
      data:  {
        assignment_status: 'approved',
        order_status:      order.order_status === 'Pending' ? 'Scheduled' : order.order_status,
        updated_at:        new Date(),
      },
    });

    // Write assignment details back to Odoo (A1.5)
    if (order.odoo_order_ref && process.env.ODOO_URL) {
      try {
        const { callModel } = require('../services/odooService');

        const odooOrders = await callModel('sale.order', 'search_read',
          [[['name', '=', order.odoo_order_ref]]],
          { fields: ['id'], limit: 1 }
        );

        if (odooOrders?.length) {
          const scheduledTime = order.time_slots?.date && order.time_slots?.time_window_start
            ? `${order.time_slots.date} ${order.time_slots.time_window_start}`
            : null;

          await callModel('sale.order', 'write', [[odooOrders[0].id], {
            x_delivery_status:   'assigned',
            x_scheduled_time:    scheduledTime || '',
            x_assigned_driver:   order.employees?.name || order.employees?.display_name || '',
          }]);

          console.log(`[A1.5] Wrote assignment back to Odoo for ${order.odoo_order_ref}`);
        }
      } catch (odooErr) {
        console.warn('[A1.5] Odoo write-back failed (non-fatal):', odooErr.message);
      }
    }

    res.json({ success: true, order: updated });
  } catch (err) {
    console.error('POST /api/orders/:id/approve error', err);
    res.status(500).json({ error: 'Failed to approve assignment', details: err.message });
  }
});

const { confirmFailure } = require('../services/deliveryFailureService');

// PATCH /:id/issue — two paths:
//   1. confirm_failure: true  → A5 driver failure confirmation (deliveryFailureService)
//   2. no flag               → admin triage: update issue_status / item statuses (no A6)
router.patch('/:id/issue', upload.array('files', 5), async (req, res) => {
  const orderId = req.params.id;

  // ── Path 1: A5 driver failure confirmation ─────────────────────────────────
  const rawBody = req.body.confirm_failure;
  const isConfirmFailure = rawBody === true || rawBody === 'true';

  if (isConfirmFailure) {
    try {
      const {
        issue_reason,
        issue_desc,
        order_products_status: rawItems,
        employee_id,
        latitude,
        longitude,
      } = req.body;

      // order_products_status may arrive as a JSON string when sent as FormData
      let order_products_status = rawItems;
      if (typeof rawItems === 'string') {
        try { order_products_status = JSON.parse(rawItems); } catch { order_products_status = []; }
      }

      const evidence_paths = (req.files || []).map(f => {
        return `/uploads/orders/del/status/${orderId}/${f.filename}`;
      });

      const order = await confirmFailure(orderId, {
        issue_reason,
        issue_desc,
        order_products_status: order_products_status || [],
        employee_id: employee_id || undefined,
        evidence_paths,
      });

      // Upsert driver location on failure confirmation (best-effort)
      const lat = latitude  != null ? parseFloat(latitude)  : null;
      const lng = longitude != null ? parseFloat(longitude) : null;
      await upsertEmployeeLocation(employee_id, lat, lng);

      return res.json({ success: true, order });
    } catch (err) {
      const status = err.statusCode || 500;
      console.error(`[A5] confirm_failure error (${err.code || 'ERR'}):`, err.message);
      return res.status(status).json({ error: err.message, code: err.code });
    }
  }

  // ── Path 2: admin triage update (no A6, no Odoo write) ────────────────────
  try {
    const {
      issue_status,
      issue_reason,
      issue_desc,
      order_products_status,
      resolved_by,
    } = req.body;

    const existing = await prisma.orders.findUnique({
      where: { id: orderId },
      select: { issue_status: true, issue_reason: true, issue_reported_at: true },
    });

    const data = {};
    if (issue_status !== undefined) data.issue_status = issue_status;
    if (issue_reason !== undefined) data.issue_reason = issue_reason;
    if (issue_desc   !== undefined) data.issue_desc   = issue_desc;
    data.updated_at = new Date();

    // Reported-failed date — stamp once, the first time issue_reason is set,
    // and never again. Any later update (resolve, reschedule, item edits)
    // must not move this date.
    if (issue_reason && !existing?.issue_reported_at) {
      data.issue_reported_at = new Date();
    }

    // Audit trail — stamp who/when only on the transition INTO resolved,
    // not on every subsequent save of an already-resolved case.
    if (issue_status === 'resolved' && existing?.issue_status !== 'resolved') {
      data.resolved_by = resolved_by || null;
      data.resolved_at = new Date();
    }

    const order = await prisma.orders.update({
      where: { id: orderId },
      data,
    });

    if (Array.isArray(order_products_status) && order_products_status.length > 0) {
      const allowed = ['pending', 'delivered', 'failed'];
      for (const item of order_products_status) {
        if (!item.id || !allowed.includes(item.item_delivery_status)) continue;
        await prisma.order_products.update({
          where: { id: parseInt(item.id) },
          data:  { item_delivery_status: item.item_delivery_status },
        });
      }
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('PATCH /api/orders/:id/issue error', err);
    res.status(500).json({ error: 'Failed to update order issue', details: err.message });
  }
});

// POST /:id/remind-driver — Admin manually triggers a WhatsApp reminder to the driver
// for an overdue order (still Delivering past the current day's end-of-day cut-off).
router.post('/:id/remind-driver', async (req, res) => {
  try {
    const order = await prisma.orders.findUnique({
      where:   { id: req.params.id },
      include: {
        employees:  { select: { name: true, display_name: true, contact_number: true } },
        time_slots: { select: { date: true } },
        customers:  { select: { full_name: true } },
      },
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.order_status !== 'Delivering') {
      return res.status(400).json({
        error: `Cannot remind driver — order status is "${order.order_status}", expected "Delivering".`,
        code:  'NOT_DELIVERING',
      });
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (order.time_slots?.date && order.time_slots.date >= today) {
      return res.status(400).json({
        error: 'Cannot remind driver — delivery slot is not overdue yet.',
        code:  'NOT_OVERDUE',
      });
    }

    const driverPhone = order.employees?.contact_number;
    if (!driverPhone) {
      return res.status(400).json({
        error: 'Driver has no contact number on record — cannot send WhatsApp reminder.',
        code:  'NO_DRIVER_PHONE',
      });
    }

    const driverName   = order.employees?.display_name || order.employees?.name || 'Driver';
    const customerName = order.customers?.full_name || 'customer';
    const orderRef     = order.odoo_order_ref || order.id.slice(0, 8).toUpperCase();
    const address      = order.delivery_address || '';

    const message = `Hi ${driverName}, please update the delivery status for order #${orderRef} (${customerName} — ${address}). If the delivery could not be completed, mark it as Failed Delivery before end of day.`;

    const { sendWhatsAppDirect } = require('../services/whatsappService');
    await sendWhatsAppDirect(driverPhone, message);

    const updatedOrder = await prisma.orders.update({
      where: { id: req.params.id },
      data:  { overdue_reminder_sent_at: new Date() },
    });

    console.log(`[Overdue] Reminder sent to driver ${driverName} for order ${req.params.id}`);
    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('POST /api/orders/:id/remind-driver error', err);
    res.status(500).json({ error: 'Failed to send driver reminder', details: err.message });
  }
});

// DELETE /api/orders/:id/scan-session — A2: admin resets all scan progress for an order
router.delete('/:id/scan-session', async (req, res) => {
  try {
    const order = await prisma.orders.findUnique({
      where:  { id: req.params.id },
      select: { order_status: true, odoo_order_ref: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const lockedStatuses = ['Delivered', 'Failed', 'Cancelled'];
    if (lockedStatuses.includes(order.order_status)) {
      return res.status(400).json({
        error: `Cannot reset scans for an order with status '${order.order_status}'`,
      });
    }

    const result = await prisma.order_products.updateMany({
      where: { order_id: req.params.id },
      data: {
        picking_status:  'pending',
        picked_serial:   null, picked_by:   null, picked_at:   null,
        loaded_serial:   null, loaded_by:   null, loaded_at:   null,
        unloaded_serial: null, unloaded_by: null, unloaded_at: null,
      },
    });

    console.log(`[A2] Scan session reset for order ${req.params.id} — ${result.count} item(s) cleared`);
    res.json({ success: true, items_reset: result.count });
  } catch (err) {
    console.error('DELETE /api/orders/:id/scan-session error', err);
    res.status(500).json({ error: 'Failed to reset scan session', details: err.message });
  }
});

module.exports = router;
