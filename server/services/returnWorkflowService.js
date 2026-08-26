// server/services/returnWorkflowService.js
//
// A.5 Phase 2 — Return Logistics (FR-05-003 / A.5.5-A.5.8)
//
// Owns the CE-Hub-local delivery_returns state machine for a failed delivery:
//
//   pending -> awaiting_receipt -> received -> inventory_updated
//
// One row per delivery_failure_events row (1:1, enforced by the unique
// failure_event_id column). Advanced by:
//   - createReturnRecord()     called from deliveryFailureService.confirmFailure()
//                               immediately on failure confirmation
//   - advanceTransferStatus()  called from the RETURN_DO_CREATE / STOCK_TRANSFER /
//                               INVENTORY_RETURN outbox handlers in
//                               integrationOutboxCron.js, and from the
//                               scan-to-receive rollup in routes/order-products.js
//   - getReturnStateForOrder() read by the scan-to-receive prerequisite check and
//                               the A.5.11 re-entry precondition check
//
// IMPORTANT: this service manages CE-Hub state only. The Odoo-side calls each
// stage notionally represents (Return DO creation, stock transfer, inventory
// adjustment) are NOT implemented here — see the `// TODO: confirm Odoo API`
// markers in integrationOutboxCron.js. Odoo's Return DO / stock-transfer /
// quarantine-location API has not been confirmed with the Odoo dev team as of
// this writing (see system_settings.odoo_quarantine_location_id).

const prisma = require('../prismaClient');

/**
 * Create the delivery_returns row for a newly-confirmed failure. Idempotent —
 * safe to call more than once for the same failure event (e.g. retried request).
 *
 * @param {string} failureEventId - delivery_failure_events.id (UUID)
 */
async function createReturnRecord(failureEventId) {
  return prisma.delivery_returns.upsert({
    where:  { failure_event_id: failureEventId },
    create: { failure_event_id: failureEventId, transfer_status: 'pending' },
    update: {},
  });
}

/**
 * Advance a return record's transfer_status. Used by outbox stub handlers and
 * the scan-to-receive rollup — never throws on a missing row (logs and
 * no-ops instead), since outbox handlers must never dead-letter the queue on
 * a data race or a failure event that predates this feature.
 *
 * @param {string} failureEventId
 * @param {string} status - pending | awaiting_receipt | received | inventory_updated
 * @param {object} extra - additional columns to set (e.g. received_at/received_by)
 */
async function advanceTransferStatus(failureEventId, status, extra = {}) {
  try {
    return await prisma.delivery_returns.update({
      where: { failure_event_id: failureEventId },
      data:  { transfer_status: status, ...extra },
    });
  } catch (err) {
    if (err.code === 'P2025') {
      console.warn(`[ReturnWorkflow] No delivery_returns row for failure_event_id=${failureEventId}, skipping advance to "${status}"`);
      return null;
    }
    throw err;
  }
}

/**
 * Look up the most recent failure event + its delivery_returns row for an
 * order. Used by:
 *   - the return-status scan endpoint's prerequisite check (A.5.7)
 *   - the A.5.11 re-entry precondition check (must be 'inventory_updated')
 *
 * @param {string} orderId
 * @returns {Promise<{ failureEvent: object, deliveryReturn: object|null } | null>}
 */
async function getReturnStateForOrder(orderId) {
  const failureEvent = await prisma.delivery_failure_events.findFirst({
    where:   { order_id: orderId },
    orderBy: { created_at: 'desc' },
    include: { delivery_returns: true },
  });
  if (!failureEvent) return null;
  const { delivery_returns: deliveryReturn, ...rest } = failureEvent;
  return { failureEvent: rest, deliveryReturn };
}

module.exports = {
  createReturnRecord,
  advanceTransferStatus,
  getReturnStateForOrder,
};
