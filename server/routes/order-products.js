// server/routes/order-products.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
router.use(require('./order-product-scans'));
// Odoo preparation can only be changed through the authenticated integration.
router.use(async (req, res, next) => {
  if (!['PUT', 'POST', 'DELETE'].includes(req.method)) return next();
  if (req.method === 'DELETE' && !/^\/\d+\/?$/.test(req.path)) return next();
  try {
    const item = req.method !== 'POST' && await prisma.order_products.findUnique({ where: { id: Number(req.path.split('/')[1]) }, include: { orders: true } });
    const order = item?.orders || (req.body?.order_id && await prisma.orders.findUnique({ where: { id: req.body.order_id } }));
    if (item?.odoo_line_id != null || order?.odoo_picking_id != null || req.body?.odoo_line_id != null) return res.status(409).json({ error: 'Odoo-managed lines must be corrected in Odoo and synchronized.', code: 'ODOO_PREPARATION_READ_ONLY' });
    next();
  } catch (error) { res.status(500).json({ error: 'Unable to verify order-line ownership.' }); }
});

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
