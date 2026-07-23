// server/routes/time-slots.js
const express = require('express');
const router  = express.Router();
const prisma  = require('../prismaClient');
const { departTimeSlot, endTimeSlotTrip, upsertEmployeeLocation } = require('../services/deliveryLifecycleService');
const {
  enqueueSlotDepartureSideEffects,
  enqueueSlotEndTripSideEffects,
  enqueueOnTheWayNotifications,
} = require('../services/integrationOutboxService');

// ── GET /api/time-slots/active  (A.3.7) ────────────────────────────────────
// Returns all slots currently out_for_delivery with order count summary.
// Must be declared BEFORE /:id routes to avoid being matched as an id.
//
// Query params:
//   ?date=today     (default) — only slots whose date matches today in Asia/KL timezone
//   ?date=all       — no date restriction (all out_for_delivery slots)
//   ?date=YYYY-MM-DD — exact slot date match
router.get('/active', async (req, res) => {
  try {
    const { date: dateParam } = req.query;

    // Resolve today in Asia/Kuala_Lumpur (same convention as d1ReminderCron)
    const todayKL = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }); // 'YYYY-MM-DD'

    const where = { slot_status: 'out_for_delivery' };
    if (!dateParam || dateParam === 'today') {
      where.date = todayKL;
    } else if (dateParam !== 'all') {
      where.date = dateParam; // specific YYYY-MM-DD
    }
    // dateParam === 'all' → no date filter added

    const activeSlots = await prisma.time_slots.findMany({
      where,
      include: {
        truck:         { select: { plate_no: true } },
        delivery_team: { select: { id: true, team_type: true } },
        orders: {
          select: {
            id: true,
            order_status: true,
            odoo_order_ref: true,
            overdue_reminder_sent_at: true,
            customers: { select: { full_name: true } },
          },
        },
      },
      orderBy: { departed_at: 'asc' },
    });

    const result = activeSlots.map(slot => {
      const totalOrders     = slot.orders.length;
      const deliveredOrders = slot.orders.filter(o => o.order_status === 'Delivered').length;
      const activeOrders    = slot.orders.filter(o => o.order_status === 'Delivering').length;
      const overdueOrders   = slot.orders.filter(o =>
        o.order_status === 'Delivering' && slot.date && slot.date < todayKL
      ).length;

      return {
        id:                 slot.id,
        date:               slot.date,
        time_window_start:  slot.time_window_start,
        time_window_end:    slot.time_window_end,
        slot_status:        slot.slot_status,
        departed_at:        slot.departed_at,
        truck_plate:        slot.truck?.plate_no || null,
        delivery_team:      slot.delivery_team   || null,
        orders: {
          total:     totalOrders,
          delivering: activeOrders,
          delivered: deliveredOrders,
          remaining: totalOrders - deliveredOrders,
          overdue:   overdueOrders,
        },
        order_summaries: slot.orders.map(o => ({
          id:                       o.id,
          odoo_order_ref:           o.odoo_order_ref || null,
          customer_name:            o.customers?.full_name || null,
          order_status:             o.order_status,
          overdue_reminder_sent_at: o.overdue_reminder_sent_at || null,
        })),
      };
    });

    res.json(result);
  } catch (err) {
    console.error('GET /api/time-slots/active error', err);
    res.status(500).json({ error: 'Failed to fetch active time slots', details: err.message });
  }
});

// ── GET /api/time-slots/:id/status  (A.3.7) ────────────────────────────────
// Single slot summary with order breakdown.
router.get('/:id/status', async (req, res) => {
  try {
    const slot = await prisma.time_slots.findUnique({
      where: { id: req.params.id },
      include: {
        truck: {
          select: {
            plate_no: true,
            employees_trucks_driver_idToemployees: {
              select: { id: true, name: true, display_name: true, contact_number: true },
            },
            employees_trucks_assistant_idToemployees: {
              select: { id: true, name: true, display_name: true, contact_number: true },
            },
          },
        },
        delivery_team: {
          select: {
            id: true,
            team_type: true,
            assignments: {
              select: {
                employee: { select: { id: true, name: true, display_name: true, contact_number: true } },
              },
            },
          },
        },
        lorry_trip: true,
        orders: {
          select: {
            id: true,
            order_status: true,
            delivery_address: true,
            odoo_order_ref: true,
            overdue_reminder_sent_at: true,
            customers: { select: { full_name: true, phone: true } },
          },
          orderBy: { truck_loading_sequence: 'asc' },
        },
      },
    });

    if (!slot) return res.status(404).json({ error: 'Time slot not found' });

    // Resolve started_by employee (who triggered depart)
    let startedByEmployee = null;
    if (slot.started_by) {
      startedByEmployee = await prisma.employees.findUnique({
        where: { id: slot.started_by },
        select: { id: true, name: true, display_name: true, contact_number: true },
      }).catch(() => null);
    }

    // Build deduped contacts array
    // Sources: started_by, truck driver, truck assistant, delivery team members
    const contactMap = new Map();
    const addContact = (emp, role) => {
      if (!emp?.id) return;
      if (contactMap.has(emp.id)) {
        contactMap.get(emp.id).roles.push(role);
      } else {
        contactMap.set(emp.id, {
          id:    emp.id,
          name:  emp.display_name || emp.name || 'Unknown',
          phone: emp.contact_number || null,
          roles: [role],
        });
      }
    };

    if (startedByEmployee) addContact(startedByEmployee, 'Trip lead');
    if (slot.truck?.employees_trucks_driver_idToemployees)    addContact(slot.truck.employees_trucks_driver_idToemployees,    'Truck driver');
    if (slot.truck?.employees_trucks_assistant_idToemployees) addContact(slot.truck.employees_trucks_assistant_idToemployees, 'Assistant');
    for (const a of (slot.delivery_team?.assignments || [])) {
      if (a.employee) addContact(a.employee, 'Delivery team');
    }

    // Sort: Trip lead first, then truck driver/assistant, then team
    const roleOrder = ['Trip lead', 'Truck driver', 'Assistant', 'Delivery team'];
    const contacts = Array.from(contactMap.values()).sort((a, b) => {
      const aMin = Math.min(...a.roles.map(r => roleOrder.indexOf(r)).filter(i => i >= 0));
      const bMin = Math.min(...b.roles.map(r => roleOrder.indexOf(r)).filter(i => i >= 0));
      return aMin - bMin;
    });

    const totalOrders     = slot.orders.length;
    const deliveredOrders = slot.orders.filter(o => o.order_status === 'Delivered').length;

    res.json({
      id:               slot.id,
      date:             slot.date,
      time_window_start: slot.time_window_start,
      time_window_end:  slot.time_window_end,
      slot_status:      slot.slot_status || 'scheduled',
      departed_at:      slot.departed_at,
      ended_at:         slot.ended_at,
      truck_plate:      slot.truck?.plate_no || null,
      delivery_team:    { id: slot.delivery_team?.id || null, team_type: slot.delivery_team?.team_type || null },
      lorry_trip:       slot.lorry_trip      || null,
      contacts,
      orders: {
        total:     totalOrders,
        delivered: deliveredOrders,
        remaining: totalOrders - deliveredOrders,
        items: slot.orders.map(o => ({
          id:                        o.id,
          order_status:              o.order_status,
          delivery_address:          o.delivery_address,
          odoo_order_ref:            o.odoo_order_ref || null,
          overdue_reminder_sent_at:  o.overdue_reminder_sent_at || null,
          customer_name:             o.customers?.full_name || null,
          customer_phone:            o.customers?.phone || null,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/time-slots/:id/status error', err);
    res.status(500).json({ error: 'Failed to fetch slot status', details: err.message });
  }
});

// ── GET /api/time-slots ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const timeSlots = await prisma.time_slots.findMany();
    res.json(timeSlots);
  } catch (err) {
    console.error('GET /api/time-slots error', err);
    res.status(500).json({ error: 'Failed to fetch time slots', details: err.message });
  }
});

// ── POST /api/time-slots  ─────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const timeSlot = await prisma.time_slots.create({ data: req.body });
    res.status(201).json(timeSlot);
  } catch (err) {
    console.error('POST /api/time-slots error', err);
    res.status(500).json({ error: 'Failed to create time slot', details: err.message });
  }
});

// ── POST /api/time-slots/:id/depart  (A.3.1 — delivery event detection) ─────
// Trigger: warehouse confirms truck has departed with all items loaded.
// Side effects: enqueues Odoo sync + customer on-the-way notifications.
router.post('/:id/depart', async (req, res) => {
  const { employee_id, latitude, longitude } = req.body || {};

  try {
    const { timeSlot, ordersUpdated, lorryTrip, activeOrders } = await departTimeSlot(
      req.params.id,
      { employeeId: employee_id }
    );

    // Upsert driver location on depart (best-effort)
    const lat = latitude  != null ? parseFloat(latitude)  : null;
    const lng = longitude != null ? parseFloat(longitude) : null;
    upsertEmployeeLocation(employee_id, lat, lng).catch(() => {});

    // Enqueue Odoo sync for each dispatched order (non-blocking)
    enqueueSlotDepartureSideEffects(timeSlot.id, activeOrders).catch(e =>
      console.error('[Depart] enqueueSlotDepartureSideEffects failed:', e.message)
    );

    // Enqueue customer on-the-way notifications (A.3.4)
    enqueueOnTheWayNotifications(timeSlot.id, activeOrders, {
      date:             timeSlot.date,
      time_window_start: timeSlot.time_window_start,
      time_window_end:  timeSlot.time_window_end,
    }).catch(e =>
      console.error('[Depart] enqueueOnTheWayNotifications failed:', e.message)
    );

    res.json({
      success:        true,
      time_slot:      timeSlot,
      orders_updated: ordersUpdated.length,
      lorry_trip:     lorryTrip,
    });
  } catch (err) {
    if (err.code === 'INVALID_UUID')      return res.status(400).json({ error: err.message, code: err.code });
    if (err.code === 'SLOT_NOT_FOUND')  return res.status(404).json({ error: err.message, code: err.code });
    if (err.code === 'ALREADY_DEPARTED' || err.code === 'TRIP_COMPLETED')
      return res.status(409).json({ error: err.message, code: err.code });
    if (err.code === 'ITEMS_NOT_LOADED')
      return res.status(400).json({ error: err.message, code: err.code, unloaded: err.unloaded });
    console.error('POST /api/time-slots/:id/depart error', err);
    res.status(500).json({ error: 'Failed to depart time slot', details: err.message });
  }
});

// ── POST /api/time-slots/:id/end-trip  (A.3.6 / A.3.5 / A.3.6) ─────────────
// Trigger: driver/admin confirms truck returned — all orders must be terminal.
router.post('/:id/end-trip', async (req, res) => {
  const { employee_id } = req.body || {};

  try {
    const { timeSlot, lorryTrip } = await endTimeSlotTrip(
      req.params.id,
      { employeeId: employee_id }
    );

    // Load all orders for the slot for outbox side effects
    const slotOrders = await prisma.orders.findMany({
      where:  { time_slot_id: req.params.id },
      select: { id: true, order_status: true, odoo_order_ref: true },
    });

    enqueueSlotEndTripSideEffects(timeSlot.id, slotOrders).catch(e =>
      console.error('[EndTrip] enqueueSlotEndTripSideEffects failed:', e.message)
    );

    res.json({
      success:    true,
      time_slot:  timeSlot,
      lorry_trip: lorryTrip,
    });
  } catch (err) {
    if (err.code === 'INVALID_UUID')      return res.status(400).json({ error: err.message, code: err.code });
    if (err.code === 'SLOT_NOT_FOUND')    return res.status(404).json({ error: err.message, code: err.code });
    if (err.code === 'SLOT_NOT_ACTIVE')   return res.status(400).json({ error: err.message, code: err.code });
    if (err.code === 'ORDERS_NOT_TERMINAL')
      return res.status(400).json({ error: err.message, code: err.code, blocking: err.blocking });
    console.error('POST /api/time-slots/:id/end-trip error', err);
    res.status(500).json({ error: 'Failed to end trip', details: err.message });
  }
});

// ── PUT /api/time-slots/:id ───────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const timeSlot = await prisma.time_slots.update({
      where: { id: req.params.id },
      data:  req.body,
    });
    res.json(timeSlot);
  } catch (err) {
    console.error('PUT /api/time-slots/:id error', err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'Time slot not found' });
    res.status(500).json({ error: 'Failed to update time slot', details: err.message });
  }
});

// ── DELETE /api/time-slots/:id ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await prisma.time_slots.delete({ where: { id: req.params.id } });
    res.json({ message: 'Time slot deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/time-slots/:id error', err);
    if (err.code === 'P2025') return res.status(404).json({ error: 'Time slot not found' });
    res.status(500).json({ error: 'Failed to delete time slot', details: err.message });
  }
});

module.exports = router;
