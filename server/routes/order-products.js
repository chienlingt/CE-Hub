// server/routes/order-products.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

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

    if (!['picking', 'loading', 'unloading'].includes(stage)) {
      return res.status(400).json({ error: 'stage must be picking, loading, or unloading' });
    }

    const item = await prisma.order_products.findUnique({
      where:   { id: parseInt(req.params.id) },
      include: { products: { select: { product_name: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Stage prerequisite checks
    if (stage === 'loading' && item.picking_status === 'pending') {
      return res.status(400).json({ error: 'Item must be picked before it can be loaded.', code: 'NOT_PICKED' });
    }
    if (stage === 'unloading' && item.picking_status !== 'loaded') {
      return res.status(400).json({ error: 'Item must be loaded before it can be unloaded.', code: 'NOT_LOADED' });
    }

    // ── Serial number validation ─────────────────────────────────────────────
    if (serial_number) {
      const productName = item.products?.product_name || 'item';

      if (stage === 'picking' && item.assigned_serial) {
        // Picking: validate against Odoo-assigned serial
        if (item.assigned_serial.trim() !== serial_number.trim()) {
          return res.status(400).json({
            error:    `Serial mismatch for "${productName}". Expected: ${item.assigned_serial} — Scanned: ${serial_number}`,
            code:     'SERIAL_MISMATCH',
            expected: item.assigned_serial,
            scanned:  serial_number,
          });
        }
      }

      if (stage === 'loading' && item.picked_serial) {
        // Loading: serial must match what was picked
        if (item.picked_serial.trim() !== serial_number.trim()) {
          return res.status(400).json({
            error:    `Serial mismatch for "${productName}". Picked serial: ${item.picked_serial} — Scanned: ${serial_number}. Load the correct item.`,
            code:     'LOADING_SERIAL_MISMATCH',
            expected: item.picked_serial,
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

      // If no serial recorded at previous stage → accept any serial scanned
    }

    const now  = new Date();
    const data =
      stage === 'picking'   ? { picking_status: 'picked',   picked_by:   employee_id || null, picked_at:   now, picked_serial:   serial_number || null } :
      stage === 'loading'   ? { picking_status: 'loaded',   loaded_by:   employee_id || null, loaded_at:   now, loaded_serial:   serial_number || null } :
      /* unloading */         { picking_status: 'unloaded', unloaded_by: employee_id || null, unloaded_at: now, unloaded_serial: serial_number || null };

    const updated = await prisma.order_products.update({
      where:   { id: parseInt(req.params.id) },
      data,
      include: { products: { select: { id: true, product_name: true } } },
    });

    res.json({ success: true, orderProduct: updated });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Item not found' });
    console.error('PATCH /api/order-products/:id/picking-status error', err);
    res.status(500).json({ error: 'Failed to update picking status', details: err.message });
  }
});

// PATCH /api/order-products/:id/delivery-status
// Update individual item delivery status: pending | delivered | failed
router.patch('/:id/delivery-status', async (req, res) => {
  try {
    const { item_delivery_status } = req.body;
    const allowed = ['pending', 'delivered', 'failed'];
    if (!allowed.includes(item_delivery_status)) {
      return res.status(400).json({ error: `item_delivery_status must be one of: ${allowed.join(', ')}` });
    }

    const updated = await prisma.order_products.update({
      where: { id: parseInt(req.params.id) },
      data:  { item_delivery_status },
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
