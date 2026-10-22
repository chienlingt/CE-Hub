const { hasCompleteSerialAssignments, isOdooManaged } = require('./odooPreparation');
const { unitsFor } = require('./orderProductUnits');
const { buildOdooEventPayload } = require('./odooPayloadBuilder');

// Record the milestone in the same transaction as Odoo preparation. Keep
// Pending/Scheduled intact: they are planning states used by B1 and the UI.
async function recordPickedMilestone(db, orderId) {
  const order = await db.orders.findUnique({ where: { id: orderId }, include: { order_products: true } });
  if (!order || !order.odoo_order_ref || !isOdooManaged(order)
    || !['Pending', 'Scheduled', 'Loaded'].includes(order.order_status)) return null;
  const items = order.order_products || [];
  if (!hasCompleteSerialAssignments(items) || items.some(item => unitsFor(item).some(unit => unit.handling_status !== 'pending'))) return null;
  const payload = await buildOdooEventPayload(orderId, 'Picked', db);
  const key = `order:${orderId}:odoo:Picked`;
  const row = await db.integration_outbox.upsert({
    where: { idempotency_key: key }, update: {},
    create: { event_type: 'SLOT_STATUS_CHANGED', target: 'odoo', payload,
      idempotency_key: key, status: 'pending', attempts: 0, next_retry_at: new Date() },
  });
  // Refresh a not-yet-attempted snapshot if Odoo corrects serials before loading.
  await db.integration_outbox.updateMany({
    where: { id: row.id, status: 'pending', attempts: 0 }, data: { payload },
  });
  return row;
}

module.exports = { recordPickedMilestone };
