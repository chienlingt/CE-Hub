// server/services/partialDeliveryService.js
//
// FRD v1.2 INT-09 — partial delivery. Some units of an order reach the customer and
// the rest stay on the van: the order is finalized as Delivered (not Failed) and the
// Delivered event to Odoo carries per-line delivered/undelivered quantities and serials.
//
// Rules (agreed design):
//   - Caller:        employee_id must be the order's driver/assistant (order, trip or truck)
//   - Eligible:      order_status Delivering / In Progress; Odoo-managed orders must be DOO Ready
//   - Outcome:       a true partial only — zero delivered -> failure flow, all delivered -> normal completion
//   - Serials:       delivered + undelivered split the line's assigned serials exactly
//   - Idempotency:   same outcome again -> replay (no new outbox row); different outcome -> 409
//   - No damaged-serial field is sent (documented FRD deviation)

const prisma = require('../prismaClient');
const { unitsFor } = require('./orderProductUnits');
const { buildOdooEventPayload } = require('./odooPayloadBuilder');
const { ELIGIBLE_STATUSES } = require('./deliveryFailureService');
const { upsertEmployeeLocation } = require('./deliveryLifecycleService');
const { runPostDeliverySteps } = require('./deliveryCompletionService');

function fail(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

const norm = serial => String(serial).trim().toLowerCase();

function cleanSerials(value, field, lineId) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(serial => typeof serial !== 'string' || !serial.trim())) {
    throw fail(400, 'INVALID_SERIALS', `Line ${lineId}: ${field} must be a list of non-empty strings.`);
  }
  return value.map(serial => serial.trim());
}

function isSerialTracked(item, units) {
  if (item.serial_tracking === 'none') return false;
  return item.serial_tracking === 'serial' || units.some(unit => unit.assigned_serial);
}

/**
 * Validate a partial-delivery request against the order's lines and work out the
 * per-unit outcome. Pure — no database access.
 *
 * @param {Array} orderProducts - order_products rows for the order
 * @param {Array} lines - request lines: { order_product_id, delivered_serial_numbers?,
 *                        undelivered_serial_numbers?, delivered_quantity? }
 * @returns {{ lines: Array<{ id, units, deliveredQty, status }>, signature: string }}
 */
function planPartialDelivery(orderProducts, lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw fail(400, 'INVALID_LINES', 'lines must list every order line.');
  }
  const byId = new Map(orderProducts.map(item => [String(item.id), item]));
  const seen = new Set();
  const planned = [];

  for (const input of lines) {
    const id = String(input?.order_product_id);
    const item = byId.get(id);
    if (!item) throw fail(400, 'UNKNOWN_LINE', `Line ${id} does not belong to this order.`);
    if (seen.has(id)) throw fail(400, 'DUPLICATE_LINE', `Line ${id} appears more than once.`);
    seen.add(id);

    const units = unitsFor(item);
    const quantity = units.length;
    const delivered = new Array(quantity).fill(false);

    if (isSerialTracked(item, units)) {
      if (units.some(unit => !unit.assigned_serial)) {
        throw fail(400, 'SERIAL_NOT_ASSIGNED', `Line ${id}: every unit needs an assigned serial before a partial result can be classified.`);
      }
      const deliveredSerials = cleanSerials(input.delivered_serial_numbers, 'delivered_serial_numbers', id);
      const undeliveredSerials = cleanSerials(input.undelivered_serial_numbers, 'undelivered_serial_numbers', id);
      const index = new Map(units.map((unit, position) => [norm(unit.assigned_serial), position]));
      const classified = new Set();
      for (const [serials, isDelivered] of [[deliveredSerials, true], [undeliveredSerials, false]]) {
        for (const serial of serials) {
          const position = index.get(norm(serial));
          if (position === undefined) throw fail(400, 'SERIAL_MISMATCH', `Line ${id}: serial ${serial} is not assigned to this line.`);
          if (classified.has(position)) throw fail(400, 'SERIAL_OVERLAP', `Line ${id}: serial ${serial} is listed more than once.`);
          classified.add(position);
          delivered[position] = isDelivered;
        }
      }
      if (classified.size !== quantity) {
        throw fail(400, 'SERIAL_INCOMPLETE', `Line ${id}: delivered and undelivered serials must cover all ${quantity} assigned serials.`);
      }
      if (input.delivered_quantity != null && input.delivered_quantity !== deliveredSerials.length) {
        throw fail(400, 'QUANTITY_MISMATCH', `Line ${id}: delivered_quantity does not match delivered_serial_numbers.`);
      }
    } else {
      if (cleanSerials(input.delivered_serial_numbers, 'delivered_serial_numbers', id).length
        || cleanSerials(input.undelivered_serial_numbers, 'undelivered_serial_numbers', id).length) {
        throw fail(400, 'SERIAL_NOT_TRACKED', `Line ${id} is not serial-tracked; send delivered_quantity only.`);
      }
      const count = input.delivered_quantity;
      if (!Number.isInteger(count) || count < 0 || count > quantity) {
        throw fail(400, 'INVALID_DELIVERED_QUANTITY', `Line ${id}: delivered_quantity must be a whole number from 0 to ${quantity}.`);
      }
      for (let position = 0; position < count; position += 1) delivered[position] = true;
    }

    const deliveredQty = delivered.filter(Boolean).length;
    planned.push({
      id: item.id,
      units: units.map((unit, position) => ({ ...unit, delivery_outcome: delivered[position] ? 'delivered' : 'undelivered' })),
      deliveredQty,
      status: deliveredQty > 0 ? 'delivered' : 'failed',
    });
  }

  if (planned.length !== orderProducts.length) {
    throw fail(400, 'LINES_INCOMPLETE', 'Every line on the order must appear in lines.');
  }
  const totalDelivered = planned.reduce((sum, line) => sum + line.deliveredQty, 0);
  const totalUnits = planned.reduce((sum, line) => sum + line.units.length, 0);
  if (totalDelivered === 0) {
    throw fail(400, 'NOTHING_DELIVERED', 'No unit was delivered — use the failure flow for a failed delivery.');
  }
  if (totalDelivered === totalUnits) {
    throw fail(400, 'NOTHING_UNDELIVERED', 'Every unit was delivered — use normal delivery completion.');
  }
  return { lines: planned, signature: signatureOf(planned.map(line => ({ id: line.id, units: line.units, deliveredQty: line.deliveredQty }))) };
}

// Canonical form used to tell "same outcome again" from "different outcome".
function signatureOf(lines) {
  return JSON.stringify([...lines].sort((a, b) => a.id - b.id).map(line => [
    line.id,
    line.deliveredQty,
    line.units.filter(unit => unit.delivery_outcome === 'delivered' && unit.assigned_serial)
      .map(unit => norm(unit.assigned_serial)).sort(),
  ]));
}

function storedSignature(orderProducts) {
  return signatureOf(orderProducts.map(item => ({
    id: item.id,
    deliveredQty: item.delivered_quantity ?? 0,
    units: unitsFor(item),
  })));
}

function isCrewMember(order, employeeId) {
  const slot = order.time_slots;
  return [
    order.employee_id,
    slot?.lorry_trip?.driver_id, slot?.lorry_trip?.assistant_id,
    slot?.truck?.driver_id, slot?.truck?.assistant_id,
  ].some(id => id && id === employeeId);
}

/**
 * Complete an order as a partial delivery.
 *
 * @param {string} orderId
 * @param {{ employee_id: string, lines: Array, remarks?: string, latitude?: number, longitude?: number }} params
 * @returns {Promise<{ order, replayed: boolean, isPartial: true, lines }>}
 * @throws Error with .statusCode / .code for HTTP responses
 */
async function completePartialDelivery(orderId, { employee_id, lines, remarks, latitude, longitude } = {}) {
  const order = await prisma.orders.findUnique({
    where: { id: orderId },
    include: {
      order_products: true,
      customers: { select: { id: true, full_name: true } },
      time_slots: {
        select: {
          truck:      { select: { driver_id: true, assistant_id: true } },
          lorry_trip: { select: { driver_id: true, assistant_id: true } },
        },
      },
    },
  });
  if (!order) throw fail(404, 'ORDER_NOT_FOUND', 'Order not found');

  if (!employee_id || !isCrewMember(order, employee_id)) {
    throw fail(403, 'NOT_ASSIGNED_DRIVER', 'Forbidden: only the assigned driver or assistant can record a partial delivery.');
  }

  const plan = planPartialDelivery(order.order_products, lines);

  if (order.order_status === 'Delivered') {
    if (storedSignature(order.order_products) === plan.signature) {
      return { order, replayed: true, isPartial: true, lines: plan.lines };
    }
    throw fail(409, 'DIFFERENT_OUTCOME_RECORDED', 'This order was already delivered with a different outcome.');
  }
  if (!ELIGIBLE_STATUSES.includes(order.order_status)) {
    throw fail(409, 'INELIGIBLE_STATUS', `Cannot record a partial delivery: order_status is "${order.order_status}". It requires Delivering or In Progress.`);
  }
  if ((order.odoo_picking_id != null || order.odoo_order_ref) && order.doo_ready !== true) {
    throw fail(409, 'DOO_NOT_READY', 'This Odoo order is not marked DOO Ready.');
  }

  const now = new Date();
  const note = typeof remarks === 'string' && remarks.trim() ? remarks.trim() : null;

  const updatedOrder = await prisma.$transaction(async tx => {
    const claimed = await tx.orders.updateMany({
      where: { id: orderId, order_status: { in: ELIGIBLE_STATUSES } },
      data: {
        order_status:             'Delivered',
        delivered_by:             employee_id,
        delivery_end_date_time:   now,
        actual_arrival_date_time: now,
        updated_at:               now,
        ...(latitude  != null && { delivered_latitude:  latitude }),
        ...(longitude != null && { delivered_longitude: longitude }),
        ...(note && { delivery_notes: note }),
      },
    });
    if (claimed.count === 0) throw fail(409, 'INELIGIBLE_STATUS', 'The order changed while recording the delivery; reload and retry.');

    for (const line of plan.lines) {
      await tx.order_products.update({
        where: { id: line.id },
        data: { unit_scans: line.units, delivered_quantity: line.deliveredQty, item_delivery_status: line.status },
      });
    }

    const updated = await tx.orders.findUnique({ where: { id: orderId } });
    if (updated.odoo_order_ref) {
      const key = `order:${orderId}:delivered:odoo`;
      await tx.integration_outbox.upsert({
        where: { idempotency_key: key }, update: {},
        create: {
          event_type: 'SLOT_STATUS_CHANGED', target: 'odoo', idempotency_key: key,
          status: 'pending', attempts: 0, next_retry_at: now,
          payload: await buildOdooEventPayload(orderId, 'Delivered', tx),
        },
      });
    }
    return updated;
  }, { timeout: 15000 });

  await upsertEmployeeLocation(employee_id, latitude, longitude);
  await runPostDeliverySteps(order, updatedOrder, { employeeId: employee_id, latitude, longitude });

  console.log(`[Partial] Order ${orderId} delivered partially by ${employee_id}`);
  return { order: updatedOrder, replayed: false, isPartial: true, lines: plan.lines };
}

module.exports = { planPartialDelivery, completePartialDelivery, storedSignature };
