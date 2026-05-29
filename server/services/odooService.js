const axios = require('axios');

const ODOO_URL      = process.env.ODOO_URL;
const ODOO_DB       = process.env.ODOO_DB;
const ODOO_USER     = process.env.ODOO_USER;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

// Cached session — reset on expiry (Odoo error code 100)
let _session = null; // { uid, sessionId }

async function authenticate() {
  const res = await axios.post(`${ODOO_URL}/web/session/authenticate`, {
    jsonrpc: '2.0',
    method:  'call',
    id:      1,
    params:  { db: ODOO_DB, login: ODOO_USER, password: ODOO_PASSWORD },
  });

  const uid = res.data?.result?.uid;
  if (!uid) throw new Error(`Odoo auth failed: ${JSON.stringify(res.data?.error)}`);

  const cookieHeader = res.headers['set-cookie'] ?? [];
  const sessionId = cookieHeader.join(';').match(/session_id=([^;]+)/)?.[1];

  _session = { uid, sessionId };
  return _session;
}

async function getSession() {
  if (_session) return _session;
  return authenticate();
}

async function _rpc(sessionId, model, method, args, kwargs) {
  return axios.post(
    `${ODOO_URL}/web/dataset/call_kw`,
    { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } },
    { headers: sessionId ? { Cookie: `session_id=${sessionId}` } : {} }
  );
}

async function callModel(model, method, args = [], kwargs = {}) {
  const session = await getSession();

  let res = await _rpc(session.sessionId, model, method, args, kwargs);

  // Session expired — re-authenticate once and retry
  if (res.data?.error?.code === 100) {
    _session = null;
    const fresh = await authenticate();
    res = await _rpc(fresh.sessionId, model, method, args, kwargs);
  }

  if (res.data?.error) {
    throw new Error(`Odoo RPC error: ${JSON.stringify(res.data.error)}`);
  }

  return res.data?.result;
}

/**
 * Push delivery status back to Odoo.
 * Writes the custom field x_delivery_status on sale.order.
 * Adjust the field name to match your Odoo configuration.
 *
 * @param {number} odooOrderId - Odoo sale.order integer id
 * @param {string} localStatus - e.g. 'Delivering', 'Delivered', 'Completed'
 */
async function pushDeliveryStatus(odooOrderId, localStatus) {
  const statusMap = {
    Delivering: 'in_transit',
    Delivered:  'delivered',
    Completed:  'completed',
  };

  const odooStatus = statusMap[localStatus];
  if (!odooStatus) return null;

  return callModel('sale.order', 'write', [[odooOrderId], { x_delivery_status: odooStatus }]);
}

/**
 * Fetch confirmed sale orders from Odoo (state = 'sale').
 * Optionally filter by write_date to only get recently changed orders.
 *
 * @param {Date|null} sinceDate
 */
async function getConfirmedOrders(sinceDate = null) {
  const domain = [['state', '=', 'sale']];
  if (sinceDate) domain.push(['write_date', '>', sinceDate.toISOString()]);

  return callModel('sale.order', 'search_read', [domain], {
    fields: [
      'id', 'name', 'partner_id', 'partner_shipping_id',
      'order_line', 'amount_total', 'state', 'commitment_date', 'write_date',
    ],
    limit: 100,
  });
}

module.exports = { authenticate, callModel, pushDeliveryStatus, getConfirmedOrders };
