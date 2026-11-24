// server/routes/lorry-trips.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { withCrewChangeNotice, slotIdsForTruck } = require('../services/odooCrewChangeService');

router.get('/', async (req, res) => {
  try {
    const lorryTrips = await prisma.lorry_trips.findMany({
      include: { trucks: true }
    });
    res.json(lorryTrips);
  } catch (err) {
    console.error('GET /api/lorry-trips error', err);
    res.status(500).json({ error: 'Failed to fetch lorry trips', details: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { truck, ...data } = req.body;
    const createData = { ...data };
    if (truck) createData.truck_id = truck;

    const lorryTrip = await prisma.lorry_trips.create({
      data: createData,
      include: { trucks: true }
    });
    res.status(201).json(lorryTrip);
  } catch (err) {
    console.error('POST /api/lorry-trips error', err);
    res.status(500).json({ error: 'Failed to create lorry trip', details: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { truck, ...data } = req.body;
    const updateData = { ...data };
    if (truck) updateData.truck_id = truck;

    // FRD INT-07: a changed trip crew or truck is a driver change for the slot's DOs.
    const existing = await prisma.lorry_trips.findUnique({ where: { id: req.params.id }, select: { time_slot_id: true } });
    const lorryTrip = await withCrewChangeNotice(existing?.time_slot_id ? [existing.time_slot_id] : [], () => prisma.lorry_trips.update({
      where: { id: req.params.id },
      data: updateData,
      include: { trucks: true }
    }));
    res.json(lorryTrip);
  } catch (err) {
    console.error('PUT /api/lorry-trips/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Lorry trip not found' });
    }
    res.status(500).json({ error: 'Failed to update lorry trip', details: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.lorry_trips.delete({ where: { id: req.params.id } });
    res.json({ message: 'Lorry trip deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/lorry-trips/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Lorry trip not found' });
    }
    res.status(500).json({ error: 'Failed to delete lorry trip', details: err.message });
  }
});

module.exports = router;
