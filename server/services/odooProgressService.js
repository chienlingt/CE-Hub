const { hasCompleteSerialAssignments, isOdooManaged } = require('./odooPreparation');
const { unitsFor } = require('./orderProductUnits');
const { enqueueOdooStatusEvent } = require('./odooEventOutbox');

// Record the milestone in the same transaction as Odoo preparation. Keep
// Pending/Scheduled intact: they are planning states used by B1 and the UI.
async function recordPickedMilestone(db, orderId) {
  const order = await db.orders.findUnique({ where: { id: orderId }, include: { order_products: true } });
  if (!order || !order.odoo_order_ref || !isOdooManaged(order)
    || !['Pending', 'Scheduled', 'Loaded'].includes(order.order_status)) return null;
  const items = order.order_products || [];
  if (!hasCompleteSerialAssignments(items) || items.some(item => unitsFor(item).some(unit => unit.handling_status !== 'pending'))) return null;
  // Refresh a not-yet-attempted snapshot if Odoo corrects serials before loading.
  const row = await enqueueOdooStatusEvent(db, orderId, 'Picked', { refreshPending: true });
  return row;
}

module.exports = { recordPickedMilestone };
