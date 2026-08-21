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
 * Push delivery status back to Odoo by stock.picking integer id.
 * Field name x_delivery_status — confirm with Odoo team once custom field is added.
 *
 * @param {number} odooPickingId - stock.picking integer id (from push payload `id`)
 * @param {string} localStatus   - CE Hub status string
 */
// Shared CE Hub → Odoo x_delivery_status mapping.
// Picked and Completed have no Odoo counterpart — they return null (no-op).
const CE_HUB_STATUS_MAP = {
  Loaded:     'loaded',
  Unloaded:   'unloaded',
  Delivering: 'in_transit',
  Delivered:  'delivered',
  Failed:     'failed',
};

async function pushDeliveryStatus(odooPickingId, localStatus) {
  const odooStatus = CE_HUB_STATUS_MAP[localStatus];
  if (!odooStatus) return null;

  return callModel('stock.picking', 'write', [[odooPickingId], { x_delivery_status: odooStatus }]);
}

/**
 * Look up a stock.picking by its DO name (e.g. "002/DOO-002909") and write
 * x_delivery_status. Called automatically on every CE Hub status change.
 * Returns null (non-fatal) if Odoo is unreachable or the picking is not found.
 *
 * @param {string} odooOrderRef  - DO number stored in orders.odoo_order_ref
 * @param {string} localStatus   - CE Hub status (Loaded|Arrived|Delivering|Delivered|Failed); Picked and Completed are no-ops
 */
async function writeOdooDeliveryStatus(odooOrderRef, localStatus) {
  if (!process.env.ODOO_URL || !odooOrderRef) return null;

  const odooStatus = CE_HUB_STATUS_MAP[localStatus];
  if (!odooStatus) return null;

  const pickings = await callModel('stock.picking', 'search_read',
    [[['name', '=', odooOrderRef]]],
    { fields: ['id'], limit: 1 }
  );

  if (!pickings?.length) return null;

  return callModel('stock.picking', 'write', [[pickings[0].id], { x_delivery_status: odooStatus }]);
}

/**
 * Find outgoing delivery orders (stock.picking) whose scheduled_date falls on
 * a given MYT calendar day — used by the 5PM fallback sync (A1.4).
 * Odoo stores scheduled_date in UTC; MYT is UTC+8.
 *
 * @param {string} dateStr - 'YYYY-MM-DD' in MYT
 * @returns {Promise<Array<{id:number, name:string, sale_id:any}>>}
 */
async function getOrdersForDeliveryDate(dateStr) {
  // Convert MYT day boundaries to UTC for the Odoo filter
  const utcStart = new Date(`${dateStr}T00:00:00+08:00`).toISOString().replace('T', ' ').slice(0, 19);
  const utcEnd   = new Date(`${dateStr}T23:59:59+08:00`).toISOString().replace('T', ' ').slice(0, 19);

  const domain = [
    ['picking_type_code', '=', 'outgoing'],
    ['state', 'in', ['assigned', 'confirmed', 'waiting']],
    ['scheduled_date', '>=', utcStart],
    ['scheduled_date', '<=', utcEnd],
  ];
  return callModel('stock.picking', 'search_read', [domain], {
    fields: ['id', 'name', 'sale_id'],
    limit: 200,
  });
}

/**
 * Fully resolve one stock.picking into the same shape as the Odoo → CE Hub
 * webhook payload — customer, address, salesperson, order lines, serials.
 * Used by the 5PM fallback sync to import orders never pushed by Odoo.
 *
 * @param {number} odooPickingId - stock.picking integer id
 */
async function getOrderDetail(odooPickingId) {
  // 1. Read stock.picking
  const [picking] = await callModel('stock.picking', 'read', [[odooPickingId]], {
    fields: ['id', 'name', 'sale_id', 'partner_id', 'scheduled_date', 'move_ids'],
  });
  if (!picking) return null;

  // 2. Read sale.order for SO name, salesperson, delivery remarks
  const [saleOrder] = picking.sale_id
    ? await callModel('sale.order', 'read', [[picking.sale_id[0]]], {
        fields: ['name', 'user_id', 'note'],
      })
    : [null];

  // 3. Resolve salesperson partner id (res.users → partner_id → res.partner.phone)
  const [spUser] = saleOrder?.user_id
    ? await callModel('res.users', 'read', [[saleOrder.user_id[0]]], { fields: ['partner_id'] })
    : [null];
  const salespersonPartnerId = spUser?.partner_id?.[0] || null;

  // 4. Batch read customer + salesperson res.partner in one call
  const partnerIds = [picking.partner_id?.[0], salespersonPartnerId].filter(Boolean);
  const partners = partnerIds.length
    ? await callModel('res.partner', 'read', [partnerIds], {
        fields: ['id', 'name', 'phone', 'mobile', 'email', 'street', 'city', 'zip', 'state_id'],
      })
    : [];

  const customerPartner    = partners.find(p => p.id === picking.partner_id?.[0]) || null;
  const salespersonPartner = salespersonPartnerId
    ? partners.find(p => p.id === salespersonPartnerId)
    : null;

  // 5. Read stock.move for order lines — sale_line_id gives odoo_line_id directly
  const moves = picking.move_ids?.length
    ? await callModel('stock.move', 'read', [picking.move_ids], {
        fields: ['id', 'product_id', 'product_uom_qty', 'sale_line_id'],
      })
    : [];

  // 6. Read stock.move.line for serial numbers (lot_id may be false for non-serialized items)
  const moveLines = picking.move_ids?.length
    ? await callModel('stock.move.line', 'search_read',
        [[['picking_id', '=', odooPickingId]]],
        { fields: ['move_id', 'lot_id'] }
      ).catch(() => [])
    : [];

  const serialByMove = {};
  for (const ml of moveLines) {
    const mid = ml.move_id?.[0];
    if (mid && ml.lot_id && !serialByMove[mid]) {
      serialByMove[mid] = ml.lot_id[1] || null;
    }
  }

  // Strip HTML tags from sale.order note field
  const stripHtml = html => (html ? html.replace(/<[^>]*>/g, '').trim() : null);

  // Strip " (MY)" country suffix from state name e.g. "Selangor (MY)" → "Selangor"
  const stateName = customerPartner?.state_id?.[1]?.replace(/\s*\(MY\)\s*$/, '') || null;

  return {
    id:                      picking.id,
    name:                    picking.name,
    sales_order_name:        saleOrder?.name                                          || null,
    preferred_delivery_time: picking.scheduled_date                                   || null,
    partner_name:            customerPartner?.name                                    || null,
    partner_email:           customerPartner?.email   || null,
    partner_phone:           customerPartner?.phone   || customerPartner?.mobile      || null,
    delivery_address:        customerPartner?.street                                  || null,
    delivery_city:           customerPartner?.city                                    || null,
    delivery_state_name:     stateName,
    delivery_zip:            customerPartner?.zip                                     || null,
    delivery_remarks:        stripHtml(saleOrder?.note),
    salesperson_name:        saleOrder?.user_id?.[1]                                  || null,
    salesperson_phone:       salespersonPartner?.phone || salespersonPartner?.mobile  || null,
    order_lines: moves.map(m => ({
      order_line_id:   m.sale_line_id?.[0] || null,
      product_name:    m.product_id?.[1]   || null,
      product_uom_qty: m.product_uom_qty,
      serial_number:   serialByMove[m.id]  || null,
    })),
  };
}

/**
 * Write the richer, still-unconfirmed fields (scheduled/delivered time, failure
 * reason, driver/assistant name) back to the Odoo Delivery Order, on top of the
 * one confirmed field `writeOdooDeliveryStatus` already writes.
 *
 * Every x_ field name below is a PLACEHOLDER pending GCA confirmation. Gated behind
 * ODOO_SEND_EXTENDED_FIELDS so it never fires unless explicitly enabled, and
 * never throws — a wrong/unconfirmed field name must not break the working
 * x_delivery_status sync that runs alongside it.
 *
 * @param {string} odooOrderRef - DO number (orders.odoo_order_ref)
 * @param {object} payload      - the object from odooPayloadBuilder.buildOdooEventPayload()
 */
async function writeOdooExtendedFields(odooOrderRef, payload) {
  if (!process.env.ODOO_URL || !odooOrderRef) return null;
  if (process.env.ODOO_SEND_EXTENDED_FIELDS !== 'true') return null;

  const pickings = await callModel('stock.picking', 'search_read',
    [[['name', '=', odooOrderRef]]],
    { fields: ['id'], limit: 1 }
  ).catch(() => null);
  if (!pickings?.length) return null;

  // TODO: every x_ field name below is a placeholder pending GCA confirmation.
  return callModel('stock.picking', 'write', [[pickings[0].id], {
    x_scheduled_date_start: payload?.scheduled_start || false,
    x_scheduled_date_end:   payload?.scheduled_end   || false,
    x_delivered_time:       payload?.delivered_time  || false,
    x_failure_reason:       payload?.failure_reason  || false,
    x_driver_name:          payload?.driver_name     || false,
    x_assistant_name:       payload?.assistant_name  || false,
  }]).catch(err => {
    console.error(`[Odoo] writeOdooExtendedFields failed for ${odooOrderRef} (non-fatal, extended fields unconfirmed):`, err.message);
    return null;
  });
}

module.exports = {
  authenticate,
  callModel,
  pushDeliveryStatus,
  writeOdooDeliveryStatus,
  writeOdooExtendedFields,
  getOrdersForDeliveryDate,
  getOrderDetail,
};
