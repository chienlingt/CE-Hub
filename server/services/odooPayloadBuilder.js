// server/services/odooPayloadBuilder.js

// Single source of truth for the payload CE Hub sends Odoo on every status change.
// Replaces the old ad hoc `{ orderId, odooRef, status }` literals scattered across
// integrationOutboxService/deliveryCompletionService/deliveryFailureService/routes —
// every call site now enqueues the result of buildOdooEventPayload() instead.

const prisma = require('../prismaClient');

// Every timestamp sent to Odoo uses Malaysia time (UTC+8) — matches the
// contract documented in Section 1 of the reference doc ("ISO 8601 in
// UTC+8, e.g. 2026-07-28T11:30:00+08:00"). Date.prototype.toISOString()
// alone always produces a "Z" (UTC) suffix, which is a different, incorrect
// format for this contract — this shifts the wall-clock digits by +8h and
// swaps the suffix so the string reads as true Malaysia local time.
function toMytIso(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const myt = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return myt.toISOString().replace('Z', '+08:00');
}

// Serial number for a line: prefer the latest lifecycle stage that recorded one.
function resolveSerial(item) {
  return item.unloaded_serial || item.assigned_serial || item.picked_serial || item.loaded_serial || null;
}

function employeeDisplayName(emp) {
  return emp?.name || emp?.display_name || null;
}

// Driver/assistant/vehicle: prefer the trip-level override (set from departure
// onward, may be reassigned per-trip) and fall back to the truck's default
// assignment when no trip exists yet (e.g. the pre-departure `schedule` event).
function resolveCrew(timeSlots) {
  const trip  = timeSlots?.lorry_trip;
  const truck = timeSlots?.truck;

  const driverEmp    = trip?.employees_lorry_trips_driver_idToemployees
    || truck?.employees_trucks_driver_idToemployees || null;
  const assistantEmp = trip?.employees_lorry_trips_assistant_idToemployees
    || truck?.employees_trucks_assistant_idToemployees || null;

  return {
    driver_name:    employeeDisplayName(driverEmp),
    assistant_name: employeeDisplayName(assistantEmp),
    vehicle_plate:  truck?.plate_no || null,
  };
}

// Per-line delivered quantity: prefer the real `delivered_quantity` column; fall
// back to the binary delivered/failed status for lines a caller hasn't populated
// it on yet (e.g. rows written before this column existed).
function resolveDeliveredQty(item) {
  if (item.delivered_quantity != null) return item.delivered_quantity;
  if (item.item_delivery_status === 'delivered') return item.quantity ?? null;
  if (item.item_delivery_status === 'failed') return 0;
  return null;
}

function resolveLineStatus(item) {
  if (item.item_delivery_status === 'delivered') return 'delivered';
  if (item.item_delivery_status === 'failed') return 'not_delivered';
  return 'pending';
}

/**
 * Assemble the full outbound Odoo event payload for one order, from current DB
 * state — the single builder every outbox call site should use instead of a
 * hand-rolled { orderId, odooRef, status } literal.
 *
 * @param {string} orderId
 * @param {string} ceHubStatus - Loaded|Arrived|Delivering|Delivered|Failed|Scheduled
 * @returns {Promise<object|null>} null if the order can't be found
 */
async function buildOdooEventPayload(orderId, ceHubStatus) {
  const order = await prisma.orders.findUnique({
    where: { id: orderId },
    include: {
      order_products: true,
      delivery_failure_events: { orderBy: { created_at: 'desc' }, take: 1 },
      time_slots: {
        include: {
          truck: {
            select: {
              plate_no: true,
              employees_trucks_driver_idToemployees:    { select: { name: true, display_name: true } },
              employees_trucks_assistant_idToemployees: { select: { name: true, display_name: true } },
            },
          },
          lorry_trip: {
            select: {
              employees_lorry_trips_driver_idToemployees:    { select: { name: true, display_name: true } },
              employees_lorry_trips_assistant_idToemployees: { select: { name: true, display_name: true } },
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  const latestFailure = order.delivery_failure_events?.[0] || null;
  const crew = resolveCrew(order.time_slots);

  const orderLines = order.order_products.map(item => ({
    order_line_id:         item.odoo_line_id,
    quantity:               item.quantity,
    actual_delivered_qty:  resolveDeliveredQty(item),
    serial_number:          resolveSerial(item),
    status:                 resolveLineStatus(item),
  }));

  const deliveredCount = order.order_products.filter(i => i.item_delivery_status === 'delivered').length;
  const isPartial = ceHubStatus === 'Delivered'
    && deliveredCount > 0
    && deliveredCount < order.order_products.length;

  return {
    do_ref:                 order.odoo_order_ref || null,
    so_ref:                 order.odoo_sales_ref || null,
    status:                 ceHubStatus,
    order_lines:            orderLines,
    ...(ceHubStatus === 'Delivered' && { is_partial: isPartial }),
    ...(ceHubStatus === 'Failed' && {
      failure_reason: latestFailure?.failure_reason || order.issue_reason || null,
      remarks:        latestFailure?.failure_desc   || order.issue_desc   || null,
    }),
    driver_name:            crew.driver_name,
    assistant_name:         crew.assistant_name,
    vehicle_plate:          crew.vehicle_plate,
    scheduled_start:        toMytIso(order.scheduled_start_date_time),
    scheduled_end:          toMytIso(order.scheduled_end_date_time),
    delivered_time:         toMytIso(order.delivery_end_date_time || order.actual_arrival_date_time),
    timestamp:              toMytIso(new Date()),
  };
}

module.exports = { buildOdooEventPayload };
