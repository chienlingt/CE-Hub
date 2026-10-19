const router = require('express').Router();
const prisma = require('../prismaClient');
const { unitsFor, expandUnits, summarizeUnits } = require('../services/orderProductUnits');
const { enqueue } = require('../services/integrationOutboxService');
const { buildOdooEventPayload } = require('../services/odooPayloadBuilder');

// Serial edits and scans share one transaction/lock, including single-unit lines.
// This prevents two simultaneous scans from claiming the same serial.
router.use(async (req, res, next) => {
  const match = /^\/(\d+)(?::(\d+))?\/(assigned-serial|handling-status|picking-status|cancel-scan|scan)\/?$/.exec(req.path);
  if (!match || !['PATCH', 'DELETE'].includes(req.method)) return next();
  const [, lineId, unitNumber, action] = match;
  if ((action === 'scan') !== (req.method === 'DELETE')) return next();
  const fail = (status, error, code) => { throw Object.assign(new Error(error), { status, code }); };
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19761019)`;
      const item = await tx.order_products.findUnique({ where: { id: Number(lineId) }, include: { products: true } });
      if (!item) fail(404, 'Item not found');
      const units = unitsFor(item);
      if (units.length > 1 && !unitNumber) fail(400, 'Select an individual unit to edit or scan.');
      const index = Number(unitNumber || 1) - 1;
      const unit = units[index];
      if (!unit) fail(404, 'Item unit not found');
      const { employee_id, stage } = req.body || {};
      const serial = typeof req.body?.serial_number === 'string' ? req.body.serial_number.trim() : '';
      const adminAction = ['assigned-serial', 'cancel-scan', 'scan'].includes(action);
      if (adminAction) {
        const employee = employee_id && await tx.employees.findUnique({ where: { id: employee_id }, include: { role: true } });
        if (!employee || employee.is_active === false || employee.role?.name?.trim().toLowerCase() !== 'admin') fail(403, 'Admin access required.');
      }
      if (action === 'assigned-serial' || action === 'handling-status' || action === 'picking-status') {
        if (!serial) fail(400, 'Serial number is required.');
        const lines = await tx.order_products.findMany({ include: { orders: { select: { order_status: true } } } });
        const conflict = lines.some(line => {
          if (action !== 'assigned-serial' && ['Delivered', 'Completed', 'Cancelled', 'Failed'].includes(line.orders?.order_status)) return false;
          return unitsFor(line).some((other, otherIndex) => !(line.id === item.id && otherIndex === index)
            && ['assigned_serial', 'loaded_serial', 'unloaded_serial'].some(field => other[field]?.trim().toLowerCase() === serial.toLowerCase()));
        });
        if (conflict) fail(409, `Serial "${serial}" is duplicated.`, 'SERIAL_DUPLICATE');
      }
      let milestone;
      if (action === 'assigned-serial') {
        unit.assigned_serial = serial;
        if (['loaded', 'unloaded'].includes(unit.handling_status)) unit.loaded_serial = serial;
        if (unit.handling_status === 'unloaded') unit.unloaded_serial = serial;
      } else if (action === 'scan' || action === 'cancel-scan') {
        if (action === 'cancel-scan' && !['loading', 'unloading'].includes(stage)) fail(400, 'stage must be loading or unloading');
        if (action === 'cancel-scan' && unit.handling_status !== (stage === 'loading' ? 'loaded' : 'unloaded')) fail(400, 'This scan cannot be cancelled at its current stage.');
        if (action === 'scan' || stage === 'loading') Object.assign(unit, { handling_status: 'pending', loaded_serial: null, loaded_at: null, loaded_by: null, unloaded_serial: null, unloaded_at: null, unloaded_by: null });
        else Object.assign(unit, { handling_status: 'loaded', unloaded_serial: null, unloaded_at: null, unloaded_by: null });
      } else {
        if (!['loading', 'unloading'].includes(stage)) fail(400, 'stage must be loading or unloading');
        if (stage === 'loading' && unit.handling_status !== 'pending') fail(409, `Serial "${serial}" is duplicated.`, 'SERIAL_DUPLICATE');
        if (stage === 'unloading' && unit.handling_status !== 'loaded') fail(400, 'Item must be loaded before it can be unloaded.', 'NOT_LOADED');
        const expected = stage === 'loading' ? unit.assigned_serial : unit.loaded_serial;
        if (expected && expected.trim().toLowerCase() !== serial.toLowerCase()) fail(400, `Serial mismatch. Expected: ${expected}`, 'SERIAL_MISMATCH');
        const prefix = stage === 'loading' ? 'loaded' : 'unloaded';
        Object.assign(unit, { handling_status: prefix, [`${prefix}_serial`]: serial, [`${prefix}_at`]: new Date().toISOString(), [`${prefix}_by`]: employee_id || null });
        milestone = stage === 'loading' ? 'Loaded' : 'Arrived';
      }
      const updated = await tx.order_products.update({ where: { id: item.id }, data: summarizeUnits(units), include: { products: true } });
      if (milestone) {
        const siblings = await tx.order_products.findMany({ where: { order_id: item.order_id } });
        if (!siblings.flatMap(unitsFor).every(other => milestone === 'Loaded' ? ['loaded', 'unloaded'].includes(other.handling_status) : other.handling_status === 'unloaded')) milestone = null;
      }
      return { updated: expandUnits(updated)[index], orderId: item.order_id, milestone };
    }, { timeout: 15000 });
    if (result.milestone) {
      buildOdooEventPayload(result.orderId, result.milestone).then(payload => enqueue({
        eventType: 'SLOT_STATUS_CHANGED', target: 'odoo', payload,
        idempotencyKey: `order:${result.orderId}:odoo:${result.milestone}`,
      })).catch(error => console.error('[Unit scan] Outbox enqueue failed:', error.message));
    }
    res.json({ success: true, orderProduct: result.updated });
  } catch (error) {
    if (!error.status) console.error('[Unit scan]', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to update item unit.', code: error.code });
  }
});

module.exports = router;
