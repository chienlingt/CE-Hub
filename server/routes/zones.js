// server/routes/zones.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

router.get('/', async (req, res) => {
  try {
    const { sortBy, sortOrder } = req.query;
    let orderBy = { created_at: 'desc' }; // default sort
    if (sortBy && sortOrder) {
      orderBy = { [sortBy]: sortOrder };
    }

    const zones = await prisma.zones.findMany({
      orderBy: orderBy
    });
    res.json(zones);
  } catch (err) {
    console.error('GET /api/zones error', err);
    res.status(500).json({ error: 'Failed to fetch zones' });
  }
});

router.post('/', async (req, res) => {
  try {
    const zone = await prisma.zones.create({ data: req.body });
    res.status(201).json(zone);
  } catch (err) {
    console.error('POST /api/zones error', err);
    res.status(500).json({ error: 'Failed to create zone', details: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const zone = await prisma.zones.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(zone);
  } catch (err) {
    console.error('PUT /api/zones/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Zone not found' });
    }
    res.status(500).json({ error: 'Failed to update zone', details: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.zones.delete({ where: { id: req.params.id } });
    res.json({ message: 'Zone deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/zones/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Zone not found' });
    }
    res.status(500).json({ error: 'Failed to delete zone' });
  }
});

module.exports = router;
