// server/routes/orders.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { extractBuildingName, normalizeBuildingName } = require('../utils/addressParser');

router.get('/', async (req, res) => {
  try {
    const { status, search, date_from, date_to, sort = 'created_desc' } = req.query;

    // Build where clause
    const where = {};

    // Status filter
    if (status && status !== 'all') {
      where.order_status = status;
    }

    // Date range filter (on created_at)
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) {
        where.created_at.gte = new Date(date_from);
      }
      if (date_to) {
        // Include the entire end date
        const endDate = new Date(date_to);
        endDate.setHours(23, 59, 59, 999);
        where.created_at.lte = endDate;
      }
    }

    // Search filter (customer name, phone, building, order id)
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { customers: { full_name: { contains: search, mode: 'insensitive' } } },
        { customers: { phone: { contains: search } } },
        { buildings: { building_name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    // Build orderBy clause
    let orderBy = {};
    switch (sort) {
      case 'created_desc':
        orderBy = { created_at: 'desc' };
        break;
      case 'created_asc':
        orderBy = { created_at: 'asc' };
        break;
      case 'scheduled_desc':
        orderBy = { scheduled_start_date_time: 'desc' };
        break;
      case 'scheduled_asc':
        orderBy = { scheduled_start_date_time: 'asc' };
        break;
      case 'customer':
        orderBy = { customers: { full_name: 'asc' } };
        break;
      default:
        orderBy = { created_at: 'desc' };
    }

    const orders = await prisma.orders.findMany({
      where,
      include: {
        customers: true,
        employees: true,
        buildings: true,
        order_products: { include: { products: true } }
      },
      orderBy
    });

    res.json(orders);
  } catch (err) {
    console.error('GET /api/orders error', err);
    res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customer, building, products, employee, service_type } = req.body;

    // Create customer (or use existing if id provided)
    let createdCustomer;
    if (customer.id) {
      // Use existing customer
      createdCustomer = await prisma.customers.findUnique({
        where: { id: customer.id }
      });
    } else {
      // Create new customer
      createdCustomer = await prisma.customers.create({
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
    }

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
        special_equipment_needed: req.body.special_equipment_needed || null,
        created_at: new Date(),
        updated_at: new Date(),
        order_products: {
          create: products.map((p) => ({
            product_id: p.product_id,
            quantity: p.quantity,
            dismantle_required: p.dismantle_required,
            service_type: p.service_type || service_type || 'delivery', // Use product-level or order-level service type
            custom_installation_time_min: p.custom_installation_time_min || null,
            custom_installation_time_max: p.custom_installation_time_max || null,
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
    const { customer, building, employee, products, ...data } = req.body;

    // Fetch current order
    const existingOrder = await prisma.orders.findUnique({
      where: { id: req.params.id }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if order status allows editing
    if (existingOrder.order_status === 'Delivered') {
      return res.status(400).json({ error: 'Cannot edit delivered orders' });
    }

    // Check edit deadline if order is scheduled
    if (existingOrder.scheduled_start_date_time) {
      // Fetch edit deadline setting
      const editDeadlineSetting = await prisma.system_settings.findUnique({
        where: { setting_key: 'order_edit_deadline_hours' }
      });

      const deadlineHours = editDeadlineSetting ? parseInt(editDeadlineSetting.setting_value) : 24;
      const scheduledTime = new Date(existingOrder.scheduled_start_date_time);
      const editDeadline = new Date(scheduledTime.getTime() - (deadlineHours * 60 * 60 * 1000));

      if (new Date() > editDeadline) {
        return res.status(400).json({
          error: `Edit deadline has passed. Orders cannot be edited within ${deadlineHours} hours of scheduled delivery.`,
          deadline: editDeadline.toISOString()
        });
      }
    }

    // Build update data
    const updateData = { ...data, updated_at: new Date() };
    if (customer) updateData.customer_id = customer;
    if (building) updateData.building_id = building;
    if (employee) updateData.employee_id = employee;

    // If products array is provided, update order_products
    if (products && Array.isArray(products)) {
      // Delete existing order_products
      await prisma.order_products.deleteMany({
        where: { order_id: req.params.id }
      });

      // Update order with new products
      const order = await prisma.orders.update({
        where: { id: req.params.id },
        data: {
          ...updateData,
          order_products: {
            create: products.map((p) => ({
              product_id: p.product_id,
              quantity: p.quantity,
              dismantle_required: p.dismantle_required,
              service_type: p.service_type || 'delivery',
              custom_installation_time_min: p.custom_installation_time_min || null,
              custom_installation_time_max: p.custom_installation_time_max || null,
            }))
          }
        },
        include: {
          customers: true,
          employees: true,
          buildings: true,
          order_products: { include: { products: true } }
        }
      });

      return res.json({ success: true, order });
    } else {
      // Update order without changing products
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

      return res.json({ success: true, order });
    }
  } catch (err) {
    console.error('PUT /api/orders/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Failed to update order', details: err.message });
  }
});

// PATCH /:id - Reassign order to different timeslot (admin only)
router.patch('/:id', async (req, res) => {
  try {
    const { time_slot_id } = req.body;

    if (!time_slot_id) {
      return res.status(400).json({ error: 'time_slot_id is required' });
    }

    // Fetch current order
    const existingOrder = await prisma.orders.findUnique({
      where: { id: req.params.id }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if order status allows reassignment
    if (existingOrder.order_status === 'Delivered') {
      return res.status(400).json({ error: 'Cannot reassign delivered orders' });
    }

    // Verify new timeslot exists
    const newTimeslot = await prisma.time_slots.findUnique({
      where: { id: time_slot_id }
    });

    if (!newTimeslot) {
      return res.status(404).json({ error: 'Timeslot not found' });
    }

    // Update order timeslot
    const updatedOrder = await prisma.orders.update({
      where: { id: req.params.id },
      data: {
        time_slot_id: time_slot_id,
        updated_at: new Date()
      },
      include: {
        time_slots: true,
        customers: true,
        buildings: true,
        order_products: { include: { products: true } }
      }
    });

    console.log(`Order ${req.params.id} reassigned to timeslot ${time_slot_id}`);
    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('PATCH /api/orders/:id error', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Failed to reassign order', details: err.message });
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
