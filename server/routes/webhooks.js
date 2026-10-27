const express = require('express');
const router  = express.Router();
const prisma  = require('../prismaClient');
const { pushOrder, syncOrderPreparation } = require('../services/odooOrderIngestService');
const { requestAppointment, requestAppointmentChange } = require('../services/odooAppointmentService');

const WEBHOOK_SECRET = process.env.ODOO_WEBHOOK_SECRET;
const { recordWebhook } = require('../services/odooSyncRunService');
router.use((req, res, next) => {
  if (req.method === 'POST' && WEBHOOK_SECRET && req.headers['x-odoo-secret'] === WEBHOOK_SECRET) {
    const send = res.json.bind(res), started = new Date().toISOString();
    res.json = body => {
      recordWebhook(req, body, res.statusCode, started).catch(() => console.error('[OdooSync] Webhook audit could not be saved.'));
      return send(body);
    };
  }
  next();
});

// Import/update/readiness payloads require order_line_model: 'stock.move'.
// Each order_lines[].order_line_id is a stock.move.id from this DO, not an SO
// line or individual stock.move.line serial record. Cancellation has no lines.

function verifySecret(req, res, next) {
  const provided = req.headers['x-odoo-secret'];
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.post('/odoo/order-readiness', verifySecret, async (req, res) => {
  try {
    const result = await syncOrderPreparation(req.body);
    return res.status(result.success ? (result.action === 'pending_approval' ? 202 : 200) : result.action === 'blocked' ? 409 : 400).json(result);
  } catch (error) {
    console.error('[Odoo readiness]', error.message);
    return res.status(500).json({ error: 'Unable to synchronize DOO preparation. Please retry.' });
  }
});

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

    console.log(`[Odoo Webhook] ${result.action} ${name} → local id ${result.order_id}`);
    return res.status(result.action === 'pending_approval' ? 202 : result.action === 'created' ? 201 : 200).json(result);
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
    return res.status(result.action === 'pending_approval' ? 202 : 200).json(result);
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

const failureStatus = result => (result.action === 'blocked' ? 409 : result.action === 'not_found' ? 404 : 400);

/**
 * POST /api/webhooks/odoo/appointment-confirm
 *
 * FRD INT-03 Confirm Appointment from the DOO (and INT-05 retry). Body is the
 * same DO snapshot as /odoo/order plus an `appointment` block:
 *   { request_ref, requested_date: 'YYYY-MM-DD', requested_session: morning|afternoon|evening,
 *     requirements?: {...}, delivery_document?: 'SIN' }
 * 202 = request stored, confirmation pending CE Hub admin approval. The result is
 * written back to Odoo later (APPOINTMENT_CONFIRMATION outbox event).
 * 200 = same request_ref already received (retry); nothing re-applied.
 */
router.post('/odoo/appointment-confirm', verifySecret, async (req, res) => {
  try {
    const result = await requestAppointment(req.body);
    if (!result.success) return res.status(failureStatus(result)).json(result);
    console.log(`[Odoo appointment] ${result.action} ${req.body.name} (${result.request_ref})`);
    return res.status(result.action === 'previously_received' ? 200 : 202).json(result);
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/appointment-confirm error:', err);
    return res.status(500).json({ error: 'Unable to process the appointment request. Please retry.' });
  }
});

/**
 * POST /api/webhooks/odoo/appointment-change
 *
 * FRD INT-11 Request Edit / Cancel Appointment:
 *   { id, name, request_ref, action: 'edit'|'cancel', reason?, requested_by? }
 * 202 = stored for CE Hub admin approval; the current appointment is unchanged
 * until then. The decision is written back to Odoo (APPOINTMENT_CHANGE_DECISION).
 */
router.post('/odoo/appointment-change', verifySecret, async (req, res) => {
  try {
    const result = await requestAppointmentChange(req.body);
    if (!result.success) return res.status(failureStatus(result)).json(result);
    console.log(`[Odoo appointment] ${req.body.action} request ${result.action} for ${req.body.name}`);
    return res.status(result.action === 'pending_approval' ? 202 : 200).json(result);
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/appointment-change error:', err);
    return res.status(500).json({ error: 'Unable to process the appointment change request. Please retry.' });
  }
});

module.exports = router;
