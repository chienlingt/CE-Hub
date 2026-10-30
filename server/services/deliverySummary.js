// Derives the per-order delivery outcome shown to admins. A "partial" delivery is not stored as
// a flag: it is an order that is Delivered while some of its order_products lines are failed.

const lineUnits = line => line.quantity || 1;

function deliveredUnits(line) {
  if (line.delivered_quantity != null) return line.delivered_quantity;
  return line.item_delivery_status === 'delivered' ? lineUnits(line) : 0;
}

function summarizeDelivery(order) {
  const lines = order.order_products || [];
  const items = lines.map(line => {
    const quantity = lineUnits(line);
    const delivered = Math.min(deliveredUnits(line), quantity);
    const undeliveredScans = (Array.isArray(line.unit_scans) ? line.unit_scans : [])
      .filter(scan => scan.delivery_outcome === 'undelivered');
    return {
      id: line.id,
      name: line.products?.product_name || line.odoo_product_name || `Item ${line.id}`,
      quantity,
      delivered_quantity: delivered,
      status: delivered === quantity ? 'delivered' : delivered === 0 ? 'not_delivered' : 'partial',
      reasons: [...new Set(undeliveredScans.map(scan => scan.undelivered_reason).filter(Boolean))],
    };
  });

  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
  const deliveredTotal = items.reduce((sum, i) => sum + i.delivered_quantity, 0);
  const isPartial = order.order_status === 'Delivered' && totalUnits > 0 && deliveredTotal < totalUnits;

  return { is_partial: isPartial, delivered_units: deliveredTotal, total_units: totalUnits, items };
}

module.exports = { summarizeDelivery };
