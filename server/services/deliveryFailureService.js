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
//   - Item outcomes:   every line item must be delivered or failed (no pending left)
//   - Cases routing:   never set is_complaint_submitted (→ Order Issues, not Delivery Issues)
//   - Idempotency:     409 if order already Failed with a delivery_failure_events row
//   - A6 trigger:      fires once via sendDeliveryFailureNotifications; Odoo via outbox only
//   - Slot close:      no auto-close; Failed is already terminal in endTimeSlotTrip

const prisma = require('../prismaClient');
const { sendDeliveryFailureNotifications } = require('./notificationService');
const { enqueue } = require('./integrationOutboxService');

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
 * Confirm a failed delivery.
 *
 * Validates all business rules, persists failure state, fires A6 notifications,
 * and enqueues ORDER_FAILED + RETURN_DO_CREATE outbox events.
 *
 * @param {string} orderId
 * @param {{
 *   issue_reason: string,
 *   issue_desc: string,
 *   order_products_status: Array<{ id: number, item_delivery_status: string }>,
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
    include: { order_products: { select: { id: true, item_delivery_status: true } } },
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

  // ── 7. Item outcome completeness ───────────────────────────────────────────
  const allowedItemStatuses = ['delivered', 'failed'];
  const statusMap = Object.fromEntries(
    (order_products_status || []).map(i => [String(i.id), i.item_delivery_status])
  );

  const hasPending = order.order_products.some(item => {
    const submitted = statusMap[String(item.id)];
    if (!submitted) return true; // not present in payload → still pending
    return !allowedItemStatuses.includes(submitted);
  });

  if (hasPending) {
    const err = new Error('All line items must be classified as delivered or failed before confirming failure.');
    err.statusCode = 400;
    err.code = 'ITEMS_INCOMPLETE';
    throw err;
  }

  // ── 8. Persist (all writes in one logical block) ───────────────────────────
  const now = new Date();

  // 8a. Update order — set Failed status + issue fields (no is_complaint_submitted)
  const updatedOrder = await prisma.orders.update({
    where: { id: orderId },
    data: {
      order_status:  'Failed',
      issue_reason,
      issue_desc:    issue_desc || null,
      issue_status:  'open',
      issue_evidence: [
        ...(order.issue_evidence || []),
        ...evidence_paths,
      ],
      // Reported-failed date — stamp once; never moved by later updates.
      ...(order.issue_reported_at ? {} : { issue_reported_at: now }),
      updated_at: now,
      // Explicitly keep is_complaint_submitted unchanged (may already be false/null)
    },
  });

  // 8b. Update each line item delivery status
  for (const item of (order_products_status || [])) {
    if (!allowedItemStatuses.includes(item.item_delivery_status)) continue;
    await prisma.order_products.update({
      where: { id: parseInt(item.id) },
      data:  { item_delivery_status: item.item_delivery_status },
    });
  }

  // 8c. Write immutable audit row (A5.12)
  await prisma.delivery_failure_events.create({
    data: {
      order_id:       orderId,
      failure_reason: issue_reason,
      failure_desc:   issue_desc || null,
      evidence_urls:  evidence_paths,
      confirmed_by:   employee_id || null,
      odoo_sync_status: 'pending',
      created_at:     now,
    },
  });

  // ── 9. A6 notifications (fire-and-forget, non-fatal) ──────────────────────
  sendDeliveryFailureNotifications(orderId).catch(err =>
    console.error('[A5] sendDeliveryFailureNotifications error:', err.message)
  );

  // ── 10. Outbox: ORDER_FAILED → Odoo Failed sync (A5.3) ────────────────────
  if (order.odoo_order_ref) {
    await enqueue({
      eventType:      'ORDER_FAILED',
      target:         'odoo',
      payload:        { orderId, odooRef: order.odoo_order_ref, status: 'Failed' },
      idempotencyKey: `order:${orderId}:odoo:Failed`,
    });
  }

  // ── 11. Outbox: RETURN_DO_CREATE (Phase 2 stub — handler logs until ERP ready) ──
  await enqueue({
    eventType:      'RETURN_DO_CREATE',
    target:         'odoo',
    payload:        { orderId, odooRef: order.odoo_order_ref || null },
    idempotencyKey: `order:${orderId}:return_do`,
  });

  return updatedOrder;
}

module.exports = {
  confirmFailure,
  FAILURE_REASONS,
  ELIGIBLE_STATUSES,
};
