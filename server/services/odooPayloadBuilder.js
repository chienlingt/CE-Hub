// server/services/odooPayloadBuilder.js
//
// Single source of truth for the payload CE Hub sends Odoo on every status change.
// Replaces the old ad hoc `{ orderId, odooRef, status }` literals scattered across
// integrationOutboxService/deliveryCompletionService/deliveryFailureService/routes —
// every call site now enqueues the result of buildOdooEventPayload() instead.
//
// Field names match "Odoo Integration Meeting Prep by CE Hub team" (do_ref, so_ref,
// order_lines[], failure_reason, driver_name, etc.) — see docs/odoo-payload-addendum.md
// for the fields added here beyond that original doc, and for open questions still
// pending GCA's confirmation (actual_delivered_qty granularity, stock.move.line
// write-back semantics).

const prisma = require('../prismaClient');

// CE Hub status -> conceptual event name from the reference payload doc.
// Delivering was originally 'status', Delivered was originally 'completion', and
// this stage was originally 'Arrived'/'arrived' in the CE Hub prep doc — the first
// two renamed for symmetry with loaded/unloaded (named after their CE Hub status);
// Arrived -> Unloaded to match GCA's own confirmed status list (their meeting
// notes doc, §5 "Confirmed CE Hub Status List"), which names this status
// `Unloaded`/`unloaded` — matching CE Hub's own item-level `picking_status:
// 'unloaded'` naming too. Delivering is also distinct from x_delivery_status's
// own 'in_transit' value — see docs/odoo-payload-addendum.md.
// `schedule` (Scheduled) is CE Hub's own proposal, not yet confirmed by GCA —
// their confirmed status list has no Scheduled entry. See addendum §Open Items.
const EVENT_BY_STATUS = {
  Scheduled:  'schedule',
  Loaded:     'loaded',
  Unloaded:   'unloaded',
  Delivering: 'delivering',
  Delivered:  'delivered',
  Failed:     'failure',
};

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
 * @param {string} ceHubStatus - Loaded|Unloaded|Delivering|Delivered|Failed|Scheduled
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

  // Only meaningful on the delivered event — see docs/odoo-payload-addendum.md
  // for the current limitation (always false today; CE Hub's failure-confirmation
  // flow has no path that reaches "Delivered" with some lines undelivered yet).
  const deliveredCount = order.order_products.filter(i => i.item_delivery_status === 'delivered').length;
  const isPartial = ceHubStatus === 'Delivered'
    && deliveredCount > 0
    && deliveredCount < order.order_products.length;

  return {
    event:                  EVENT_BY_STATUS[ceHubStatus] || null,
    do_ref:                 order.odoo_order_ref || null,
    so_ref:                 order.odoo_sales_ref || null,
    ce_hub_order_ref:       order.id,
    status:                 ceHubStatus,
    order_lines:            orderLines,
    ...(ceHubStatus === 'Delivered' && { is_partial: isPartial }),
    ...(ceHubStatus === 'Failed' && {
      failure_reason: latestFailure?.failure_reason || order.issue_reason || null,
      remarks:        latestFailure?.failure_desc   || order.issue_desc   || null,
      // Business confirmed no same-trip revisit workflow exists on-ground (GCA
      // meeting notes, 16 Jul 2026) — always false until that changes.
      no_revisit:     false,
    }),
    driver_name:            crew.driver_name,
    assistant_name:         crew.assistant_name,
    vehicle_plate:          crew.vehicle_plate,
    scheduled_start:        order.scheduled_start_date_time || null,
    scheduled_end:          order.scheduled_end_date_time || null,
    delivered_time:         order.delivery_end_date_time || order.actual_arrival_date_time || null,
    proof_of_delivery_url:  order.proof_of_delivery_url || null,
    timestamp:              new Date().toISOString(),
  };
}

module.exports = { buildOdooEventPayload, EVENT_BY_STATUS };
