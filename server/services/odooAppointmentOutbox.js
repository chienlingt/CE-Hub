// Strict enqueue: use the caller's transaction. Never swallow a lost decision.
const { buildAppointmentPayload, buildAppointmentDecisionPayload } = require('./odooPayloadBuilder');
const { enqueueOdooOrderEvent } = require('./odooEventOutbox');

async function queueResult(tx, order, status, suffix) {
  if (!order.odoo_order_ref) return;
  const payload = await buildAppointmentPayload(order.id, status, tx);
  if (!payload) throw new Error('Cannot build appointment result.');
  return enqueueOdooOrderEvent(tx, order.id, {
    eventType: 'APPOINTMENT_CONFIRMATION', payload,
    key: `order:${order.id}:odoo:appointment:${status}:${suffix}`,
  });
}
async function queueDecision(tx, reviewed, order) {
  return enqueueOdooOrderEvent(tx, reviewed.order_id || order?.id || null, {
    eventType: 'APPOINTMENT_CHANGE_DECISION',
    payload: buildAppointmentDecisionPayload(reviewed, order),
    key: `odoo-change:${reviewed.id}:decision`,
  });
}
module.exports = { queueResult, queueDecision };
