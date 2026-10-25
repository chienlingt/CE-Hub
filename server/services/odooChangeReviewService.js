const crypto = require('crypto');
const prisma = require('../prismaClient');
const { normalizePreparation, preparationError } = require('./odooPreparation');
const { assertIncomingLineIdentity, assertStoredLineIdentity } = require('./odooLineIdentity');
const { unitsFor } = require('./orderProductUnits');

const HEADER_FIELDS = {
  sales_order_name: ['odoo_sales_ref', 'SO reference'],
  delivery_address: ['delivery_address', 'Delivery address'],
  delivery_city: ['delivery_city', 'City'],
  delivery_state_name: ['delivery_state', 'State'],
  delivery_zip: ['delivery_postcode', 'Postcode'],
  delivery_remarks: ['delivery_remarks', 'Delivery remarks'],
  salesperson_name: ['salesperson_name', 'Salesperson'],
  salesperson_phone: ['salesperson_phone', 'Salesperson phone'],
  preferred_delivery_time: ['preferred_timeslot', 'Preferred delivery time'],
};
const CUSTOMER_FIELDS = { partner_name: ['full_name', 'Customer'], partner_email: ['email', 'Customer email'], partner_phone: ['phone', 'Customer phone'] };
const FINAL_OR_MOVING = ['Loaded', 'Delivering', 'In Progress', 'Installing', 'Delivered', 'Failed', 'Cancelled', 'Completed'];
const plain = value => JSON.parse(JSON.stringify(value));
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
const hash = value => crypto.createHash('sha256').update(JSON.stringify(stable(plain(value)))).digest('hex');
const same = (a, b) => JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));
const readOrder = (db, id) => db.orders.findUnique({ where: { id }, include: { order_products: true, customers: true } });
function canonicalLines(items) {
  return items.map(item => ({
    order_line_id: item.odoo_line_id, product_name: item.odoo_product_name,
    product_uom_qty: item.quantity, prepared_quantity: item.prepared_quantity ?? null,
    tracking: item.serial_tracking || 'serial', serial_numbers: unitsFor(item).map(unit => unit.assigned_serial).filter(Boolean),
  })).sort((a, b) => a.order_line_id - b.order_line_id);
}
function snapshot(order) {
  return plain({
    order: Object.fromEntries(['id', 'order_status', 'odoo_picking_id', 'doo_ready', 'time_slot_id', 'employee_id', 'updated_at', ...Object.values(HEADER_FIELDS).map(v => v[0])].map(key => [key, order[key] ?? null])),
    customer: Object.fromEntries(['id', 'full_name', 'email', 'phone', 'updated_at'].map(key => [key, order.customers?.[key] ?? null])),
    items: order.order_products.map(item => ({
      id: item.id, odoo_line_id: item.odoo_line_id, odoo_line_model: item.odoo_line_model,
      odoo_product_name: item.odoo_product_name, quantity: item.quantity, prepared_quantity: item.prepared_quantity,
      serial_tracking: item.serial_tracking, units: unitsFor(item), item_delivery_status: item.item_delivery_status,
      delivered_quantity: item.delivered_quantity,
    })).sort((a, b) => a.id - b.id),
  });
}
function cleanPayload(payload, order, kind) {
  assertIncomingLineIdentity(payload);
  if (!Number.isInteger(payload.id) || payload.id <= 0 || payload.name !== order.odoo_order_ref || (order.odoo_picking_id != null && order.odoo_picking_id !== payload.id)) throw preparationError('DO reference and picking ID must match.', 'ODOO_REFERENCE_MISMATCH', 409);
  if (payload.doo_ready !== undefined && typeof payload.doo_ready !== 'boolean') throw preparationError('doo_ready must be boolean.');
  if (kind === 'preparation' && typeof payload.doo_ready !== 'boolean') throw preparationError('doo_ready is required.');
  const ready = payload.doo_ready ?? order.doo_ready ?? false;
  const lines = normalizePreparation(payload.order_lines, ready);
  const cleaned = { id: payload.id, name: payload.name, order_line_model: 'stock.move', doo_ready: ready,
    order_lines: lines.map(item => ({ order_line_id: item.odoo_line_id, product_name: item.odoo_product_name,
      product_uom_qty: item.quantity, prepared_quantity: item.prepared_quantity, tracking: item.serial_tracking, serial_numbers: item.assigned_serials })).sort((a, b) => a.order_line_id - b.order_line_id) };
  if (kind === 'order') for (const key of [...Object.keys(HEADER_FIELDS), ...Object.keys(CUSTOMER_FIELDS)]) {
    if (!payload[key]) continue; // Match existing import semantics: absent/empty means unchanged.
    if (typeof payload[key] !== 'string') throw preparationError(`${key} must be a string.`);
    if (key === 'preferred_delivery_time') {
      if (!Number.isFinite(Date.parse(payload[key]))) throw preparationError('Invalid preferred_delivery_time.');
      cleaned[key] = new Date(payload[key]).toISOString();
    } else cleaned[key] = payload[key];
  }
  return cleaned;
}
function changesFor(order, payload, kind) {
  const changes = [];
  const add = (field, label, before, after) => { if (!same(before, after)) changes.push({ field, label, before: before ?? null, after: after ?? null }); };
  if (kind === 'order') {
    for (const [key, [column, label]] of Object.entries(HEADER_FIELDS)) if (payload[key]) add(key, label, column === 'preferred_timeslot' && order[column] ? new Date(order[column]).toISOString() : order[column], payload[key]);
    for (const [key, [column, label]] of Object.entries(CUSTOMER_FIELDS)) if (payload[key]) add(key, label, order.customers?.[column], payload[key]);
  }
  add('doo_ready', 'DOO Ready', order.doo_ready ?? false, payload.doo_ready);
  const old = new Map(canonicalLines(order.order_products).map(line => [line.order_line_id, line]));
  const incoming = new Map(payload.order_lines.map(line => [line.order_line_id, line]));
  for (const id of new Set([...old.keys(), ...incoming.keys()])) {
    const before = old.get(id), after = incoming.get(id);
    const title = `${after?.product_name || before?.product_name || 'Item'} · move ${id}`;
    if (!before || !after) add(`line:${id}`, `${title} (${after ? 'add item' : 'remove item'})`, before, after);
    else for (const [key, label] of Object.entries({ product_name: 'item name', product_uom_qty: 'required quantity', prepared_quantity: 'prepared quantity', tracking: 'tracking', serial_numbers: 'assigned serials' })) add(`line:${id}:${key}`, `${title} · ${label}`, before[key], after[key]);
  }
  return changes;
}
function approvalBlockers(order, payload, kind) {
  const blockers = [];
  try { assertStoredLineIdentity(order.order_products, true); } catch (error) { blockers.push(error.message); }
  const linesChanged = !same(canonicalLines(order.order_products), [...payload.order_lines].sort((a, b) => a.order_line_id - b.order_line_id));
  const progress = order.order_products.some(item => unitsFor(item).some(unit => unit.handling_status !== 'pending'));
  if ((progress || FINAL_OR_MOVING.includes(order.order_status)) && (linesChanged || (order.doo_ready ?? false) !== payload.doo_ready)) blockers.push('Preparation/items cannot change after scanning, departure or a final outcome. Use a separate reconciliation workflow; scans and delivery outcomes will not be reset.');
  if (order.order_status === 'Scheduled') {
    const before = canonicalLines(order.order_products).map(l => [l.order_line_id, l.product_uom_qty]);
    const after = [...payload.order_lines].sort((a, b) => a.order_line_id - b.order_line_id).map(l => [l.order_line_id, l.product_uom_qty]);
    if (!same(before, after)) blockers.push('Item/required-quantity changes on scheduled orders need rescheduling and capacity review first.');
  }
  if (kind === 'preparation' && FINAL_OR_MOVING.includes(order.order_status)) blockers.push('Preparation cannot be approved after departure or a final outcome.');
  return blockers;
}
async function saveChangeRequest(payload, kind) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(19761019)`;
    const order = await tx.orders.findFirst({ where: { odoo_order_ref: payload.name }, include: { order_products: true, customers: true } });
    if (!order) throw preparationError('DOO must exist before review.', 'ORDER_NOT_FOUND', 404);
    const cleaned = cleanPayload(payload, order, kind);
    const changes = changesFor(order, cleaned, kind);
    if (!changes.length) return { success: true, action: 'unchanged', order_id: order.id };
    const before = snapshot(order), baseline = hash(before);
    const key = hash({ orderId: order.id, kind, cleaned, baseline });
    const request = await tx.odoo_change_requests.upsert({ where: { request_key: key }, update: {}, create: {
      order_id: order.id, do_ref: order.odoo_order_ref, request_kind: kind, request_key: key,
      payload: cleaned, before_snapshot: before, baseline_hash: baseline, changes, status: 'pending',
    } });
    return { success: true, action: request.status === 'pending' ? 'pending_approval' : 'previously_reviewed', request_id: request.id, review_status: request.status, order_id: order.id, order_status: order.order_status };
  }, { timeout: 20000 });
}
async function requestDetail(id) {
  const request = await prisma.odoo_change_requests.findUnique({ where: { id } });
  if (!request) throw preparationError('Change request not found.', 'REQUEST_NOT_FOUND', 404);
  const order = await readOrder(prisma, request.order_id);
  const stale = !order || hash(snapshot(order)) !== request.baseline_hash;
  const blockers = order ? approvalBlockers(order, request.payload, request.request_kind) : ['The order no longer exists.'];
  if (stale) blockers.unshift('The order changed after this request arrived. Reject this request and ask Odoo to send a fresh snapshot.');
  return { ...request, current_order_status: order?.order_status || null, stale, approval_blockers: blockers, can_approve: request.status === 'pending' && !blockers.length };
}
async function decideRequest(id, decision, note, actor) {
  if (!['approve', 'reject'].includes(decision)) throw preparationError('decision must be approve or reject.');
  if (typeof note !== 'string' || note.length > 2000 || (decision === 'reject' && note.trim().length < 3)) throw preparationError('Enter a rejection reason (3–2000 characters), or an optional approval note.');
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(19761019)`;
    const request = await tx.odoo_change_requests.findUnique({ where: { id } });
    if (!request) throw preparationError('Change request not found.', 'REQUEST_NOT_FOUND', 404);
    if (request.status !== 'pending') throw preparationError('This request was already reviewed.', 'ALREADY_REVIEWED', 409);
    let applied;
    if (decision === 'approve') {
      // Legacy operational handlers do not all use the advisory lock. Row locks
      // keep their updates from racing the snapshot check and this application.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${request.order_id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM order_products WHERE order_id = ${request.order_id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT c.id FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.id = ${request.order_id}::uuid FOR UPDATE OF c`;
      const order = await readOrder(tx, request.order_id);
      if (!order || hash(snapshot(order)) !== request.baseline_hash) throw preparationError('The order changed. Reload the review; a fresh Odoo snapshot is required.', 'STALE_CHANGE_REQUEST', 409);
      const blockers = approvalBlockers(order, request.payload, request.request_kind);
      if (blockers.length) throw preparationError(blockers.join(' '), 'RECONCILIATION_REQUIRED', 409);
      const { applyApprovedChange } = require('./odooOrderIngestService');
      await applyApprovedChange(request.payload, request.request_kind, tx);
      const after = await readOrder(tx, request.order_id);
      if (after.order_status !== order.order_status || after.time_slot_id !== order.time_slot_id) throw preparationError('Approval must not change delivery status or time slot.', 'UNSAFE_STATUS_CHANGE', 409);
      applied = snapshot(after);
    }
    return tx.odoo_change_requests.update({ where: { id }, data: {
      status: decision === 'approve' ? 'approved' : 'rejected', reviewed_by: actor.id,
      reviewed_by_name: actor.name, review_note: note.trim() || null, reviewed_at: new Date(),
      ...(applied ? { applied_snapshot: applied } : {}),
    } });
  }, { timeout: 20000 });
}
module.exports = { saveChangeRequest, requestDetail, decideRequest, approvalBlockers, snapshot, changesFor };
