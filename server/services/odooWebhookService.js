// server/services/odooWebhookService.js
//
// CE Hub → Odoo status callbacks over HTTP webhook (alternative transport to
// the RPC field writes in odooService.js).
//
// SCOPE: Loaded and Arrived only. Every other status (Scheduled, Delivering,
// Delivered, Failed) always goes through RPC regardless of this flag.
//
// DISABLED BY DEFAULT. Set ODOO_USE_WEBHOOK=true only once GCA has deployed an
// Odoo HTTP controller at ODOO_WEBHOOK_URL that can receive this payload —
// Odoo has no such endpoint out of the box. Turning this on before the
// receiver exists means every Loaded/Arrived call 404s, burns its 8 outbox
// retries, and lands in the dead-letter queue.
//
// Sends exactly what odooPayloadBuilder.buildOdooEventPayload() already
// assembled at enqueue time (the same object the RPC path reads field-by-field
// from) — one payload shape, two transports, no duplicate payload logic.

const axios = require('axios');

// Statuses this transport is allowed to handle. Anything else must use RPC.
const WEBHOOK_STATUSES = ['Loaded', 'Arrived'];

/**
 * True when the webhook transport should handle this status.
 * Requires both the feature flag and a configured destination URL — a flag
 * set without a URL falls back to RPC rather than failing.
 */
function shouldUseWebhook(status) {
  return (
    process.env.ODOO_USE_WEBHOOK === 'true' &&
    !!process.env.ODOO_WEBHOOK_URL &&
    WEBHOOK_STATUSES.includes(status)
  );
}

/**
 * POST a Loaded or Arrived status callback to Odoo.
 *
 * @param {object} payload - the object from odooPayloadBuilder.buildOdooEventPayload()
 * @throws on missing do_ref or any non-2xx response — the outbox worker
 *         catches this and schedules a retry, same as an RPC failure would.
 */
async function sendOdooStatusWebhook(payload) {
  if (!payload?.do_ref) {
    throw new Error('Payload missing do_ref — cannot address the DO in Odoo');
  }
  if (!WEBHOOK_STATUSES.includes(payload.status)) {
    throw new Error(`sendOdooStatusWebhook called with unsupported status: ${payload.status}`);
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ODOO_OUTBOUND_WEBHOOK_SECRET) {
    headers['x-cehub-secret'] = process.env.ODOO_OUTBOUND_WEBHOOK_SECRET;
  }

  const res = await axios.post(process.env.ODOO_WEBHOOK_URL, payload, {
    headers,
    timeout: 15000,
    // Treat every non-2xx as a throw so the outbox retries it.
    validateStatus: s => s >= 200 && s < 300,
  });

  console.log(`[OdooWebhook] ${payload.status} sent for ${payload.do_ref} (${payload.order_lines?.length ?? 0} line(s)) → HTTP ${res.status}`);
  return res.data;
}

module.exports = {
  sendOdooStatusWebhook,
  shouldUseWebhook,
  WEBHOOK_STATUSES,
};
