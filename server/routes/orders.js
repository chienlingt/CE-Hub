// server/routes/orders.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { extractBuildingName, normalizeBuildingName } = require('../utils/addressParser');
const { scheduleOrders } = require('../services/scheduler');
const dayjs = require('dayjs');
const { getCoordinatesFromAddress, calculateRoute } = require('../services/routingService');

const TRAVEL_FALLBACK_MINUTES = 10;
const BETWEEN_ORDER_BUFFER_MINUTES = 10;
const SERVICE_BUFFER_MINUTES = 10;

function getTruckVolumeCm3(truck) {
  const length = Number(truck?.length_cm || 0);
  const width = Number(truck?.width_cm || 0);
  const height = Number(truck?.height_cm || 0);
  return length * width * height;
}

function getMaxCapacityByTone(trucks, tonePredicate) {
  let maxCapacity = 0;
  for (const truck of trucks) {
    const tone = Number(truck?.tone || 0);
    if (!tonePredicate(tone)) continue;
    const volume = getTruckVolumeCm3(truck);
    if (volume > maxCapacity) maxCapacity = volume;
  }
  return maxCapacity;
}

function pickTruckForVolume(trucks, minTone, totalVolumeCm3) {
  const candidates = trucks
    .filter(truck => Number(truck?.tone || 0) >= minTone)
    .map(truck => ({ truck, volume: getTruckVolumeCm3(truck) }))
    .filter(entry => entry.volume >= totalVolumeCm3)
    .sort((a, b) => {
      const toneA = Number(a.truck?.tone || 0);
      const toneB = Number(b.truck?.tone || 0);
      if (toneA !== toneB) return toneA - toneB;
      return a.volume - b.volume;
    });

  return candidates.length > 0 ? candidates[0].truck : null;
}

function calculateOrderServiceMinutes(order) {
  let totalDeliveryMinutes = 0;
  let totalInstallationMinutes = 0;

  for (const op of order.order_products || []) {
    const product = op.products || {};
    const quantity = Number(op.quantity || 0);

    totalDeliveryMinutes += 15 * Math.max(quantity, 1);

    if (op.dismantle_required) {
      totalInstallationMinutes += Number(product.dismantle_time || 0);
    }

    const customMin = op.custom_installation_time_min ?? null;
    const customMax = op.custom_installation_time_max ?? null;
    const productMin = product.estimated_installation_time_min ?? null;
    const productMax = product.estimated_installation_time_max ?? null;
    const installationMinutes = customMax ?? customMin ?? productMax ?? productMin ?? 0;
    totalInstallationMinutes += Number(installationMinutes || 0);
  }

  return totalDeliveryMinutes + totalInstallationMinutes + SERVICE_BUFFER_MINUTES;
}

function calculateOrderVolumeCm3(order) {
  let totalVolume = 0;
  for (const op of order.order_products || []) {
    const product = op.products || {};
    const length = Number(product.package_length_cm || 0);
    const width = Number(product.package_width_cm || 0);
    const height = Number(product.package_height_cm || 0);
    const quantity = Number(op.quantity || 0);
    totalVolume += length * width * height * Math.max(quantity, 1);
  }
  return totalVolume;
}

async function estimateTravelMinutes(fromAddress, toAddress) {
  if (!fromAddress || !toAddress) {
    return TRAVEL_FALLBACK_MINUTES;
  }

  try {
    const fromCoords = await getCoordinatesFromAddress(fromAddress);
    const toCoords = await getCoordinatesFromAddress(toAddress);
    const route = await calculateRoute([fromCoords, toCoords], new Date());
    const durationSeconds = route.durationWithTraffic ?? route.duration ?? 0;
    return Math.max(Math.ceil(durationSeconds / 60), TRAVEL_FALLBACK_MINUTES);
  } catch (error) {
    console.warn('[Order Reassign] Travel estimate fallback:', error.message);
    return TRAVEL_FALLBACK_MINUTES;
  }
}

router.get('/', async (req, res) => {
  try {
    const { status, search, date_from, date_to, sort = 'created_desc' } = req.query;
    const includeProducts = req.query.include_products !== 'false';

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

    const include = {
      customers: true,
      employees: true,
      buildings: true,
    };

    if (includeProducts) {
      include.order_products = {
        include: {
          products: {
            select: {
              id: true,
              product_name: true,
              package_length_cm: true,
              package_width_cm: true,
              package_height_cm: true,
              fragile_flag: true,
              installer_team_required_flag: true,
              dismantle_time: true,
              estimated_installation_time_min: true,
              estimated_installation_time_max: true,
              no_lie_down_flag: true,
              dismantle_required_flag: true
            }
          }
        }
      };
    }

    const orders = await prisma.orders.findMany({
      where,
      include,
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
        order_products: {
          include: {
            products: {
              select: {
                id: true,
                product_name: true,
                package_length_cm: true,
                package_width_cm: true,
                package_height_cm: true,
                fragile_flag: true,
                installer_team_required_flag: true,
                dismantle_time: true,
                estimated_installation_time_min: true,
                estimated_installation_time_max: true,
                no_lie_down_flag: true,
                dismantle_required_flag: true
              }
            }
          }
        },
      },
    });

    res.status(201).json({
      success: true,
      order,
      buildingInfo: {
        buildingId: finalBuilding.id,
        buildingName: finalBuilding.building_name,
        isExisting: !!existingBuilding,
        accessTimeWindowStart: finalBuilding.access_time_window_start,
        accessTimeWindowEnd: finalBuilding.access_time_window_end
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
          order_products: {
            include: {
              products: {
                select: {
                  id: true,
                  product_name: true,
                  package_length_cm: true,
                  package_width_cm: true,
                  package_height_cm: true,
                  fragile_flag: true,
                  installer_team_required_flag: true,
                  dismantle_time: true,
                  estimated_installation_time_min: true,
                  estimated_installation_time_max: true,
                  no_lie_down_flag: true,
                  dismantle_required_flag: true
                }
              }
            }
          }
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
          order_products: {
            include: {
              products: {
                select: {
                  id: true,
                  product_name: true,
                  package_length_cm: true,
                  package_width_cm: true,
                  package_height_cm: true,
                  fragile_flag: true,
                  installer_team_required_flag: true,
                  dismantle_time: true,
                  estimated_installation_time_min: true,
                  estimated_installation_time_max: true,
                  no_lie_down_flag: true,
                  dismantle_required_flag: true
                }
              }
            }
          }
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
    const { time_slot_id, force_truck_tone } = req.body;

    if (time_slot_id === undefined) {
      return res.status(400).json({ error: 'time_slot_id is required' });
    }

    // Fetch current order
    const existingOrder = await prisma.orders.findUnique({
      where: { id: req.params.id },
      include: {
        customers: true,
        buildings: true,
        order_products: { include: { products: true } }
      }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if order status allows reassignment
    if (existingOrder.order_status === 'Delivered') {
      return res.status(400).json({ error: 'Cannot reassign delivered orders' });
    }

    if (!time_slot_id) {
      const updatedOrder = await prisma.orders.update({
        where: { id: req.params.id },
        data: {
          time_slot_id: null,
          scheduled_start_date_time: null,
          scheduled_end_date_time: null,
          order_status: 'Pending',
          updated_at: new Date()
        },
        include: {
          time_slots: true,
          customers: true,
          buildings: true,
          order_products: {
            include: {
              products: {
                select: {
                  id: true,
                  product_name: true,
                  package_length_cm: true,
                  package_width_cm: true,
                  package_height_cm: true,
                  fragile_flag: true,
                  installer_team_required_flag: true,
                  dismantle_time: true,
                  estimated_installation_time_min: true,
                  estimated_installation_time_max: true,
                  no_lie_down_flag: true,
                  dismantle_required_flag: true
                }
              }
            }
          }
        }
      });

      return res.json({
        success: true,
        order: updatedOrder,
        message: 'Order unassigned'
      });
    }

    // Verify new timeslot exists
    const newTimeslot = await prisma.time_slots.findUnique({
      where: { id: time_slot_id }
    });

    if (!newTimeslot) {
      return res.status(404).json({ error: 'Timeslot not found' });
    }

    const slotDate = newTimeslot.date;
    const slotStart = dayjs(`${slotDate} ${newTimeslot.time_window_start}`);
    const slotEnd = dayjs(`${slotDate} ${newTimeslot.time_window_end}`);

    const building = existingOrder.buildings;
    if (building?.access_time_window_start && building?.access_time_window_end) {
      const accessStart = dayjs(`${slotDate} ${building.access_time_window_start}`);
      const accessEnd = dayjs(`${slotDate} ${building.access_time_window_end}`);
      if (slotStart.isBefore(accessStart) || slotEnd.isAfter(accessEnd)) {
        return res.status(409).json({
          error: 'Timeslot exceeds building access window',
          code: 'ACCESS_WINDOW'
        });
      }
    }

    const slotOrders = await prisma.orders.findMany({
      where: {
        time_slot_id,
        id: { not: existingOrder.id }
      },
      include: {
        customers: true,
        buildings: true,
        order_products: { include: { products: true } }
      },
      orderBy: {
        scheduled_end_date_time: 'desc'
      }
    });

    const lastOrder = slotOrders.find(o => o.scheduled_end_date_time);
    const orderServiceMinutes = calculateOrderServiceMinutes(existingOrder);
    const orderVolumeCm3 = calculateOrderVolumeCm3(existingOrder);
    const slotVolumeCm3 = slotOrders.reduce((sum, order) => sum + calculateOrderVolumeCm3(order), 0);
    const totalVolumeCm3 = slotVolumeCm3 + orderVolumeCm3;

    let fromAddress = null;
    if (lastOrder) {
      fromAddress = lastOrder.customers?.address || lastOrder.buildings?.address || lastOrder.buildings?.building_name || null;
    }
    if (!fromAddress) {
      const config = await prisma.scheduler_config.findFirst();
      fromAddress = config?.warehouse_address || null;
    }

    const toAddress = existingOrder.customers?.address || existingOrder.buildings?.address || existingOrder.buildings?.building_name || null;
    const travelMinutes = await estimateTravelMinutes(fromAddress, toAddress);

    let availableStart = slotStart.clone();
    if (lastOrder?.scheduled_end_date_time) {
      const lastEnd = dayjs(lastOrder.scheduled_end_date_time);
      if (lastEnd.isAfter(availableStart)) {
        availableStart = lastEnd.add(BETWEEN_ORDER_BUFFER_MINUTES, 'minute');
      }
    }

    let orderStart = availableStart.add(travelMinutes, 'minute');
    if (building?.access_time_window_start) {
      const accessStart = dayjs(`${slotDate} ${building.access_time_window_start}`);
      if (orderStart.isBefore(accessStart)) {
        orderStart = accessStart;
      }
    }

    const orderEnd = orderStart.add(orderServiceMinutes, 'minute');
    if (building?.access_time_window_end) {
      const accessEnd = dayjs(`${slotDate} ${building.access_time_window_end}`);
      if (orderEnd.isAfter(accessEnd)) {
        return res.status(409).json({
          error: 'Order exceeds building access window',
          code: 'ACCESS_WINDOW'
        });
      }
    }

    if (orderEnd.isAfter(slotEnd)) {
      return res.status(409).json({
        error: 'Not enough time in selected timeslot',
        code: 'TIME_WINDOW'
      });
    }

    const allTrucks = await prisma.trucks.findMany();
    const maxOneTonCapacity = getMaxCapacityByTone(allTrucks, tone => tone > 0 && tone <= 1);
    const maxThreeTonCapacity = getMaxCapacityByTone(allTrucks, tone => tone >= 3);

    if (maxThreeTonCapacity > 0 && totalVolumeCm3 > maxThreeTonCapacity) {
      return res.status(409).json({
        error: 'Truck not fit for this order size',
        code: 'TRUCK_NOT_FIT'
      });
    }

    const requiresThreeTon = maxOneTonCapacity > 0 && totalVolumeCm3 > maxOneTonCapacity;
    const currentTruck = newTimeslot.truck_id ? allTrucks.find(t => t.id === newTimeslot.truck_id) : null;
    const currentTruckTone = Number(currentTruck?.tone || 0);
    const currentTruckVolume = currentTruck ? getTruckVolumeCm3(currentTruck) : 0;

    if (requiresThreeTon) {
      if (currentTruckTone >= 3 && currentTruckVolume >= totalVolumeCm3) {
        // Current truck fits
      } else {
        const upgradeTruck = pickTruckForVolume(allTrucks, 3, totalVolumeCm3);
        if (!upgradeTruck) {
          return res.status(409).json({
            error: 'Truck not fit for this order size',
            code: 'TRUCK_NOT_FIT'
          });
        }

        if (!force_truck_tone || Number(force_truck_tone) < 3) {
          return res.status(409).json({
            error: 'Truck space not enough, reassign truck?',
            code: 'TRUCK_UPGRADE_REQUIRED',
            recommended_tone: 3,
            truck_id: upgradeTruck.id
          });
        }

        await prisma.time_slots.update({
          where: { id: time_slot_id },
          data: { truck_id: upgradeTruck.id }
        });
      }
    }

    // Update order timeslot
    const updatedOrder = await prisma.orders.update({
      where: { id: req.params.id },
      data: {
        time_slot_id: time_slot_id,
        scheduled_start_date_time: orderStart.toDate(),
        scheduled_end_date_time: orderEnd.toDate(),
        order_status: 'Scheduled',
        updated_at: new Date()
      },
      include: {
        time_slots: true,
        customers: true,
        buildings: true,
        order_products: {
          include: {
            products: {
              select: {
                id: true,
                product_name: true,
                package_length_cm: true,
                package_width_cm: true,
                package_height_cm: true,
                fragile_flag: true,
                installer_team_required_flag: true,
                dismantle_time: true,
                estimated_installation_time_min: true,
                estimated_installation_time_max: true,
                no_lie_down_flag: true,
                dismantle_required_flag: true
              }
            }
          }
        }
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
