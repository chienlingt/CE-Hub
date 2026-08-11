const express             = require('express');
const router              = express.Router();
const prisma              = require('../prismaClient');
const { sendWhatsAppDirect, normalizePhone } = require('../services/whatsappService');

// ── Per-user notifications ────────────────────────────────────────────────────

// GET /api/notifications?user_id=xxx&limit=20
router.get('/', async (req, res) => {
  try {
    const { user_id, limit = 20 } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const notifications = await prisma.notifications.findMany({
      where:   { user_id },
      orderBy: { created_at: 'desc' },
      take:    parseInt(limit),
    });
    res.json(notifications);
  } catch (err) {
    console.error('GET /api/notifications error', err);
    res.status(500).json({ error: 'Failed to fetch notifications', details: err.message });
  }
});

// GET /api/notifications/unread-count?user_id=xxx
router.get('/unread-count', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const count = await prisma.notifications.count({
      where: { user_id, is_read: false },
    });
    res.json({ count });
  } catch (err) {
    console.error('GET /api/notifications/unread-count error', err);
    res.status(500).json({ error: 'Failed to fetch unread count', details: err.message });
  }
});

// GET /api/notifications/all — admin: all error notifications
router.get('/all', async (req, res) => {
  try {
    const { type, is_read, limit = 50 } = req.query;
    const where = {};
    if (type)              where.type    = type;
    if (is_read !== undefined) where.is_read = is_read === 'true';

    const notifications = await prisma.notifications.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: parseInt(limit),
    });

    const enriched = await Promise.all(
      notifications.map(async (n) => {
        if (!n.order_id) return n;
        const order = await prisma.orders.findUnique({
          where:   { id: n.order_id },
          include: { customers: { select: { full_name: true, email: true } } },
        });
        return { ...n, order };
      })
    );
    res.json(enriched);
  } catch (err) {
    console.error('GET /api/notifications/all error', err);
    res.status(500).json({ error: 'Failed to fetch all notifications', details: err.message });
  }
});

// PATCH /api/notifications/read-all?user_id=xxx  ← must be BEFORE /:id routes
router.patch('/read-all', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const result = await prisma.notifications.updateMany({
      where: { user_id, is_read: false },
      data:  { is_read: true },
    });
    res.json({ success: true, updated: result.count });
  } catch (err) {
    console.error('PATCH /api/notifications/read-all error', err);
    res.status(500).json({ error: 'Failed to mark all as read', details: err.message });
  }
});

// POST /api/notifications/whatsapp/:orderId — manually send WhatsApp to customer
router.post('/whatsapp/:orderId', async (req, res) => {
  try {
    // 1. Load order + customer
    const order = await prisma.orders.findUnique({
      where:   { id: req.params.orderId },
      include: { customers: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const phone    = order.customers?.phone;
    const name     = order.customers?.full_name || 'Customer';
    const orderRef = order.odoo_order_ref || 'Not Synced';
    const reason   = order.issue_reason   || 'Delivery issue';

    if (!phone) {
      return res.status(400).json({ error: 'Customer has no phone number on record' });
    }

    // 2. Load message template
    const setting  = await prisma.system_settings.findUnique({
      where: { setting_key: 'whatsapp_failure_message_template' },
    });
    const template = setting?.setting_value
      || 'Hi {customerName}, your delivery for order {orderRef} was unsuccessful. Reason: {reason}. Our team will contact you to reschedule.';

    const body = template
      .replace('{customerName}', name)
      .replace('{orderRef}',     orderRef)
      .replace('{reason}',       reason);

    // 3. Send directly — bypasses the enabled toggle (admin manual send)
    const normalized = normalizePhone(phone);
    const result     = await sendWhatsAppDirect(phone, body);

    console.log(`[WhatsApp] Manual send to ${normalized}:`, result);
    res.json({ success: true, result, to: normalized });

  } catch (err) {
    console.error('POST /api/notifications/whatsapp error:', err.message);
    res.status(500).json({ error: 'Failed to send WhatsApp', details: err.message });
  }
});

// DELETE /api/notifications/:id — dismiss a single notification
router.delete('/:id', async (req, res) => {
  try {
    await prisma.notifications.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Notification not found' });
    console.error('DELETE /api/notifications/:id error', err);
    res.status(500).json({ error: 'Failed to delete notification', details: err.message });
  }
});

// PATCH /api/notifications/:id/read  ← keep AFTER all literal-path routes
router.patch('/:id/read', async (req, res) => {
  try {
    const notification = await prisma.notifications.update({
      where: { id: req.params.id },
      data:  { is_read: true },
    });
    res.json({ success: true, notification });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Notification not found' });
    console.error('PATCH /api/notifications/:id/read error', err);
    res.status(500).json({ error: 'Failed to mark as read', details: err.message });
  }
});

module.exports = router;
