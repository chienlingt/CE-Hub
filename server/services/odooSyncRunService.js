const { randomUUID } = require('crypto');
const prisma = require('../prismaClient');
function classifyFailure(error) {
  const code = error?.code || 'ODOO_DATA_ERROR';
  const retryable = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2034', 'ODOO_TEMPORARY'].includes(code)
    || [408, 429, 500, 502, 503, 504].includes(error?.response?.status);
  // Never persist raw transport errors: axios/RPC errors can contain secrets.
  const message = retryable ? 'Temporary connection/service/database failure.'
    : error?.status || code === 'FALLBACK_POLICY_NOT_CONFIGURED' ? error.message : 'Invalid Odoo data, mapping or access configuration. Check the DO and integration settings.';
  return { code, message, retryable };
}
async function recordWebhook(req, body, httpStatus, startedAt) {
  const entries = Array.isArray(body?.results) ? body.results : [{ name: req.body?.name, ...body }];
  const failures = entries.filter(e => e.success === false || (httpStatus >= 400 && e.success !== true));
  const unchanged = ['unchanged', 'previously_reviewed', 'skipped'].includes(body?.action);
  return prisma.odoo_sync_runs.create({ data: {
    run_key: `webhook:${randomUUID()}`, source: 'odoo_webhook', target_date: null,
    status: httpStatus === 202 ? 'pending_approval' : httpStatus >= 500 ? 'sender_retry_required' : failures.length || httpStatus >= 400 ? 'needs_correction' : 'completed', attempts: 1,
    report: { mechanism: 'Odoo webhook', endpoint: req.path, http_status: httpStatus, started_at: startedAt,
      action: body?.action || null, request_id: body?.request_id || null,
      target_date_note: 'Webhook receipt time is not a confirmed appointment date.',
      counts: { candidates: entries.length, synced: httpStatus < 400 && httpStatus !== 202 && !unchanged ? entries.length - failures.length : 0, skipped: unchanged ? entries.length : 0, pending: httpStatus === 202 ? 1 : 0, failed: failures.length },
      outcomes: entries.map(e => ({ do_ref: e.name || req.body?.name || null, outcome: httpStatus === 202 ? 'pending_approval' : e.success === false || httpStatus >= 400 ? 'failed' : body?.action || 'accepted', code: e.code || null, reason: e.error ? httpStatus < 500 ? String(e.error).slice(0, 2000) : 'Temporary/unexpected failure. Odoo must resend; inspect server logs.' : null })),
      retry_note: 'Odoo owns webhook resend; CE Hub does not replay webhook payloads.' },
  } });
}
module.exports = { classifyFailure, recordWebhook };
