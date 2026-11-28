// server/services/odooCrewChangeService.js
//
// FRD INT-07 driver change: "Any driver change is recorded with the latest driver
// details and a traceable Log Note entry." The crew Odoo sees for a DO is the slot's
// lorry trip crew, or the truck's crew before departure (odooPayloadBuilder.resolveCrew).
// Routes that can change it (truck, lorry trip, time slot) snapshot the crew of the
// affected slots before saving and call notifyCrewChange afterwards; every affected DO
// whose crew actually changed gets one DRIVER_CHANGED event.
//
// Affected DO: Odoo-managed, appointment confirmed, not yet Delivered/Failed/Cancelled/Completed.

const prisma = require('../prismaClient');
const { buildOdooEventPayload, resolveCrew } = require('./odooPayloadBuilder');
const { enqueueOdooOrderEvent, odooEventKey } = require('./odooEventOutbox');

const FINAL_STATUSES = ['Delivered', 'Failed', 'Cancelled', 'Completed'];
const EMPLOYEE_NAME = { select: { name: true, display_name: true } };

async function crewsBySlot(db, slotIds) {
  if (!slotIds?.length) return new Map();
  const slots = await db.time_slots.findMany({
    where: { id: { in: slotIds } },
    select: {
      id: true, truck_id: true,
      truck: { select: { id: true, plate_no: true, driver_id: true, assistant_id: true,
        employees_trucks_driver_idToemployees: EMPLOYEE_NAME, employees_trucks_assistant_idToemployees: EMPLOYEE_NAME } },
      lorry_trip: { select: { id: true, truck_id: true, driver_id: true, assistant_id: true,
        employees_lorry_trips_driver_idToemployees: EMPLOYEE_NAME, employees_lorry_trips_assistant_idToemployees: EMPLOYEE_NAME } },
    },
  });
  return new Map(slots.map(slot => [slot.id, {
    ...resolveCrew(slot),
    driver_ref: slot.lorry_trip?.driver_id || slot.truck?.driver_id || null,
    assistant_ref: slot.lorry_trip?.assistant_id || slot.truck?.assistant_id || null,
    vehicle_ref: slot.lorry_trip?.truck_id || slot.truck_id || null,
  }]));
}

const sameCrew = (a, b) => ['driver_ref', 'assistant_ref', 'vehicle_ref'].every(key => (a?.[key] || null) === (b?.[key] || null));

/** Slot ids whose crew a change to this truck can affect (open slots only). */
async function slotIdsForTruck(db, truckId) {
  const slots = await db.time_slots.findMany({
    where: { truck_id: truckId, orders: { some: { order_status: { notIn: FINAL_STATUSES } } } },
    select: { id: true },
  });
  return slots.map(slot => slot.id);
}

/** Crew of the given slots before a change; pass the result to notifyCrewChange. */
async function snapshotCrews(slotIds, db = prisma) {
  return crewsBySlot(db, slotIds);
}

/**
 * Queue DRIVER_CHANGED for every affected DO on slots whose crew differs from `before`.
 *
 * @param {Map<string, object>} before - snapshotCrews() result, taken before the change
 * @returns {Promise<number>} events queued
 */
async function notifyCrewChange(before, db = prisma) {
  const slotIds = [...(before?.keys() || [])];
  if (!slotIds.length) return 0;
  const after = await crewsBySlot(db, slotIds);
  const changed = slotIds.filter(id => after.has(id) && !sameCrew(before.get(id), after.get(id)));
  if (!changed.length) return 0;

  const orders = await db.orders.findMany({
    where: {
      time_slot_id: { in: changed }, odoo_order_ref: { not: null },
      appointment_status: 'confirmed', order_status: { notIn: FINAL_STATUSES },
    },
    select: { id: true, time_slot_id: true },
  });
  let queued = 0;
  for (const order of orders) {
    const payload = await buildOdooEventPayload(order.id, 'DriverChanged', db);
    if (!payload?.do_ref) continue;
    const previous = before.get(order.time_slot_id) || {};
    const crewKey = crew => [crew.driver_ref, crew.assistant_ref, crew.vehicle_ref].map(ref => (ref || '-').slice(0, 8)).join('.');
    await enqueueOdooOrderEvent(db, order.id, {
      eventType: 'DRIVER_CHANGED',
      key: odooEventKey(order.id, payload.attempt_no, `driver:${crewKey(previous)}>${crewKey(payload)}`),
      payload: {
        ...payload, order_lines: [],
        previous_crew: {
          driver_name: previous.driver_name || null, assistant_name: previous.assistant_name || null,
          vehicle_plate: previous.vehicle_plate || null, driver_ref: previous.driver_ref || null,
          assistant_ref: previous.assistant_ref || null, vehicle_ref: previous.vehicle_ref || null,
        },
      },
    });
    queued += 1;
  }
  return queued;
}

/** Route helper: snapshot, run the update, then notify. Never fails the update itself. */
async function withCrewChangeNotice(slotIds, update) {
  let before = null;
  try { before = await snapshotCrews(slotIds); } catch (err) { console.error('[CrewChange] snapshot failed:', err.message); }
  const result = await update();
  if (before) {
    notifyCrewChange(before).catch(err => console.error('[CrewChange] Odoo driver-change enqueue failed:', err.message));
  }
  return result;
}

module.exports = { snapshotCrews, notifyCrewChange, slotIdsForTruck, withCrewChangeNotice, sameCrew };
