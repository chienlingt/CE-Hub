// server/services/orderReentryService.js
//
// A.5 Phase 3 — Order Re-entry (FR-05-004 / A.5.9-A.5.11)
//
// Called by POST /api/orders/:id/re-enter once a failed order's return has been fully
// confirmed on the CE-Hub side (delivery_returns.transfer_status === 'inventory_updated' —
// see returnWorkflowService.js). Resets the SAME order row back into a schedulable state
// and records a new delivery_workflows generation, while leaving the original
// delivery_failure_events audit row untouched (A.5.12).
//
// Reset target is order_status: 'Pending' (not a new "Appointment Confirmed" status) —
// this is a deliberate choice so the existing Intelligent Scheduling Engine (B.1,
// services/scheduler.js fetchPendingOrders()) picks the order back up automatically with
// zero changes to the scheduler, and so an admin can also assign a slot immediately via
// the existing PATCH /api/orders/:id reassignment handler.
//
// Does NOT create a new `orders` row — that is the separate, existing manual "place a
// brand-new order" flow in PlaceOrder.js (which uses orders.rescheduled_from_order_id).
// delivery_workflows tracks generations of this same order being reset in place.

const prisma = require('../prismaClient');
const { enqueue } = require('./integrationOutboxService');

/**
 * Reset a failed order back to Pending and record a new delivery_workflows generation.
 *
 * @param {string} orderId
 * @param {string|null} actorEmployeeId - admin performing the reset (created_by)
 * @throws Error with .statusCode/.code for HTTP responses
 */
async function reenterOrder(orderId, actorEmployeeId = null) {
  const order = await prisma.orders.findUnique({
    where:   { id: orderId },
    include: {
      delivery_failure_events: { orderBy: { created_at: 'desc' }, take: 1, include: { delivery_returns: true } },
    },
  });

  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }

  if (order.order_status !== 'Failed') {
    const err = new Error(`Cannot re-enter: order_status is "${order.order_status}", expected "Failed".`);
    err.statusCode = 409;
    err.code = 'NOT_FAILED';
    throw err;
  }

  const latestFailure = order.delivery_failure_events[0];
  const deliveryReturn = latestFailure?.delivery_returns;

  if (!deliveryReturn || deliveryReturn.transfer_status !== 'inventory_updated') {
    const err = new Error(
      'Cannot re-enter: the return for this failed delivery has not been fully confirmed yet ' +
      `(transfer_status is "${deliveryReturn?.transfer_status || 'not started'}", expected "inventory_updated").`
    );
    err.statusCode = 409;
    err.code = 'RETURN_NOT_CONFIRMED';
    throw err;
  }

  // ── Determine next generation, superseding the prior active workflow row ──────────
  const priorActive = await prisma.delivery_workflows.findFirst({
    where:   { order_id: orderId, status: 'active' },
    orderBy: { generation: 'desc' },
  });
  const nextGeneration = (priorActive?.generation || 1) + 1;

  if (priorActive) {
    await prisma.delivery_workflows.update({
      where: { id: priorActive.id },
      data:  { status: 'superseded' },
    });
  }

  const workflow = await prisma.delivery_workflows.create({
    data: {
      order_id:             orderId,
      generation:           nextGeneration,
      previous_workflow_id: priorActive?.id || null,
      failure_event_id:     latestFailure.id,
      status:               'active',
      reset_reason:         'Reset for rescheduling after confirmed return (A.5.11)',
      created_by:           actorEmployeeId || null,
    },
  });

  // ── A5.9: zero/close the failed DO lines in Odoo (Odoo call is a TODO stub) ────────
  if (order.odoo_order_ref) {
    await enqueue({
      eventType:      'DO_LINE_RESET',
      target:         'odoo',
      payload:        { orderId, odooRef: order.odoo_order_ref },
      idempotencyKey: `order:${orderId}:do_line_reset:gen${nextGeneration}`,
    });
  }

  // ── A5.11: reset the order in place ────────────────────────────────────────────────
  // issue_status: 'resolved' (not a bespoke 'closed' value) — matches how the existing
  // manual reschedule flow in PlaceOrder.js already resolves the source order via
  // rescheduled_from_order_id (see routes/orders.js POST '/'), so this reset order lands
  // in the same "Resolved" filter/badge treatment IssueManagement.js already has, instead
  // of introducing an orphan status no existing UI recognizes.
  const now = new Date();
  const resetOrder = await prisma.orders.update({
    where: { id: orderId },
    data:  {
      order_status:              'Pending',
      time_slot_id:              null,
      scheduled_start_date_time: null,
      scheduled_end_date_time:   null,
      assignment_status:         'unassigned',
      issue_status:              'resolved',
      resolved_by:               actorEmployeeId || null,
      resolved_at:                now,
      updated_at:                 now,
      // delivery_failure_events is untouched — audit trail survives re-entry (A5.12)
    },
  });

  return { order: resetOrder, workflow };
}

module.exports = { reenterOrder };
