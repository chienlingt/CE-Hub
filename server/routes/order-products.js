// server/routes/order-products.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { enqueue } = require('../services/integrationOutboxService');
const { buildOdooEventPayload } = require('../services/odooPayloadBuilder');

router.get('/', async (req, res) => {
  try {
    const orderProducts = await prisma.order_products.findMany({
      include: {
        orders: true,
        products: true
      }
    });
    res.json(orderProducts);
  } catch (err) {
    console.error('GET /api/order-products error', err);
    res.status(500).json({ error: 'Failed to fetch order products', details: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const orderProduct = await prisma.order_products.create({
      data: req.body,
      include: {
        orders: true,
        products: true
      }
    });
    res.status(201).json(orderProduct);
  } catch (err) {
    console.error('POST /api/order-products error', err);
    res.status(500).json({ error: 'Failed to create order product', details: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const orderProduct = await prisma.order_products.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
      include: {
        orders: true,
        products: true
      }
    });
    res.json(orderProduct);
  } catch (err) {
    console.error('PUT /api/order-products/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order product not found' });
    }
    res.status(500).json({ error: 'Failed to update order product', details: err.message });
  }
});

// PATCH /api/order-products/:id/picking-status — A2
// stage: 'picking' (storekeeper) or 'loading' (driver)
router.patch('/:id/picking-status', async (req, res) => {
  try {
    const { stage, employee_id, serial_number } = req.body;

    if (!['loading', 'unloading'].includes(stage)) {
      return res.status(400).json({ error: 'stage must be loading or unloading' });
    }

    const item = await prisma.order_products.findUnique({
      where:   { id: parseInt(req.params.id) },
      include: { products: { select: { product_name: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Stage prerequisite: unloading requires loaded; loading has no prerequisite (first stage)
    if (stage === 'unloading' && item.picking_status !== 'loaded') {
      return res.status(400).json({ error: 'Item must be loaded before it can be unloaded.', code: 'NOT_LOADED' });
    }

    // ── Serial number validation ─────────────────────────────────────────────
    if (serial_number) {
      const productName = item.products?.product_name || 'item';

      if (stage === 'loading' && item.assigned_serial) {
        // Loading: validate against Odoo-assigned serial if one exists
        if (item.assigned_serial.trim() !== serial_number.trim()) {
          return res.status(400).json({
            error:    `Serial mismatch for "${productName}". Expected: ${item.assigned_serial} — Scanned: ${serial_number}`,
            code:     'SERIAL_MISMATCH',
            expected: item.assigned_serial,
            scanned:  serial_number,
          });
        }
      }

      if (stage === 'unloading' && item.loaded_serial) {
        // Unloading: serial must match what was loaded
        if (item.loaded_serial.trim() !== serial_number.trim()) {
          return res.status(400).json({
            error:    `Serial mismatch for "${productName}". Loaded serial: ${item.loaded_serial} — Scanned: ${serial_number}. Unload the correct item.`,
            code:     'UNLOADING_SERIAL_MISMATCH',
            expected: item.loaded_serial,
            scanned:  serial_number,
          });
        }
      }

      // Cross-order serial check: reject if this serial is already active on a different order.
      const FINAL_STATUSES = ['Delivered', 'Completed', 'Cancelled', 'Failed'];
      const sameSerialItems = await prisma.order_products.findMany({
        where: {
          id:  { not: item.id },
          OR: [
            { assigned_serial: serial_number },
            { loaded_serial:   serial_number },
            { unloaded_serial: serial_number },
          ],
        },
        include: { orders: { select: { odoo_order_ref: true, id: true, order_status: true } } },
      });

      const conflict = sameSerialItems.find(
        c => c.orders && !FINAL_STATUSES.includes(c.orders.order_status)
      );

      if (conflict) {
        const ref = conflict.orders?.odoo_order_ref || 'another order (Not Synced)';
        return res.status(409).json({
          error:  `Serial number "${serial_number}" is already assigned to ${ref}. A serial cannot be used across orders.`,
          code:   'SERIAL_CROSS_ORDER_CONFLICT',
          conflict_order_ref: ref,
        });
      }
    }

    const now  = new Date();
    const data =
      stage === 'loading'
        ? { picking_status: 'loaded',   loaded_by:   employee_id || null, loaded_at:   now, loaded_serial:   serial_number || null }
        : { picking_status: 'unloaded', unloaded_by: employee_id || null, unloaded_at: now, unloaded_serial: serial_number || null };

    const updated = await prisma.order_products.update({
      where:   { id: parseInt(req.params.id) },
      data,
      include: { products: { select: { id: true, product_name: true } } },
    });

    // ── Status callbacks: fire when all items reach a milestone ──────────────────
    const siblings = await prisma.order_products.findMany({
      where:  { order_id: item.order_id },
      select: { picking_status: true },
    });

    if (stage === 'loading') {
      const allLoaded = siblings.every(s => ['loaded', 'unloaded'].includes(s.picking_status));
      if (allLoaded) {
        const order = await prisma.orders.findUnique({
          where:  { id: item.order_id },
          select: { id: true, odoo_order_ref: true },
        });
        if (order?.odoo_order_ref) {
          buildOdooEventPayload(order.id, 'Loaded').then(payload => enqueue({
            eventType:      'SLOT_STATUS_CHANGED',
            target:         'odoo',
            payload,
            idempotencyKey: `order:${order.id}:odoo:Loaded`,
          })).catch(e => console.error('[Loading] Loaded outbox enqueue failed:', e.message));
        }
      }
    }

    if (stage === 'unloading') {
      const allUnloaded = siblings.every(s => s.picking_status === 'unloaded');
      if (allUnloaded) {
        const order = await prisma.orders.findUnique({
          where:  { id: item.order_id },
          select: { id: true, odoo_order_ref: true },
        });
        if (order?.odoo_order_ref) {
          buildOdooEventPayload(order.id, 'Arrived').then(payload => enqueue({
            eventType:      'SLOT_STATUS_CHANGED',
            target:         'odoo',
            payload,
            idempotencyKey: `order:${order.id}:odoo:Arrived`,
          })).catch(e => console.error('[Unloading] Arrived outbox enqueue failed:', e.message));
        }
      }
    }

    res.json({ success: true, orderProduct: updated });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found' });
    console.error('PATCH /api/order-products/:id/picking-status error', err);
    res.status(500).json({ error: 'Failed to update picking status', details: err.message });
  }
});

// DELETE /api/order-products/:id/scan — A2: admin fully resets one item's scan progress back to pending
router.delete('/:id/scan', async (req, res) => {
  try {
    const item = await prisma.order_products.findUnique({
      where:   { id: parseInt(req.params.id) },
      include: { products: { select: { product_name: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.picking_status === 'pending') {
      return res.status(400).json({ error: 'Item has no scan progress to reset' });
    }

    const updated = await prisma.order_products.update({
      where: { id: parseInt(req.params.id) },
      data: {
        picking_status:  'pending',
        picked_serial:   null, picked_by:   null, picked_at:   null,
        loaded_serial:   null, loaded_by:   null, loaded_at:   null,
        unloaded_serial: null, unloaded_by: null, unloaded_at: null,
      },
      include: { products: { select: { id: true, product_name: true } } },
    });

    console.log(`[A2] Scan reset for item ${req.params.id} — reverted to 'pending'`);
    res.json({ success: true, orderProduct: updated });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found' });
    console.error('DELETE /api/order-products/:id/scan error', err);
    res.status(500).json({ error: 'Failed to reset item scan', details: err.message });
  }
});

// PATCH /api/order-products/:id/cancel-scan — UC-05 (admin only)
// Cancels/resets a scanned stage, reverting the item to its previous status.
//   stage: 'loading'   → resets to 'pending'  (clears loaded_serial/by/at)
//   stage: 'unloading' → resets to 'loaded'   (clears unloaded_serial/by/at)
router.patch('/:id/cancel-scan', async (req, res) => {
  try {
    const { stage } = req.body;

    if (!['loading', 'unloading'].includes(stage)) {
      return res.status(400).json({ error: 'stage must be loading or unloading' });
    }

    const item = await prisma.order_products.findUnique({
      where:   { id: parseInt(req.params.id) },
      include: { products: { select: { product_name: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Validate the item is actually in the stage being cancelled
    const stageStatusMap  = { loading: 'loaded',  unloading: 'unloaded' };
    const revertStatusMap = { loading: 'pending', unloading: 'loaded'   };

    if (item.picking_status !== stageStatusMap[stage]) {
      return res.status(400).json({
        error: `Cannot cancel ${stage} — item is currently '${item.picking_status}', not '${stageStatusMap[stage]}'`,
      });
    }

    const clearData =
      stage === 'loading'
        ? { picking_status: 'pending', loaded_serial:   null, loaded_by:   null, loaded_at:   null }
        : { picking_status: 'loaded',  unloaded_serial: null, unloaded_by: null, unloaded_at: null };

    const updated = await prisma.order_products.update({
      where:   { id: parseInt(req.params.id) },
      data:    clearData,
      include: { products: { select: { id: true, product_name: true } } },
    });

    console.log(`[UC-05] ${stage} scan cancelled for item ${req.params.id} — reverted to '${revertStatusMap[stage]}'`);
    res.json({ success: true, orderProduct: updated, reverted_to: revertStatusMap[stage] });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found' });
    console.error('PATCH /api/order-products/:id/cancel-scan error', err);
    res.status(500).json({ error: 'Failed to cancel scan', details: err.message });
  }
});

// PATCH /api/order-products/:id/delivery-status
// Update individual item delivery status: pending | delivered | failed
// delivered_quantity is optional — when the caller doesn't supply a real per-unit
// count (e.g. a UI that only knows delivered/failed, not "3 of 5"), it defaults
// to the ordered quantity for delivered / 0 for failed. See odooPayloadBuilder.js.
router.patch('/:id/delivery-status', async (req, res) => {
  try {
    const { item_delivery_status, delivered_quantity } = req.body;
    const allowed = ['pending', 'delivered', 'failed'];
    if (!allowed.includes(item_delivery_status)) {
      return res.status(400).json({ error: `item_delivery_status must be one of: ${allowed.join(', ')}` });
    }

    const item = await prisma.order_products.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!item) return res.status(404).json({ error: 'Order product not found' });

    const resolvedQty = delivered_quantity != null
      ? parseInt(delivered_quantity)
      : item_delivery_status === 'delivered' ? item.quantity
      : item_delivery_status === 'failed'    ? 0
      : null;

    const updated = await prisma.order_products.update({
      where: { id: parseInt(req.params.id) },
      data:  { item_delivery_status, delivered_quantity: resolvedQty },
      include: { products: { select: { id: true, product_name: true } } },
    });

    res.json({ success: true, orderProduct: updated });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Order product not found' });
    console.error('PATCH /api/order-products/:id/delivery-status error', err);
    res.status(500).json({ error: 'Failed to update item status', details: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.order_products.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Order product deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/order-products/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order product not found' });
    }
    res.status(500).json({ error: 'Failed to delete order product', details: err.message });
  }
});

module.exports = router;
