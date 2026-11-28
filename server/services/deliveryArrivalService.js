// server/services/deliveryArrivalService.js
//
// "Mark arrived": the driver taps it on an order when they reach the customer. The
// time is stored in orders.actual_arrival_date_time and the Odoo "Arrived" status
// is queued through the outbox. Completing the delivery then requires it
// (see deliveryGates.js), and keeps this time instead of overwriting it.
//
//   - Who:          the order's driver or assistant (order, trip or truck crew)
//   - When:         only while the order is out for delivery (Delivering / In Progress)
//   - Idempotent:   tapping again returns the time already recorded; it never moves
//   - Odoo:         event SLOT_STATUS_CHANGED with status "Arrived", queued once per order

const prisma = require('../prismaClient');
const { enqueueOdooStatusEvent } = require('./odooEventOutbox');
const { ELIGIBLE_STATUSES } = require('./deliveryFailureService');
const { upsertEmployeeLocation } = require('./deliveryLifecycleService');

const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
const fail = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });

function isCrewMember(order, employeeId) {
  const slot = order.time_slots;
  return [
    order.employee_id,
    slot?.lorry_trip?.driver_id, slot?.lorry_trip?.assistant_id,
    slot?.truck?.driver_id, slot?.truck?.assistant_id,
  ].some(id => id && id === employeeId);
}

/**
 * @param {string} orderId
 * @param {{ employeeId: string, latitude?: number|null, longitude?: number|null }} params
 * @returns {Promise<{ order: object, arrivedAt: Date, alreadyArrived: boolean }>}
 * @throws Error with .statusCode / .code for HTTP responses
 */
async function markOrderArrived(orderId, { employeeId, latitude, longitude } = {}, db = prisma, deps = { enqueueOdooStatusEvent }) {
  if (!isUuid(orderId)) throw fail(400, 'INVALID_ORDER', 'Invalid order id.');
  if (!employeeId) throw fail(400, 'EMPLOYEE_REQUIRED', 'employee_id is required.');

  const order = await db.orders.findUnique({
    where: { id: orderId },
    include: {
      time_slots: {
        select: {
          truck: { select: { driver_id: true, assistant_id: true } },
          lorry_trip: { select: { driver_id: true, assistant_id: true } },
        },
      },
    },
  });
  if (!order) throw fail(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (!isCrewMember(order, employeeId)) {
    throw fail(403, 'NOT_ASSIGNED_DRIVER', 'Forbidden: only the assigned driver or assistant can mark this order as arrived.');
  }
  // Tapping twice, or two crew members tapping, keeps the first time.
  if (order.actual_arrival_date_time && ELIGIBLE_STATUSES.includes(order.order_status)) {
    return { order, arrivedAt: order.actual_arrival_date_time, alreadyArrived: true };
  }
  if (!ELIGIBLE_STATUSES.includes(order.order_status)) {
    throw fail(409, 'INELIGIBLE_STATUS', `Cannot mark arrival: the order is "${order.order_status}". It must be out for delivery.`);
  }

  const now = new Date();
  const claimed = await db.orders.updateMany({
    where: { id: orderId, actual_arrival_date_time: null, order_status: { in: ELIGIBLE_STATUSES } },
    data: { actual_arrival_date_time: now, updated_at: now },
  });
  const fresh = await db.orders.findUnique({ where: { id: orderId } });
  if (claimed.count === 0) {
    if (fresh?.actual_arrival_date_time) return { order: fresh, arrivedAt: fresh.actual_arrival_date_time, alreadyArrived: true };
    throw fail(409, 'INELIGIBLE_STATUS', 'The order changed while marking arrival; reload and retry.');
  }

  await upsertEmployeeLocation(employeeId, latitude, longitude);

  // Odoo is told through the outbox, never inline. A failure here must not undo the arrival.
  if (fresh.odoo_order_ref) {
    try {
      await deps.enqueueOdooStatusEvent(db, orderId, 'Arrived');
    } catch (error) {
      console.error('[Arrival] Odoo enqueue failed (arrival is saved):', error.message);
    }
  }
  return { order: fresh, arrivedAt: now, alreadyArrived: false };
}

module.exports = { markOrderArrived, isCrewMember };
