const express = require('express');
const router  = express.Router();
const { syncOrderPreparation } = require('../services/odooOrderIngestService');
const { requestAppointment, requestAppointmentChange, requestOrderCancellation } = require('../services/odooAppointmentService');

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

// POST /odoo/order: full DO snapshot with a mandatory appointment request.
async function handleOrderWebhook(req, res) {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Payload must be a JSON object' });
    }
    const { id, name } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'Payload must include id and name' });
    }

    if (!req.body.appointment || typeof req.body.appointment !== 'object' || Array.isArray(req.body.appointment)) {
      return res.status(400).json({ success: false, action: 'invalid', code: 'INVALID_APPOINTMENT', error: 'appointment is required and must be an object.' });
    }
    const result = await requestAppointment(req.body);

    if (!result.success) {
      return res.status(failureStatus(result)).json(result);
    }

    console.log(`[Odoo Webhook] ${result.action} ${name} → local id ${result.order_id}`);
    const status = result.action === 'previously_received' ? 200 : 202;
    return res.status(status).json(result);
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/order error:', err);
    return res.status(500).json({ error: 'Failed to process webhook', details: err.message });
  }
}

router.post('/odoo/order', verifySecret, handleOrderWebhook);

// POST /odoo/order-cancel: one approval-controlled DO soft cancellation.
// Body: { id: stock.picking.id, name: DO reference, request_ref, reason?, requested_by? }.
// 202 is a review receipt, NOT cancellation. No legacy {name}/{names} immediate/batch mode.
router.post('/odoo/order-cancel', verifySecret, async (req, res) => {
  try {
    const result = await requestOrderCancellation(req.body);
    if (!result.success) return res.status(failureStatus(result)).json(result);
    return res.status(result.action === 'pending_approval' ? 202 : 200).json(result);
  } catch (error) {
    console.error('[Odoo order cancellation]', error.message);
    return res.status(500).json({ error: 'Unable to request DO cancellation. Please retry.' });
  }
});

const failureStatus = result => (result.action === 'blocked' ? 409 : result.action === 'not_found' ? 404 : 400);

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
