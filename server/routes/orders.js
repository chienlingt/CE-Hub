// server/routes/orders.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { extractBuildingName, normalizeBuildingName } = require('../utils/addressParser');

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

    // Create customer
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

    // Extract building name from customer address
    const extractedBuildingName = extractBuildingName(customer.address);
    const normalizedName = normalizeBuildingName(extractedBuildingName);

    console.log(`Extracted building name from address "${customer.address}": ${extractedBuildingName}`);

    // Check if building already exists (to share access constraints)
    let existingBuilding = await prisma.buildings.findFirst({
      where: {
        building_name: {
          equals: extractedBuildingName,
          mode: 'insensitive' // Case-insensitive search
        }
      }
    });

    let finalBuilding;

    if (existingBuilding) {
      // Use existing building (shares access constraints)
      console.log(`Using existing building: ${existingBuilding.building_name} (ID: ${existingBuilding.id})`);
      finalBuilding = existingBuilding;
    } else {
      // Create new building with extracted name
      console.log(`Creating new building: ${extractedBuildingName}`);
      finalBuilding = await prisma.buildings.create({
        data: {
          building_name: extractedBuildingName,
          housing_type: building?.housing_type || 'Residential',
          zone_id: building?.zone_id || null,
          postal_code: customer.postcode,
          // Default access constraints (can be updated later by admin)
          loading_bay_available: building?.loading_bay_available || false,
          lift_available: building?.lift_available || false,
          access_time_window_start: building?.access_time_window_start || '08:00',
          access_time_window_end: building?.access_time_window_end || '20:00',
          pre_registration_required: building?.pre_registration_required || false,
          created_at: new Date()
        },
      });
    }

    // Create order
    const order = await prisma.orders.create({
      data: {
        customer_id: createdCustomer.id,
        building_id: finalBuilding.id,
        employee_id: employee || null,
        order_status: 'Pending',
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
      buildingInfo: {
        buildingId: finalBuilding.id,
        buildingName: finalBuilding.building_name,
        isExisting: !!existingBuilding
      }
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
