// server/routes/orders.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

router.get('/', async (req, res) => {
  try {
    const orders = await prisma.orders.findMany({
      include: {
        customers: true,
        employees: true,
        buildings: true,
        order_products: { include: { products: true } }
      }
    });
    res.json(orders);
  } catch (err) {
    console.error('GET /api/orders error', err);
    res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customer, building, products, employee } = req.body;

    const createdCustomer = await prisma.customers.create({
      data: {
        full_name: customer.full_name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        postcode: customer.postcode,
      },
    });

    const createdBuilding = await prisma.buildings.create({
      data: {
        building_name: building.building_name,
        housing_type: building.housing_type,
        zone_id: building.zone_id,
        postal_code: customer.postcode, // if you store this
      },
    });

    const order = await prisma.orders.create({
      data: {
        customer_id: createdCustomer.id,
        building_id: createdBuilding.id,
        employee_id: employee || null,
        created_at: new Date(),
        updated_at: new Date(),
        order_products: {
          create: products.map((p) => ({
            product_id: p.product_id,
            quantity: p.quantity,
            dismantle_required: p.dismantle_required,
          })),
        },
      },
      include: {
        customers: true,
        buildings: true,
        order_products: { include: { products: true } },
      },
    });

    res.status(201).json({
      success: true,
      order,
    });
  } catch (err) {
    console.error('POST /api/orders error', err);
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: err.message,
    });
  }
});


router.put('/:id', async (req, res) => {
  try {
    const { customer, building, employee, ...data } = req.body;
    const updateData = { ...data };
    if (customer) updateData.customer_id = customer;
    if (building) updateData.building_id = building;
    if (employee) updateData.employee_id = employee;

    const order = await prisma.orders.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        customers: true,
        employees: true,
        buildings: true,
        order_products: { include: { products: true } }
      }
    });
    res.json(order);
  } catch (err) {
    console.error('PUT /api/orders/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Failed to update order', details: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.orders.delete({ where: { id: req.params.id } });
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/orders/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Failed to delete order', details: err.message });
  }
});

module.exports = router;
