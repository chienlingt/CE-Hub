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
