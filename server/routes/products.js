// server/routes/products.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

function normalizeNullableBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '') return null;
  return value;
}

function normalizeProductPayload(payload) {
  return {
    ...payload,
    fragile_flag: normalizeNullableBoolean(payload.fragile_flag),
    installer_team_required_flag: normalizeNullableBoolean(payload.installer_team_required_flag),
    no_lie_down_flag: normalizeNullableBoolean(payload.no_lie_down_flag),
    dismantle_required_flag: normalizeNullableBoolean(payload.dismantle_required_flag)
  };
}

router.get('/', async (req, res) => {
  try {
    const products = await prisma.products.findMany();
    res.json(products);
  } catch (err) {
    console.error('GET /api/products error', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.post('/', async (req, res) => {
  try {
    const product = await prisma.products.create({ data: normalizeProductPayload(req.body) });
    res.status(201).json(product);
  } catch (err) {
    console.error('POST /api/products error', err);
    res.status(500).json({ error: 'Failed to create product', details: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const product = await prisma.products.update({
      where: { id: req.params.id },
      data: normalizeProductPayload(req.body)
    });
    res.json(product);
  } catch (err) {
    console.error('PUT /api/products/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(500).json({ error: 'Failed to update product', details: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.products.delete({ where: { id: req.params.id } });
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/products/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
