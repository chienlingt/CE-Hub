const express = require('express');
const router  = express.Router();
const prisma  = require('../prismaClient');
const { pushOrder } = require('../services/odooOrderIngestService');

const WEBHOOK_SECRET = process.env.ODOO_WEBHOOK_SECRET;

function verifySecret(req, res, next) {
  const provided = req.headers['x-odoo-secret'];
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.post('/odoo/order', verifySecret, async (req, res) => {
  try {
    const { id, name } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'Payload must include id and name' });
    }

    const result = await pushOrder(req.body);

    if (!result.success) {
      return res.status(result.action === 'blocked' ? 409 : 400).json(result);
    }

    console.log(`[Odoo Webhook] ${result.action === 'created' ? 'Created' : 'Updated'} ${name} → local id ${result.order_id}`);
    return res.status(result.action === 'created' ? 201 : 200).json(result);
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/order error:', err);
    return res.status(500).json({ error: 'Failed to process webhook', details: err.message });
  }
});

/**
 * POST /api/webhooks/odoo/order-update
 *
 * Same as POST /odoo/order, but requires the order to already exist locally
 * (404 if not found) — kept for any Automated Action still configured to
 * call this endpoint specifically for edits to a confirmed order.
 */
router.post('/odoo/order-update', verifySecret, async (req, res) => {
  try {
    const { name: odoo_order_ref } = req.body;
    if (!odoo_order_ref) {
      return res.status(400).json({ error: 'Payload must include name (order reference)' });
    }

    const order = await prisma.orders.findFirst({ where: { odoo_order_ref } });
    if (!order) {
      return res.status(404).json({ error: `Order not found for ref: ${odoo_order_ref}` });
    }

    const result = await pushOrder(req.body);
    if (!result.success) {
      return res.status(result.action === 'blocked' ? 409 : 400).json(result);
    }

    console.log(`[Odoo order-update] ${odoo_order_ref} — lines: ${JSON.stringify(result.lines)}, addressChanged: ${result.address_changed}`);
    return res.json(result);
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/order-update error:', err);
    return res.status(500).json({ error: 'Failed to update order', details: err.message });
  }
});

/**
 * POST /api/webhooks/odoo/order-cancel
 *
 * Triggered by an Odoo Automated Action when a stock.picking (Delivery
 * Order) is cancelled — DO cancellation is the primary, correct trigger,
 * since CE Hub's odoo_order_ref always stores the DO reference (e.g.
 * "WH/OUT/00123"), never the Sales Order reference (e.g. "S00042").
 *
 * If a sale.order is cancelled and that cascades to multiple DOs, send
 * every affected DO's reference in `names` (one webhook call for the
 * whole batch) rather than the SO's own name — CE Hub cannot match on
 * an SO reference.
 *
 * Configure the webhook URL as: https://lab2.tbm2u.net/api/webhooks/odoo/order-cancel
 *
 * Single DO:  { "name": "WH/OUT/00123" }
 * SO cascade: { "names": ["WH/OUT/00123", "WH/OUT/00124"] }
 */
router.post('/odoo/order-cancel', verifySecret, async (req, res) => {
  try {
    const { name, names } = req.body;

    async function cancelOne(odoo_order_ref) {
      const order = await prisma.orders.findFirst({ where: { odoo_order_ref } });
      if (!order) {
        return { name: odoo_order_ref, success: false, error: 'Order not found' };
      }
      if (order.order_status === 'Delivered') {
        return { name: odoo_order_ref, success: false, error: 'Cannot cancel an order that is already delivered.' };
      }

      await prisma.orders.update({
        where: { id: order.id },
        data:  { order_status: 'Cancelled', updated_at: new Date() },
      });

      console.log(`[Odoo Webhook] Cancelled ${odoo_order_ref}`);
      return { name: odoo_order_ref, success: true };
    }

    // Batch mode — SO cancelled, cascading to every DO it generated
    if (Array.isArray(names)) {
      if (names.length === 0) {
        return res.status(400).json({ error: 'names must be a non-empty array of DO references' });
      }

      const results = [];
      for (const ref of names) {
        results.push(await cancelOne(ref));
      }

      const anySucceeded = results.some(r => r.success);
      return res.status(anySucceeded ? 200 : 404).json({ success: anySucceeded, results });
    }

    // Single mode — one DO cancelled directly (unchanged response contract)
    if (!name) {
      return res.status(400).json({ error: 'Payload must include name (DO reference) or names (array of DO references)' });
    }

    const result = await cancelOne(name);
    if (!result.success) {
      const statusCode = result.error === 'Order not found' ? 404 : 409;
      return res.status(statusCode).json({ error: result.error === 'Order not found' ? `Order not found for ref: ${name}` : result.error });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/order-cancel error:', err);
    return res.status(500).json({ error: 'Failed to cancel order(s)', details: err.message });
  }
});

module.exports = router;
