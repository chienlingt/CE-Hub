// client/src/utils/partialDelivery.js
// FRD INT-09 — classify each unit for completion and build the partial-delivery request.
// A unit is delivered only if it was loaded and the driver did not flip it;
// every undelivered unit needs a reason. Mirrors server/services/partialDeliveryService.js.
// FRD INT-10 — the reason "Damaged" makes a unit damaged (goes to RMA, not back to stock);
// a damaged unit needs at least one photo (server/services/damagedUnits.js).

export const DAMAGED_REASON = 'Damaged';

export const UNDELIVERED_REASONS = [
  'Customer refused',
  'Damaged',
  'Wrong item',
  'No space / access',
  'Not loaded',
  'Other',
];

/** Reason text sent to the server; '' when the driver still has to give one. */
function reasonText(override, loaded) {
  const choice = override.reason ?? (loaded ? '' : 'Not loaded');
  if (choice !== 'Other') return choice;
  const note = (override.otherText || '').trim();
  return note ? `Other: ${note}` : '';
}

/**
 * @param {Array} items - loading-status items (already expanded to one row per unit)
 * @param {Object<string, { undelivered?: boolean, reason?: string, otherText?: string, damagePhotos?: File[] }>} overrides - keyed by unit key
 */
export function classifyUnits(items, overrides = {}) {
  return (items || []).map(item => {
    const key = String(item.id);
    const override = overrides[key] || {};
    // 'unloaded' only exists on records from before the unloading step was removed.
    const loaded = ['loaded', 'unloaded'].includes(item.handling_status);
    const delivered = loaded && !override.undelivered;
    return {
      key,
      order_product_id: item.order_product_id ?? item.id,
      unit_number: item.unit_number || 1,
      serial: item.assigned_serial || null,
      tracked: item.serial_tracking !== 'none' && (item.serial_tracking === 'serial' || !!item.assigned_serial),
      name: item.products?.product_name || item.odoo_product_name || `Item ${item.order_product_id ?? item.id}`,
      loaded,
      delivered,
      choice: delivered ? null : (override.reason ?? (loaded ? '' : 'Not loaded')),
      otherText: override.otherText || '',
      reason: delivered ? null : reasonText(override, loaded),
      damaged: !delivered && override.reason === DAMAGED_REASON,
      damagePhotos: !delivered && override.reason === DAMAGED_REASON ? override.damagePhotos || [] : [],
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

/** Damaged units that still need a photo. */
export function missingDamagePhotos(units) {
  return units.filter(unit => unit.damaged && unit.damagePhotos.length === 0);
}

/**
 * Damage photos in upload order, and where each damaged unit's photos sit in that list
 * (the request's photo_indexes). `offset` is the number of files uploaded before them
 * under the same form field.
 */
export function damagePhotoPlan(units, offset = 0) {
  const files = [];
  const indexes = {};
  for (const unit of units) {
    if (!unit.damaged) continue;
    indexes[unit.key] = unit.damagePhotos.map(file => offset + files.push(file) - 1);
  }
  return { files, indexes };
}

function exceptionEntry(unit, indexes, locator) {
  return {
    ...locator,
    reason: unit.reason,
    ...(unit.damaged && { outcome: 'damaged', photo_indexes: indexes[unit.key] || [] }),
  };
}

/** Request `lines` for POST /api/orders/:id/partial-delivery. */
export function buildPartialLines(units) {
  const { indexes } = damagePhotoPlan(units);
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
        undelivered_reasons: undelivered.map(unit => exceptionEntry(unit, indexes, { serial_number: unit.serial })),
      };
    }
    return {
      order_product_id: orderProductId,
      delivered_quantity: lineUnits.length - undelivered.length,
      undelivered_reasons: undelivered.map(unit => exceptionEntry(unit, indexes, { unit_number: unit.unit_number })),
    };
  });
}

/**
 * Failed delivery (FRD INT-10): one row per unit of each order line, so the driver can
 * mark a unit damaged. `items` are order_products rows.
 */
export function failureUnits(items) {
  return (items || []).flatMap(item => Array.from({ length: Math.max(1, item.quantity || 1) }, (_, index) => ({
    key: `${item.id}:${index + 1}`,
    order_product_id: item.id,
    unit_number: index + 1,
    serial: item.unit_scans?.[index]?.assigned_serial || item.assigned_serials?.[index] || null,
    name: item.products?.product_name || item.product_name || item.odoo_product_name || `Item ${item.id}`,
  })));
}

/**
 * order_products_status for PATCH /api/orders/:id/issue (confirm_failure) and the damage
 * photos to append to `files` after the evidence photos.
 *
 * @param {Array} items - order_products rows
 * @param {Object<string, { damaged?: boolean, photos?: File[] }>} damage - keyed by failureUnits() key
 * @param {number} evidenceCount - evidence photos already appended to `files`
 */
export function buildFailurePayload(items, damage = {}, evidenceCount = 0) {
  const units = failureUnits(items).map(unit => ({
    ...unit,
    damaged: !!damage[unit.key]?.damaged,
    damagePhotos: damage[unit.key]?.damaged ? damage[unit.key].photos || [] : [],
  }));
  const { files, indexes } = damagePhotoPlan(units, evidenceCount);
  const status = (items || []).map(item => {
    const damagedUnits = units.filter(unit => unit.order_product_id === item.id && unit.damaged);
    return {
      id: item.id,
      item_delivery_status: 'failed',
      ...(damagedUnits.length > 0 && {
        units: damagedUnits.map(unit => ({
          ...(unit.serial ? { serial_number: unit.serial } : { unit_number: unit.unit_number }),
          outcome: 'damaged', reason: DAMAGED_REASON, photo_indexes: indexes[unit.key],
        })),
      }),
    };
  });
  return { status, files, missingPhotos: units.filter(unit => unit.damaged && unit.damagePhotos.length === 0) };
}
