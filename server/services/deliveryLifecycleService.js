// server/services/deliveryLifecycleService.js
//
// Single pipeline for all delivery lifecycle events (A.3.0a).
//
// Slot status machine:
//   scheduled → out_for_delivery  (departTimeSlot)
//   out_for_delivery → completed  (endTimeSlotTrip — when all orders are terminal)
//
// Order terminal statuses (END_TRIP_TERMINAL_STATUSES):
//   Delivered, Cancelled, Failed
//   — Cancelled/Failed orders do NOT block end-trip and do NOT need to be loaded.

const prisma = require('../prismaClient');

// ─── Status constants ────────────────────────────────────────────────────────

const END_TRIP_TERMINAL_STATUSES = ['Delivered', 'Cancelled', 'Failed'];

// Orders that must be fully loaded before Leave warehouse
const PRE_DEPART_ORDER_STATUSES = ['Pending', 'Scheduled', 'Loaded'];

// Orders that participate in load/dispatch on a slot (exclude already-terminal ones)
const ACTIVE_ORDER_STATUSES = ['Pending', 'Scheduled', 'Delivering', 'Installing'];

/**
 * Returns true when an order status counts as trip-terminal.
 * Cancelled/Failed orders pass without being Delivered.
 */
function isEndTripTerminal(orderStatus) {
  return END_TRIP_TERMINAL_STATUSES.includes(orderStatus);
}

/**
 * Returns the subset of orders that are still blocking end-trip.
 * An order blocks end-trip when its status is NOT terminal.
 */
function ordersBlockingEndTrip(orders) {
  return orders.filter(o => !isEndTripTerminal(o.order_status));
}

// ─── Location helper ──────────────────────────────────────────────────────────

/**
 * Upsert the driver's current location in employee_locations.
 * Non-fatal — errors are logged, never thrown.
 */
async function upsertEmployeeLocation(employeeId, latitude, longitude) {
  if (!employeeId || latitude == null || longitude == null) return;
  try {
    await prisma.employee_locations.upsert({
      where:  { employee_id: employeeId },
      create: { employee_id: employeeId, latitude, longitude, updated_at: new Date() },
      update: { latitude, longitude, updated_at: new Date() },
    });
  } catch (err) {
    console.warn('[Location] upsertEmployeeLocation failed (non-fatal):', err.message);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUuid(id, label = 'id') {
  if (!UUID_RE.test(id)) {
    const err = new Error(`Invalid ${label}: must be a valid UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)`);
    err.code = 'INVALID_UUID';
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Resolve a human-readable name for an employee id (non-fatal).
 */
async function resolveEmployeeName(employeeId) {
  if (!employeeId) return null;
  try {
    const emp = await prisma.employees.findUnique({
      where: { id: employeeId },
      select: { name: true, display_name: true },
    });
    return emp?.name || emp?.display_name || null;
  } catch {
    return null;
  }
}

// ─── Core: mark a single order as Delivering ─────────────────────────────────

/**
 * Mark one order as Delivering and set delivery timestamps.
 * Does NOT do Odoo write-back (caller decides — routes use outbox for that).
 * Also upserts employee_locations if lat/lng provided.
 */
async function markOrderDelivering(orderId, { employeeId, now, latitude, longitude } = {}) {
  const ts = now || new Date();
  const updated = await prisma.orders.update({
    where: { id: orderId },
    data: {
      order_status:            'Delivering',
      dispatched_by:           employeeId || null,
      delivery_start_date_time: ts,
      actual_start_date_time:   ts,
      updated_at:               ts,
    },
  });
  await upsertEmployeeLocation(employeeId, latitude, longitude);
  return updated;
}

/**
 * Mark one order as Delivered and set delivery timestamps.
 * Stores delivered_latitude/longitude on the order and upserts employee_locations.
 * Does NOT do Odoo write-back.
 */
async function markOrderDelivered(orderId, { employeeId, now, latitude, longitude } = {}) {
  const ts = now || new Date();
  const data = {
    order_status:             'Delivered',
    delivered_by:             employeeId || null,
    delivery_end_date_time:   ts,
    actual_arrival_date_time: ts,
    updated_at:               ts,
  };
  if (latitude  != null) data.delivered_latitude  = latitude;
  if (longitude != null) data.delivered_longitude = longitude;
  const updated = await prisma.orders.update({ where: { id: orderId }, data });
  await upsertEmployeeLocation(employeeId, latitude, longitude);
  return updated;
}

// ─── A.3.1 / A.3.5: Depart slot ──────────────────────────────────────────────

/**
 * Depart a time slot — the v1 trigger for "Out for Delivery".
 *
 * 1. Validates slot exists and is in `scheduled` state.
 * 2. Checks all active (non-terminal) orders on the slot have every item loaded.
 * 3. Sets time_slots.slot_status = out_for_delivery, departed_at, started_by.
 * 4. Sets all active orders → Delivering.
 * 5. Upserts a lorry_trips row (1:1 mirror).
 * 6. Returns { timeSlot, ordersUpdated, lorryTrip } — callers enqueue side effects.
 *
 * @param {string} timeSlotId
 * @param {{ employeeId?: string }} options
 */
async function departTimeSlot(timeSlotId, { employeeId } = {}) {
  assertValidUuid(timeSlotId, 'time slot id');

  // Load slot with relations needed for validation
  const slot = await prisma.time_slots.findUnique({
    where: { id: timeSlotId },
    include: {
      orders: {
        include: {
          order_products: true,
          customers: { select: { id: true, full_name: true, phone: true, email: true } },
        },
      },
      truck: { select: { id: true, plate_no: true } },
    },
  });

  if (!slot) {
    const err = new Error('Time slot not found');
    err.code = 'SLOT_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  if (slot.slot_status === 'out_for_delivery') {
    const err = new Error('Slot is already out for delivery');
    err.code = 'ALREADY_DEPARTED';
    err.statusCode = 409;
    throw err;
  }

  if (slot.slot_status === 'completed') {
    const err = new Error('Slot trip is already completed');
    err.code = 'TRIP_COMPLETED';
    err.statusCode = 409;
    throw err;
  }

  // Identify active orders — exclude already-terminal (Cancelled/Failed/Delivered)
  const activeOrders = slot.orders.filter(o => !isEndTripTerminal(o.order_status));

  // Only pre-depart orders must have every item loaded; Delivering orders are already en route
  const preDepartOrders = activeOrders.filter(o =>
    PRE_DEPART_ORDER_STATUSES.includes(o.order_status)
  );

  const unloadedItems = [];
  for (const order of preDepartOrders) {
    const notLoaded = order.order_products.filter(p => p.picking_status !== 'loaded');
    for (const item of notLoaded) {
      unloadedItems.push({ order_id: order.id, order_products_id: item.id, picking_status: item.picking_status });
    }
  }

  if (preDepartOrders.length === 0) {
    const err = new Error('Cannot depart — no scheduled orders on this slot');
    err.code = 'NO_PRE_DEPART_ORDERS';
    err.statusCode = 400;
    throw err;
  }

  if (unloadedItems.length > 0) {
    const err = new Error('Cannot depart — not all items have been loaded onto the truck');
    err.code = 'ITEMS_NOT_LOADED';
    err.statusCode = 400;
    err.unloaded = unloadedItems;
    throw err;
  }

  const now = new Date();

  // Update slot status
  const updatedSlot = await prisma.time_slots.update({
    where: { id: timeSlotId },
    data: {
      slot_status: 'out_for_delivery',
      departed_at: now,
      started_by:  employeeId || null,
    },
    include: { truck: { select: { plate_no: true } } },
  });

  // Move pre-depart orders → Delivering (already-Delivering orders are left unchanged)
  const updatedOrders = [];
  for (const order of preDepartOrders) {
    const updated = await markOrderDelivering(order.id, { employeeId, now });
    updatedOrders.push(updated);
  }


  // Safety net: re-query slot for any pre-depart orders missed in the initial snapshot
  const remainingPreDepart = await prisma.orders.findMany({
    where: {
      time_slot_id: timeSlotId,
      order_status: { in: PRE_DEPART_ORDER_STATUSES },
    },
    include: { order_products: true },
  });
  for (const order of remainingPreDepart) {
    if (updatedOrders.some(u => u.id === order.id)) continue;
    const notLoaded = order.order_products.filter(p => p.picking_status !== 'loaded');
    if (notLoaded.length > 0) continue;
    const updated = await markOrderDelivering(order.id, { employeeId, now });
    updatedOrders.push(updated);
  }

  // Upsert lorry_trips (1:1 mirror keyed by time_slot_id)
  const lorryTrip = await prisma.lorry_trips.upsert({
    where:  { time_slot_id: timeSlotId },
    create: {
      time_slot_id:      timeSlotId,
      truck_id:          slot.truck_id || null,
      delivery_team_id:  slot.delivery_team_id || null,
      warehouse_team_id: slot.warehouse_team_id || null,
      status:            'active',
      started_at:        now,
      started_by:        employeeId || null,
      updated_at:        now,
    },
    update: {
      status:     'active',
      started_at: now,
      started_by: employeeId || null,
      updated_at: now,
    },
  });

  console.log(`[Lifecycle] Slot ${timeSlotId} departed. ${updatedOrders.length} orders → Delivering. Trip: ${lorryTrip.id}`);

  return { timeSlot: updatedSlot, ordersUpdated: updatedOrders, lorryTrip, activeOrders: slot.orders };
}

// ─── A.3.6: End trip ──────────────────────────────────────────────────────────

/**
 * End a slot trip — the v1 trigger for "driver returned / trip complete".
 *
 * 1. Validates slot exists and is `out_for_delivery`.
 * 2. Checks no order is still blocking (non-terminal).
 * 3. Sets time_slots.slot_status = completed, ended_at, ended_by.
 * 4. Completes the linked lorry_trips row.
 * 5. Returns { timeSlot, lorryTrip }.
 *
 * @param {string} timeSlotId
 * @param {{ employeeId?: string }} options
 */
async function endTimeSlotTrip(timeSlotId, { employeeId } = {}) {
  assertValidUuid(timeSlotId, 'time slot id');

  const slot = await prisma.time_slots.findUnique({
    where: { id: timeSlotId },
    include: { orders: { select: { id: true, order_status: true } } },
  });

  if (!slot) {
    const err = new Error('Time slot not found');
    err.code = 'SLOT_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  if (slot.slot_status !== 'out_for_delivery') {
    const err = new Error(`Cannot end trip — slot is "${slot.slot_status}", expected "out_for_delivery"`);
    err.code = 'SLOT_NOT_ACTIVE';
    err.statusCode = 400;
    throw err;
  }

  const blocking = ordersBlockingEndTrip(slot.orders);
  if (blocking.length > 0) {
    const err = new Error('Cannot end trip — some orders are not yet in a terminal state');
    err.code = 'ORDERS_NOT_TERMINAL';
    err.statusCode = 400;
    err.blocking = blocking.map(o => ({ id: o.id, order_status: o.order_status }));
    throw err;
  }

  const now = new Date();

  const updatedSlot = await prisma.time_slots.update({
    where: { id: timeSlotId },
    data: {
      slot_status: 'completed',
      ended_at:    now,
      ended_by:    employeeId || null,
    },
    include: { truck: { select: { plate_no: true } } },
  });

  // Complete the linked lorry_trips row if it exists
  let lorryTrip = null;
  const existingTrip = await prisma.lorry_trips.findUnique({ where: { time_slot_id: timeSlotId } });
  if (existingTrip) {
    lorryTrip = await prisma.lorry_trips.update({
      where: { time_slot_id: timeSlotId },
      data: {
        status:    'completed',
        ended_at:  now,
        ended_by:  employeeId || null,
        updated_at: now,
      },
    });
  }

  console.log(`[Lifecycle] Slot ${timeSlotId} trip ended. Trip: ${lorryTrip?.id || 'none'}`);

  return { timeSlot: updatedSlot, lorryTrip };
}

// ─── Heal stranded orders on already-departed slots ─────────────────────────

/**
 * Orders can remain Scheduled/Loaded/Pending on a slot that is already
 * out_for_delivery when they are assigned or rescheduled after depart.
 * Sync them to Delivering once fully loaded.
 */
async function healStrandedOrdersOnDepartedSlots({ employeeId, deliveryTeamIds } = {}) {
  const slotFilter = { slot_status: 'out_for_delivery' };
  if (deliveryTeamIds?.length) {
    slotFilter.delivery_team_id = { in: deliveryTeamIds };
  }

  const stranded = await prisma.orders.findMany({
    where: {
      order_status: { in: PRE_DEPART_ORDER_STATUSES },
      time_slots: slotFilter,
    },
    include: { order_products: true },
  });

  const now = new Date();
  const healed = [];
  const skipped = [];

  for (const order of stranded) {
    const notLoaded = order.order_products.filter(p => p.picking_status !== 'loaded');
    if (notLoaded.length > 0) {
      skipped.push({ id: order.id, reason: 'not_loaded', unloadedCount: notLoaded.length });
      continue;
    }
    const updated = await markOrderDelivering(order.id, { employeeId, now });
    healed.push(updated);
  }


  if (healed.length > 0) {
    console.log(`[Lifecycle] Healed ${healed.length} stranded order(s) on departed slot(s)`);
  }

  return healed;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  END_TRIP_TERMINAL_STATUSES,
  ACTIVE_ORDER_STATUSES,
  PRE_DEPART_ORDER_STATUSES,
  // Helpers
  isEndTripTerminal,
  ordersBlockingEndTrip,
  resolveEmployeeName,
  upsertEmployeeLocation,
  // Core operations
  markOrderDelivering,
  markOrderDelivered,
  departTimeSlot,
  endTimeSlotTrip,
  healStrandedOrdersOnDepartedSlots,
};
