// server/services/odooCallbackTransport.js
//
// HTTP transport for CE Hub -> Odoo callbacks (ODOO_CALLBACK_TRANSPORT=http).
// POSTs one envelope (odooCallbackEnvelope.js) to the single GCA receiver.
//
//   URL     ODOO_CALLBACK_URL
//   Auth    header x-cehub-secret: ODOO_CALLBACK_SECRET (mirrors inbound x-odoo-secret)
//   Result  2xx -> done; 409 -> duplicate or older event, also done;
//           any other 4xx -> PermanentCallbackError (row goes dead, no retry);
//           5xx, timeout or network error -> retried with the outbox backoff.

const axios = require('axios');

const TIMEOUT_MS = 15000;

class PermanentCallbackError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'PermanentCallbackError';
    this.permanent = true;
    this.status = status;
  }
}

function callbackTransport() {
  return process.env.ODOO_CALLBACK_TRANSPORT === 'http' ? 'http' : 'rpc';
}

/**
 * @param {object} envelope
 * @returns {Promise<{ status: number, duplicate: boolean, body: any }>}
 */
async function sendCallback(envelope, { http = axios } = {}) {
  const url = process.env.ODOO_CALLBACK_URL;
  if (!url) throw new Error('ODOO_CALLBACK_TRANSPORT=http but ODOO_CALLBACK_URL is not set.');
  if (!envelope?.event_id || !envelope?.do_ref) throw new PermanentCallbackError('Callback envelope lacks event_id or do_ref.');

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ODOO_CALLBACK_SECRET) headers['x-cehub-secret'] = process.env.ODOO_CALLBACK_SECRET;

  let res;
  try {
    res = await http.post(url, envelope, { headers, timeout: TIMEOUT_MS, validateStatus: () => true, maxBodyLength: Infinity });
  } catch (error) {
    throw new Error(`Odoo callback not delivered (${error.code || error.message}); will retry.`);
  }
  if (res.status >= 200 && res.status < 300) return { status: res.status, duplicate: false, body: res.data };
  if (res.status === 409) return { status: 409, duplicate: true, body: res.data };
  const detail = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
  if (res.status >= 400 && res.status < 500) {
    throw new PermanentCallbackError(`Odoo rejected ${envelope.event_type} with HTTP ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }
  throw new Error(`Odoo callback receiver returned HTTP ${res.status}; will retry.`);
}

module.exports = { sendCallback, callbackTransport, PermanentCallbackError };
