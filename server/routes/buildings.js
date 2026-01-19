const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

// GET all buildings
router.get('/', async (req, res) => {
  try {
    const { sortBy, sortOrder } = req.query;
    let orderBy = { created_at: 'desc' }; // default sort
    if (sortBy && sortOrder) {
      orderBy = { [sortBy]: sortOrder };
    }

    const buildings = await prisma.buildings.findMany({
      include: { zone: true },
      orderBy: orderBy
    });
    res.json(buildings);
  } catch (err) {
    console.error('GET /api/buildings error', err);
    res.status(500).json({ error: 'Failed to fetch buildings', details: err.message });
  }
});

// GET orders for a specific building
router.get('/:id/orders', async (req, res) => {
    try {
        const { id } = req.params;
        const orders = await prisma.orders.findMany({
            where: { building_id: id }
        });
        res.json(orders);
    } catch (err) {
        console.error(`GET /api/buildings/${req.params.id}/orders error`, err);
        res.status(500).json({ error: 'Failed to fetch orders for building', details: err.message });
    }
});

// CREATE building
router.post('/', async (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
    const requiredFields = ['building_name', 'zone_id', 'housing_type', 'postal_code'];
    const missing = requiredFields.filter(f => !data[f]);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // Remove id if it exists (let database generate it)
    const { zone, ...buildingData } = data;

    const building = await prisma.buildings.create({
      data: buildingData,
      include: { zone: true }
    });

    res.status(201).json(building);
  } catch (err) {
    console.error('POST /api/buildings error', err);
    res.status(500).json({ error: 'Failed to create building', details: err.message });
  }
});

// UPDATE building
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Remove fields that shouldn't be updated or cause conflicts
    const { id: dataId, created_at, zone, ...updateData } = data;

    // Ensure updated_at is set
    updateData.updated_at = new Date();

    const building = await prisma.buildings.update({
      where: { id },
      data: updateData,
      include: { zone: true }
    });

    res.json(building);
  } catch (err) {
    console.error('PUT /api/buildings/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Building not found' });
    }
    res.status(500).json({ error: 'Failed to update building', details: err.message });
  }
});

// DELETE building
router.delete('/:id', async (req, res) => {
  try {
    await prisma.buildings.delete({ where: { id: req.params.id } });
    res.json({ message: 'Building deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/buildings/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Building not found' });
    }
    res.status(500).json({ error: 'Failed to delete building', details: err.message });
  }
});

// Reassign orders and delete a building
router.post('/reassign-and-delete', async (req, res) => {
    const { oldBuildingId, newBuildingId } = req.body;

    if (!oldBuildingId || !newBuildingId) {
        return res.status(400).json({ error: 'oldBuildingId and newBuildingId are required' });
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Update orders
            await tx.orders.updateMany({
                where: { building_id: oldBuildingId },
                data: { building_id: newBuildingId }
            });

            // 2. Delete the old building
            await tx.buildings.delete({
                where: { id: oldBuildingId }
            });
        });

        res.json({ message: 'Orders reassigned and building deleted successfully' });
    } catch (err) {
        console.error('POST /api/buildings/reassign-and-delete error', err);
        res.status(500).json({ error: 'Failed to reassign orders and delete building', details: err.message });
    }
});

module.exports = router;