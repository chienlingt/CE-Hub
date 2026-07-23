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
 * @param {string} localStatus - e.g. 'Delivering', 'Delivered'
 */
async function pushDeliveryStatus(odooOrderId, localStatus) {
  const statusMap = {
    Delivering: 'in_transit',
    Delivered:  'delivered',
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

/**
 * Look up a sale.order by its name (e.g. "S00042") and write x_delivery_status.
 * Accepts local CE Hub status strings — maps them to Odoo values.
 * Safe to call from any route — returns null instead of throwing if Odoo is unreachable.
 *
 * @param {string} odooOrderRef - sale.order name, e.g. 'S00042'
 * @param {'Delivering'|'Delivered'|'Failed'} localStatus
 */
async function writeOdooDeliveryStatus(odooOrderRef, localStatus) {
  if (!process.env.ODOO_URL || !odooOrderRef) return null;

  const statusMap = {
    Delivering: 'in_transit',
    Delivered:  'delivered',
    Failed:     'failed',
  };

  const odooStatus = statusMap[localStatus];
  if (!odooStatus) return null;

  const odooOrders = await callModel('sale.order', 'search_read',
    [[['name', '=', odooOrderRef]]],
    { fields: ['id'], limit: 1 }
  );

  if (!odooOrders?.length) return null;

  return callModel('sale.order', 'write', [[odooOrders[0].id], { x_delivery_status: odooStatus }]);
}

/**
 * Find confirmed sale orders whose delivery commitment date falls on a given
 * calendar day (used by the 5PM "next day" fallback sync — A1.4).
 *
 * @param {string} dateStr - 'YYYY-MM-DD', the target delivery day
 * @returns {Promise<Array<{id:number, name:string}>>}
 */
async function getOrdersForDeliveryDate(dateStr) {
  const domain = [
    ['state', '=', 'sale'],
    ['commitment_date', '>=', `${dateStr} 00:00:00`],
    ['commitment_date', '<=', `${dateStr} 23:59:59`],
  ];
  return callModel('sale.order', 'search_read', [domain], { fields: ['id', 'name'], limit: 200 });
}

/**
 * Fully resolve one Odoo sale.order into the same shape as the webhook
 * payload (server/routes/webhooks.js POST /odoo/order) — partner/shipping
 * address expanded, order lines expanded with product name + serial.
 *
 * @param {number} odooId - Odoo sale.order integer id
 */
async function getOrderDetail(odooId) {
  const [order] = await callModel('sale.order', 'read', [[odooId]], {
    fields: ['id', 'name', 'partner_id', 'partner_shipping_id', 'order_line', 'commitment_date', 'note', 'user_id'],
  });
  if (!order) return null;

  const [partner]  = order.partner_id
    ? await callModel('res.partner', 'read', [[order.partner_id[0]]], { fields: ['name', 'email', 'phone'] })
    : [null];
  const [shipping] = order.partner_shipping_id
    ? await callModel('res.partner', 'read', [[order.partner_shipping_id[0]]], { fields: ['street', 'city', 'zip', 'state_id'] })
    : [null];
  const [salesperson] = order.user_id
    ? await callModel('res.users', 'read', [[order.user_id[0]]], { fields: ['name', 'partner_id'] })
    : [null];

  const lines = order.order_line?.length
    ? await callModel('sale.order.line', 'read', [order.order_line], { fields: ['product_id', 'product_uom_qty', 'lot_id'] })
    : [];

  return {
    id:                   order.id,
    name:                 order.name,
    partner_name:         partner?.name  || null,
    partner_email:        partner?.email || null,
    partner_phone:        partner?.phone || null,
    delivery_address:     shipping?.street            || null,
    delivery_city:        shipping?.city              || null,
    delivery_state_name:  shipping?.state_id?.[1]      || null,
    delivery_zip:         shipping?.zip               || null,
    delivery_remarks:     order.note                  || null,
    salesperson_name:     salesperson?.name            || null,
    salesperson_phone:    null, // resolved separately if needed — res.users has no direct phone field
    order_lines: lines.map(l => ({
      product_name:    l.product_id?.[1]    || null,
      product_uom_qty: l.product_uom_qty,
      serial_number:   l.lot_id?.[1]        || null,
    })),
  };
}

module.exports = {
  authenticate,
  callModel,
  pushDeliveryStatus,
  writeOdooDeliveryStatus,
  getConfirmedOrders,
  getOrdersForDeliveryDate,
  getOrderDetail,
};
