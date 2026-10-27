// Strict enqueue: use the caller's transaction. Never swallow a lost decision.
const { buildAppointmentPayload, buildAppointmentDecisionPayload } = require('./odooPayloadBuilder');
async function queue(tx, eventType, payload, key) {
  return tx.integration_outbox.upsert({ where: { idempotency_key: key }, update: {},
    create: { event_type: eventType, target: 'odoo', payload, idempotency_key: key,
      status: 'pending', attempts: 0, next_retry_at: new Date() } });
}
async function queueResult(tx, order, status, suffix) {
  if (!order.odoo_order_ref) return;
  const payload = await buildAppointmentPayload(order.id, status, tx);
  if (!payload) throw new Error('Cannot build appointment result.');
  return queue(tx, 'APPOINTMENT_CONFIRMATION', payload,
    `order:${order.id}:odoo:appointment:${status}:${suffix}`);
}
async function queueDecision(tx, reviewed, order) {
  return queue(tx, 'APPOINTMENT_CHANGE_DECISION', buildAppointmentDecisionPayload(reviewed, order),
    `odoo-change:${reviewed.id}:decision`);
}
module.exports = { queueResult, queueDecision };
