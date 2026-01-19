// server/routes/customers.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { extractBuildingName } = require('../utils/addressParser');

router.get('/', async (req, res) => {
  try {
    const customers = await prisma.customers.findMany();
    res.json(customers);
  } catch (err) {
    console.error('GET /api/customers error', err);
    res.status(500).json({ error: 'Failed to fetch customers', details: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const customer = await prisma.customers.create({ data: req.body });
    res.status(201).json(customer);
  } catch (err) {
    console.error('POST /api/customers error', err);
    res.status(500).json({ error: 'Failed to create customer', details: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existingCustomer = await prisma.customers.findUnique({
      where: { id: req.params.id }
    });

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = await prisma.customers.update({
      where: { id: req.params.id },
      data: req.body
    });

    if (req.body.address && req.body.address !== existingCustomer.address) {
      const areaName = extractBuildingName(req.body.address);
      const latestOrder = await prisma.orders.findFirst({
        where: { customer_id: customer.id, building_id: { not: null } },
        orderBy: { created_at: 'desc' }
      });

      if (latestOrder?.building_id) {
        await prisma.buildings.update({
          where: { id: latestOrder.building_id },
          data: {
            building_name: areaName,
            address: req.body.address,
            postal_code: req.body.postcode || undefined,
            updated_at: new Date()
          }
        });
      }
    }

    res.json(customer);
  } catch (err) {
    console.error('PUT /api/customers/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.status(500).json({ error: 'Failed to update customer', details: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.customers.delete({ where: { id: req.params.id } });
    res.json({ message: 'Customer deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/customers/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.status(500).json({ error: 'Failed to delete customer', details: err.message });
  }
});

const { getCoordinatesFromAddress } = require('../services/routingService');

router.get('/validate-address', async (req, res) => {
  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ error: 'Address is required' });
  }

  try {
    const coordinates = await getCoordinatesFromAddress(address);
    if (coordinates) {
      res.json({ message: 'Address is valid', coordinates });
    } else {
      res.status(404).json({ error: 'Address not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate address', details: error.message });
  }
});

module.exports = router;
