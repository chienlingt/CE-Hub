const { unitsFor } = require('./orderProductUnits');
const { ODOO_LINE_MODEL, assertStoredLineIdentity } = require('./odooLineIdentity');

function preparationError(message, code = 'INVALID_PREPARATION', status = 400) {
  return Object.assign(new Error(message), { status, statusCode: status, code });
}

const isOdooManaged = (order, item) => order?.odoo_picking_id != null || item?.odoo_line_id != null;

function normalizePreparation(lines, ready = false) {
  if (!Array.isArray(lines) || !lines.length) throw preparationError('At least one Odoo order line is required.');
  const ids = new Set(), serials = new Set();
  return lines.map(line => {
    const id = line.order_line_id, quantity = line.product_uom_qty ?? line.quantity;
    if (!Number.isInteger(id) || id <= 0 || ids.has(id)) throw preparationError('Each Odoo line must have a distinct positive order_line_id (stock.move.id).');
    ids.add(id);
    if (!Number.isInteger(quantity) || quantity <= 0) throw preparationError(`Line ${id}: required quantity must be a positive integer.`);
    if (typeof line.product_name !== 'string' || !line.product_name.trim()) throw preparationError(`Line ${id}: product_name is required.`);
    const prepared = line.prepared_quantity ?? null;
    if (prepared !== null && (!Number.isInteger(prepared) || prepared < 0 || prepared > quantity)) throw preparationError(`Line ${id}: invalid prepared_quantity.`);
    const values = line.serial_numbers ?? line.assigned_serials ?? (line.serial_number ? [line.serial_number] : []);
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim())) throw preparationError(`Line ${id}: serial_numbers must be a list of non-empty strings.`);
    const assigned = values.map(value => value.trim());
    if (line.serial_number && assigned[0] !== line.serial_number.trim()) throw preparationError(`Line ${id}: legacy serial_number conflicts with serial_numbers.`);
    if (assigned.length > quantity || (prepared !== null && assigned.length > prepared)) throw preparationError(`Line ${id}: serial count exceeds the prepared/required quantity.`);
    const tracking = line.tracking || 'serial';
    if (!['serial', 'none'].includes(tracking)) throw preparationError(`Line ${id}: tracking must be serial or none; lot/batch handling requires a separate agreed contract.`);
    if (tracking === 'none' && assigned.length) throw preparationError(`Line ${id}: a non-serial-tracked line must not contain serial assignments.`);
    assigned.forEach(serial => {
      const key = serial.toLowerCase();
      if (serials.has(key)) throw preparationError(`Serial "${serial}" is duplicated in this DOO.`, 'SERIAL_DUPLICATE');
      serials.add(key);
    });
    if (ready && (prepared !== quantity || (tracking === 'serial' && assigned.length !== prepared))) throw preparationError(`Line ${id}: DOO Ready requires the full required quantity to be prepared and all serial-tracked units assigned.`);
    return { odoo_line_id: id, odoo_line_model: ODOO_LINE_MODEL, odoo_product_name: line.product_name.trim(), quantity,
      prepared_quantity: prepared, serial_tracking: tracking, assigned_serials: assigned,
      assigned_serial: assigned[0] || null };
  });
}

function mergePreparationUnits(existing, incoming) {
  const oldUnits = existing ? unitsFor(existing) : [];
  const units = Array.from({ length: incoming.quantity }, (_, index) => ({
    ...(oldUnits[index] || { handling_status: 'pending', loaded_serial: null, loaded_by: null, loaded_at: null, unloaded_serial: null, unloaded_by: null, unloaded_at: null }),
    assigned_serial: incoming.assigned_serials[index] || null,
  }));
  const progress = oldUnits.some(unit => unit.handling_status !== 'pending');
  if (progress && (existing.quantity !== incoming.quantity || existing.prepared_quantity !== incoming.prepared_quantity
    || existing.serial_tracking !== incoming.serial_tracking || oldUnits.some((unit, index) => unit.assigned_serial !== units[index]?.assigned_serial))) {
    throw preparationError(`Line ${incoming.odoo_line_id}: preparation changed after scanning started. Cancel/reset scans before applying an Odoo correction.`, 'PREPARATION_LOCKED', 409);
  }
  return units;
}

function preparationProblem(order, items = order?.order_products || []) {
  if (!isOdooManaged(order) && !items.some(item => isOdooManaged(order, item))) return null;
  try { assertStoredLineIdentity(items, order?.odoo_picking_id != null); } catch (error) { return error.message; }
  if (order?.doo_ready !== true) return 'Awaiting Odoo DOO Ready confirmation.';
  for (const item of items) {
    if (!isOdooManaged(order, item)) continue;
    if (item.prepared_quantity !== item.quantity) return 'Odoo has not confirmed the full prepared quantity.';
    if (item.serial_tracking !== 'none' && unitsFor(item).some(unit => !unit.assigned_serial)) return 'Awaiting complete Odoo serial assignments.';
  }
  return null;
}

// Picked is serial assignment, not a driver action or a DOO Ready assertion.
// Non-serial-only DOOs do not infer this serial-assignment milestone.
function hasCompleteSerialAssignments(items = []) {
  const serialItems = items.filter(item => item.serial_tracking !== 'none');
  if (!serialItems.length) return false;
  const seen = new Set();
  return serialItems.every(item => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) return false;
    const units = unitsFor(item);
    return units.length === item.quantity && units.every(unit => {
      const serial = unit.assigned_serial?.trim().toLowerCase();
      if (!serial || seen.has(serial)) return false;
      seen.add(serial);
      return true;
    });
  });
}

module.exports = { normalizePreparation, mergePreparationUnits, preparationProblem, preparationError, isOdooManaged, hasCompleteSerialAssignments };
