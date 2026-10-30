// client/src/utils/partialDelivery.js
// FRD INT-09 — classify each unit for completion and build the partial-delivery request.
// A unit is delivered only if it was unload-scanned and the driver did not flip it;
// every undelivered unit needs a reason. Mirrors server/services/partialDeliveryService.js.

export const UNDELIVERED_REASONS = [
  'Customer refused',
  'Damaged',
  'Wrong item',
  'No space / access',
  'Not unloaded',
  'Other',
];

/** Reason text sent to the server; '' when the driver still has to give one. */
function reasonText(override, scanned) {
  const choice = override.reason ?? (scanned ? '' : 'Not unloaded');
  if (choice !== 'Other') return choice;
  const note = (override.otherText || '').trim();
  return note ? `Other: ${note}` : '';
}

/**
 * @param {Array} items - loading-status items (already expanded to one row per unit)
 * @param {Object<string, { undelivered?: boolean, reason?: string, otherText?: string }>} overrides - keyed by unit key
 */
export function classifyUnits(items, overrides = {}) {
  return (items || []).map(item => {
    const key = String(item.id);
    const override = overrides[key] || {};
    const scanned = item.handling_status === 'unloaded';
    const delivered = scanned && !override.undelivered;
    return {
      key,
      order_product_id: item.order_product_id ?? item.id,
      unit_number: item.unit_number || 1,
      serial: item.assigned_serial || null,
      tracked: item.serial_tracking !== 'none' && (item.serial_tracking === 'serial' || !!item.assigned_serial),
      name: item.products?.product_name || item.odoo_product_name || `Item ${item.order_product_id ?? item.id}`,
      scanned,
      delivered,
      choice: delivered ? null : (override.reason ?? (scanned ? '' : 'Not unloaded')),
      otherText: override.otherText || '',
      reason: delivered ? null : reasonText(override, scanned),
    };
  });
}

/** 'full' → POST /deliver, 'partial' → POST /partial-delivery, 'none' → use the Failed flow. */
export function deliveryMode(units) {
  const delivered = units.filter(unit => unit.delivered).length;
  if (delivered === 0) return 'none';
  return delivered === units.length ? 'full' : 'partial';
}

export function missingReasons(units) {
  return units.filter(unit => !unit.delivered && !unit.reason);
}

/** Request `lines` for POST /api/orders/:id/partial-delivery. */
export function buildPartialLines(units) {
  const groups = new Map();
  for (const unit of units) {
    if (!groups.has(unit.order_product_id)) groups.set(unit.order_product_id, []);
    groups.get(unit.order_product_id).push(unit);
  }
  return [...groups].map(([orderProductId, lineUnits]) => {
    const undelivered = lineUnits.filter(unit => !unit.delivered);
    if (lineUnits.some(unit => unit.tracked)) {
      return {
        order_product_id: orderProductId,
        delivered_serial_numbers: lineUnits.filter(unit => unit.delivered).map(unit => unit.serial),
        undelivered_serial_numbers: undelivered.map(unit => unit.serial),
        undelivered_reasons: undelivered.map(unit => ({ serial_number: unit.serial, reason: unit.reason })),
      };
    }
    return {
      order_product_id: orderProductId,
      delivered_quantity: lineUnits.length - undelivered.length,
      undelivered_reasons: undelivered.map(unit => ({ unit_number: unit.unit_number, reason: unit.reason })),
    };
  });
}
