// server/routes/time-slots.js
const express = require('express');
const router  = express.Router();
const prisma  = require('../prismaClient');
const { departTimeSlot, endTimeSlotTrip } = require('../services/deliveryLifecycleService');
const {
  enqueueSlotDepartureSideEffects,
  enqueueSlotEndTripSideEffects,
  enqueueOnTheWayNotifications,
} = require('../services/integrationOutboxService');

// ── GET /api/time-slots/active  (A.3.7) ────────────────────────────────────
// Returns all slots currently out_for_delivery with order count summary.
// Must be declared BEFORE /:id routes to avoid being matched as an id.
router.get('/active', async (req, res) => {
  try {
    const activeSlots = await prisma.time_slots.findMany({
      where: { slot_status: 'out_for_delivery' },
      include: {
        truck:         { select: { plate_no: true } },
        delivery_team: { select: { id: true, team_type: true } },
        orders: {
          select: { id: true, order_status: true },
        },
      },
      orderBy: { departed_at: 'asc' },
    });

    const result = activeSlots.map(slot => {
      const totalOrders     = slot.orders.length;
      const deliveredOrders = slot.orders.filter(o => ['Delivered', 'Completed'].includes(o.order_status)).length;
      const activeOrders    = slot.orders.filter(o => o.order_status === 'Delivering').length;

      return {
        id:               slot.id,
        date:             slot.date,
        time_window_start: slot.time_window_start,
        time_window_end:  slot.time_window_end,
        slot_status:      slot.slot_status,
        departed_at:      slot.departed_at,
        truck_plate:      slot.truck?.plate_no || null,
        delivery_team:    slot.delivery_team   || null,
        orders: {
          total:     totalOrders,
          delivering: activeOrders,
          delivered: deliveredOrders,
          remaining: totalOrders - deliveredOrders,
        },
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
        truck:         { select: { plate_no: true } },
        delivery_team: { select: { id: true, team_type: true } },
        lorry_trip:    true,
        orders: {
          select: { id: true, order_status: true, delivery_address: true },
        },
      },
    });

    if (!slot) return res.status(404).json({ error: 'Time slot not found' });

    const totalOrders     = slot.orders.length;
    const deliveredOrders = slot.orders.filter(o => ['Delivered', 'Completed'].includes(o.order_status)).length;

    res.json({
      id:               slot.id,
      date:             slot.date,
      time_window_start: slot.time_window_start,
      time_window_end:  slot.time_window_end,
      slot_status:      slot.slot_status || 'scheduled',
      departed_at:      slot.departed_at,
      ended_at:         slot.ended_at,
      truck_plate:      slot.truck?.plate_no || null,
      delivery_team:    slot.delivery_team   || null,
      lorry_trip:       slot.lorry_trip      || null,
      orders: {
        total:     totalOrders,
        delivered: deliveredOrders,
        remaining: totalOrders - deliveredOrders,
        items:     slot.orders,
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
  const { employee_id } = req.body || {};

  try {
    const { timeSlot, ordersUpdated, lorryTrip, activeOrders } = await departTimeSlot(
      req.params.id,
      { employeeId: employee_id }
    );

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
