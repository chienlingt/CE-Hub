// server/services/deliveryFailureService.js
//
// A.5 — Delivery Failure Confirmation Service
//
// Called by PATCH /api/orders/:id/issue when confirm_failure: true is present.
// Handles all validation, DB writes, A6 notification dispatch, and outbox
// enqueueing for the failure-confirmation path.
//
// Decisions (architect review, June 2026):
//   - Auth:            employee_id present → must match assigned driver; absent → admin desk entry
//   - Eligible:        order_status must be Delivering or In Progress
//   - Item outcomes:   every line item must be failed; mixed outcomes use partial delivery (INT-09)
//   - Cases routing:   never set is_complaint_submitted (→ Order Issues, not Delivery Issues)
//   - Idempotency:     409 if order already Failed with a delivery_failure_events row
//   - A6 trigger:      fires once via sendDeliveryFailureNotifications; Odoo via outbox only
//   - Slot close:      no auto-close; Failed is already terminal in endTimeSlotTrip

const prisma = require('../prismaClient');
const { sendDeliveryFailureNotifications } = require('./notificationService');
const { buildOdooEventPayload } = require('./odooPayloadBuilder');

// FR-05-001 — five permitted failure reasons; "Other" requires a description
const FAILURE_REASONS = [
  'Customer Unreachable',
  'Access Blocked',
  'Customer Rejected',
  'Incorrect Address',
  'Other',
];

// Statuses from which a driver may confirm failure (on-site delivery outcomes only)
const ELIGIBLE_STATUSES = ['Delivering', 'In Progress'];

/**
 * A failed delivery fails every line: each order line must appear exactly once as
 * 'failed'. Delivering some units is a partial delivery (POST /:id/partial-delivery),
 * which finalizes the order as Delivered instead. Pure — no database access.
 */
function assertAllItemsFailed(orderProducts, items) {
  const ownedLines = new Map(orderProducts.map(item => [String(item.id), item]));
  const seenIds = new Set();
  if (!Array.isArray(items)) throw Object.assign(new Error('Order item outcomes must be a list.'), { statusCode: 400, code: 'INVALID_ITEMS' });
  for (const item of items) {
    const id = String(item.id), owned = ownedLines.get(id);
    if (!owned || seenIds.has(id)) throw Object.assign(new Error('Each submitted item must belong to this DO and appear only once.'), { statusCode: 400, code: 'INVALID_ITEMS' });
    seenIds.add(id);
    if (item.item_delivery_status === 'delivered' || item.delivered_quantity > 0) throw Object.assign(
      new Error('Some items were delivered — complete the order as a partial delivery (Update → Delivered) instead of failing it.'),
      { statusCode: 400, code: 'PARTIAL_USE_DELIVERED' });
    if (item.delivered_quantity != null && item.delivered_quantity !== 0) throw Object.assign(new Error('Invalid delivered quantity for an order item.'), { statusCode: 400, code: 'INVALID_DELIVERED_QUANTITY' });
  }
  const statusMap = Object.fromEntries(items.map(i => [String(i.id), i.item_delivery_status]));
  if (orderProducts.some(item => statusMap[String(item.id)] !== 'failed')) {
    throw Object.assign(new Error('Every line item must be marked failed before confirming failure.'), { statusCode: 400, code: 'ITEMS_INCOMPLETE' });
  }
}

/**
 * Confirm a failed delivery.
 *
 * Validates all business rules, persists failure state, fires A6 notifications,
 * and atomically enqueues ORDER_FAILED for Odoo's customer WhatsApp automation.
 *
 * @param {string} orderId
 * @param {{
 *   issue_reason: string,
 *   issue_desc: string,
 *   order_products_status: Array<{ id: number, item_delivery_status: string, delivered_quantity?: number }>,
 *   employee_id?: string,
 *   evidence_paths?: string[],
 * }} params
 * @throws Error with .statusCode set for HTTP responses
 */
async function confirmFailure(orderId, {
  issue_reason,
  issue_desc,
  order_products_status,
  employee_id,
  evidence_paths = [],
}) {
  // ── 1. Load order ──────────────────────────────────────────────────────────
  const order = await prisma.orders.findUnique({
    where:   { id: orderId },
    include: { order_products: { select: { id: true, item_delivery_status: true, quantity: true } } },
  });

  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }

  // ── 2. Idempotency — reject if already Failed ──────────────────────────────
  if (order.order_status === 'Failed') {
    const existing = await prisma.delivery_failure_events.findFirst({ where: { order_id: orderId } });
    if (existing) {
      const err = new Error('Delivery failure already confirmed for this order. Re-entry required before a new failure can be recorded.');
      err.statusCode = 409;
      err.code = 'ALREADY_FAILED';
      throw err;
    }
  }

  // ── 3. Eligible status check ───────────────────────────────────────────────
  if (!ELIGIBLE_STATUSES.includes(order.order_status)) {
    const err = new Error(
      `Cannot confirm failure: order_status is "${order.order_status}". Failure confirmation requires Delivering or In Progress.`
    );
    err.statusCode = 409;
    err.code = 'INELIGIBLE_STATUS';
    throw err;
  }

  // ── 4. Auth — assigned-driver check when employee_id is supplied ───────────
  if (employee_id && order.employee_id && order.employee_id !== employee_id) {
    const err = new Error('Forbidden: you are not the assigned driver for this order.');
    err.statusCode = 403;
    err.code = 'NOT_ASSIGNED_DRIVER';
    throw err;
  }

  // ── 5. Reason enum ─────────────────────────────────────────────────────────
  if (!issue_reason || !FAILURE_REASONS.includes(issue_reason)) {
    const err = new Error(
      `Invalid failure reason. Must be one of: ${FAILURE_REASONS.join(', ')}`
    );
    err.statusCode = 400;
    err.code = 'INVALID_REASON';
    throw err;
  }

  // ── 6. Configurable photo gates (A5.2) ────────────────────────────────────
  const settings = await prisma.system_settings.findMany({
    where: { setting_key: { in: ['failure_require_photo'] } },
  });
  const settingMap = Object.fromEntries(settings.map(s => [s.setting_key, s.setting_value]));

  if (settingMap.failure_require_photo !== 'false' && evidence_paths.length === 0) {
    const err = new Error('At least one evidence photo is required for failure confirmation.');
    err.statusCode = 400;
    err.code = 'PHOTO_REQUIRED';
    throw err;
  }
  // Description is mandatory when reason is "Other"
  const remarkRequired = issue_reason === 'Other';
  if (remarkRequired && (!issue_desc || issue_desc.trim().length === 0)) {
    const err = new Error('A description is required when the failure reason is "Other".');
    err.statusCode = 400;
    err.code = 'REMARK_REQUIRED';
    throw err;
  }

  // ── 7. Item outcomes — every line failed ─────────────────────────────────
  assertAllItemsFailed(order.order_products, order_products_status);

  // ── 8. Persist (all writes in one logical block) ───────────────────────────
  const now = new Date();
  // Save Failed, item outcomes, the immutable failure and its Odoo request
  // together. If enqueueing fails, roll back instead of losing the message.
  const updatedOrder = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(19761019)`;
    const current = await tx.orders.findUnique({ where: { id: orderId }, include: { order_products: true } });
    if (!current || !ELIGIBLE_STATUSES.includes(current.order_status)) throw Object.assign(
      new Error('Failure has already been confirmed or this DO is no longer delivering.'),
      { statusCode: 409, code: 'INELIGIBLE_STATUS' });
    if (employee_id && current.employee_id && current.employee_id !== employee_id) throw Object.assign(new Error('This delivery is no longer assigned to you.'), { statusCode: 403, code: 'NOT_ASSIGNED_DRIVER' });
    const currentLines = new Map(current.order_products.map(item => [String(item.id), item]));
    for (const item of order_products_status) {
      const owned = currentLines.get(String(item.id));
      if (!owned || (item.delivered_quantity != null && item.delivered_quantity > owned.quantity)) throw Object.assign(new Error('Order lines changed; reload the delivery before confirming failure.'), { statusCode: 409, code: 'ORDER_ITEMS_CHANGED' });
    }
    const updated = await tx.orders.update({
      where: { id: orderId },
      data: {
        order_status: 'Failed', issue_reason, issue_desc: issue_desc || null,
        issue_status: 'open', issue_evidence: [...(current.issue_evidence || []), ...evidence_paths],
        ...(current.issue_reported_at ? {} : { issue_reported_at: now }),
        updated_at: now,
      },
    });
    for (const item of order_products_status) {
      const owned = currentLines.get(String(item.id));
      await tx.order_products.update({
        where: { id: owned.id },
        data: { item_delivery_status: 'failed', delivered_quantity: 0 },
      });
    }
    const failure = await tx.delivery_failure_events.create({
      data: { order_id: orderId, failure_reason: issue_reason, failure_desc: issue_desc || null,
        evidence_urls: evidence_paths, confirmed_by: employee_id || null,
        odoo_sync_status: current.odoo_order_ref ? 'pending' : 'not_applicable', created_at: now },
    });
    if (current.odoo_order_ref) {
      const payload = await buildOdooEventPayload(orderId, 'Failed', tx);
      const key = `order:${orderId}:failure:${failure.id}:odoo`;
      await tx.integration_outbox.upsert({
        where: { idempotency_key: key }, update: {},
        create: { event_type: 'ORDER_FAILED', target: 'odoo', idempotency_key: key,
          status: 'pending', attempts: 0, next_retry_at: now,
          payload: { ...payload, ce_hub_order_ref: orderId, failure_event_id: failure.id,
            customer_notification_requested: true, notification_owner: 'odoo' } },
      });
    }
    return updated;
  }, { timeout: 15000 });

  // Internal notifications stay in CE Hub; customer WhatsApp belongs to Odoo.
  sendDeliveryFailureNotifications(orderId).catch(err =>
    console.error('[A5] Internal failure notification failed:', err.message)
  );

  return updatedOrder;
}

module.exports = {
  confirmFailure,
  assertAllItemsFailed,
  FAILURE_REASONS,
  ELIGIBLE_STATUSES,
};
