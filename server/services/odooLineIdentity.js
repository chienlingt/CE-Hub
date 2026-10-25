// Never infer an Odoo model from an integer: sale.order.line and stock.move
// IDs can overlap. Missing stored markers mean legacy/unknown, not stock.move.
const ODOO_LINE_MODEL = 'stock.move';

function identityError(message, code, status = 409) {
  return Object.assign(new Error(message), { code, status, statusCode: status });
}

function assertIncomingLineIdentity(payload) {
  if (payload?.order_line_model !== ODOO_LINE_MODEL) {
    throw identityError('order_line_model must be stock.move; order_line_id must be the Delivery Order stock.move.id, not a Sales Order line or serial move-line ID.', 'ODOO_LINE_MODEL_REQUIRED', 400);
  }
}

function assertStoredLineIdentity(items = [], requireMoveIds = false) {
  if (items.some(item => (requireMoveIds && item.odoo_line_id == null)
    || (item.odoo_line_id != null && (!Number.isInteger(item.odoo_line_id) || item.odoo_line_id <= 0 || item.odoo_line_model !== ODOO_LINE_MODEL)))) {
    throw identityError('Existing Odoo lines use legacy or unknown IDs. Reconcile them with stock.move.id before preparation, loading or line synchronization; do not relabel or guess IDs.', 'ODOO_LINE_MIGRATION_REQUIRED');
  }
}

function assertOutboundLineIdentity(payload) {
  assertIncomingLineIdentity(payload);
  if (!Array.isArray(payload.order_lines) || !payload.order_lines.length) {
    throw identityError('Odoo line synchronization requires a non-empty stock.move line snapshot.', 'INVALID_ODOO_MOVE_LINES');
  }
  const ids = new Set();
  for (const line of payload.order_lines) {
    if (!Number.isInteger(line.order_line_id) || line.order_line_id <= 0 || ids.has(line.order_line_id)) {
      throw identityError('Each outbound order_line_id must be a distinct positive stock.move.id.', 'INVALID_ODOO_MOVE_LINES');
    }
    ids.add(line.order_line_id);
  }
}

module.exports = { ODOO_LINE_MODEL, assertIncomingLineIdentity, assertStoredLineIdentity, assertOutboundLineIdentity };
