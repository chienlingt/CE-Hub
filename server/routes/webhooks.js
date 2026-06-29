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

/**
 * POST /api/webhooks/odoo/order
 *
 * Triggered by the Odoo "Push to CE Hub" button (single order) or an
 * Automated Action on sale.order confirmation. Create-or-update — if the
 * order doesn't exist locally it's created; if it exists and isn't already
 * in motion (Scheduled/Delivering/Delivered/Completed/Cancelled), it's
 * updated, including a protected merge of order lines (see
 * odooOrderIngestService.mergeOrderLines).
 *
 * Configure the Odoo button/Automated Action → Send Webhook with:
 *   URL:    https://lab2.tbm2u.net/api/webhooks/odoo/order
 *   Header: X-Odoo-Secret: <your ODOO_WEBHOOK_SECRET>
 *   Body (JSON template):
 *   {
 *     "id":                  {{ object.id }},
 *     "name":                "{{ object.name }}",
 *     "partner_name":        "{{ object.partner_id.name }}",
 *     "partner_email":       "{{ object.partner_id.email }}",
 *     "partner_phone":       "{{ object.partner_id.phone }}",
 *     "delivery_address":    "{{ object.partner_shipping_id.street }}",
 *     "delivery_city":       "{{ object.partner_shipping_id.city }}",
 *     "delivery_state_name": "{{ object.partner_shipping_id.state_id.name }}",
 *     "delivery_zip":        "{{ object.partner_shipping_id.zip }}",
 *     "delivery_remarks":    "{{ object.note }}",
 *     "salesperson_name":    "{{ object.user_id.name }}",
 *     "salesperson_phone":   "{{ object.user_id.partner_id.phone }}",
 *     "order_lines": [
 *       {% for line in object.order_line %}
 *       { "product_name": "{{ line.product_id.name }}", "product_uom_qty": {{ line.product_uom_qty }}, "serial_number": "{{ line.lot_id.name }}" }
 *       {% endfor %}
 *     ]
 *   }
 */
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
 * POST /api/webhooks/odoo/orders/bulk
 *
 * Triggered by the Odoo "Push All" / "Push Selected" button — accepts
 * multiple orders in one request and create-or-updates each independently.
 * One order failing does not abort the rest of the batch.
 *
 * Body: { "orders": [ { ...same shape as POST /odoo/order... }, ... ] }
 */
router.post('/odoo/orders/bulk', verifySecret, async (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'Payload must include a non-empty "orders" array' });
    }

    const results = [];
    for (const order of orders) {
      try {
        const result = await pushOrder(order);
        results.push({ name: order?.name, ...result });
      } catch (err) {
        results.push({ name: order?.name, success: false, error: err.message });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    console.log(`[Odoo Webhook] Bulk push — ${succeeded}/${orders.length} succeeded`);
    return res.json({ success: true, total: orders.length, succeeded, failed: orders.length - succeeded, results });
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/orders/bulk error:', err);
    return res.status(500).json({ error: 'Failed to process bulk push', details: err.message });
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
 * Triggered by an Odoo Automated Action when a sale.order is cancelled.
 * Configure the webhook URL as: https://lab2.tbm2u.net/api/webhooks/odoo/order-cancel
 *
 * Expected payload: { "name": "S00042" }
 */
router.post('/odoo/order-cancel', verifySecret, async (req, res) => {
  try {
    const { name: odoo_order_ref } = req.body;

    if (!odoo_order_ref) {
      return res.status(400).json({ error: 'Payload must include name (order reference)' });
    }

    const order = await prisma.orders.findFirst({ where: { odoo_order_ref } });
    if (!order) {
      return res.status(404).json({ error: `Order not found for ref: ${odoo_order_ref}` });
    }

    if (['Delivered', 'Completed'].includes(order.order_status)) {
      return res.status(409).json({
        error: 'Cannot cancel an order that is already delivered or completed',
      });
    }

    await prisma.orders.update({
      where: { id: order.id },
      data:  { order_status: 'Cancelled', updated_at: new Date() },
    });

    console.log(`[Odoo Webhook] Cancelled ${odoo_order_ref}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/order-cancel error:', err);
    return res.status(500).json({ error: 'Failed to cancel order', details: err.message });
  }
});

module.exports = router;
