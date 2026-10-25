const axios = require('axios');
const { loadFallbackPolicy, fallbackDomain } = require('./odooFallbackPolicy');
const { ODOO_LINE_MODEL, assertOutboundLineIdentity } = require('./odooLineIdentity');

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
  }, { timeout: 15000 });

  const uid = res.data?.result?.uid;
  if (!uid) throw Object.assign(new Error('Odoo authentication failed. Check credentials and access.'), { code: 'ODOO_AUTH_FAILED' });

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
    { headers: sessionId ? { Cookie: `session_id=${sessionId}` } : {}, timeout: 15000 }
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
    const temporary = /SerializationFailure|DeadlockDetected|LockNotAvailable/.test(res.data.error?.data?.name || '');
    throw Object.assign(new Error('Odoo RPC failed. Check field mapping and access permissions.'), { code: temporary ? 'ODOO_TEMPORARY' : 'ODOO_RPC_REJECTED' });
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
// Completed has no Odoo counterpart — it returns null (no-op).
const CE_HUB_STATUS_MAP = {
  Picked:     'picked',
  Loaded:     'loaded',
  Unloaded:   'unloaded',
  Delivering: 'in_transit',
  Arrived:    'arrived',
  Delivered:  'delivered',
  Failed:     'failed',
};

// A delayed/retried Picked or Arrived event must not roll back a later state.
// Explicit post-failure corrections/re-attempts require a separate agreed flow.
function canAdvanceDeliveryStatus(current, next) {
  if (current === next) return false;
  if (['delivered', 'failed'].includes(current)) return false;
  const rank = { picked: 1, loaded: 2, in_transit: 3, arrived: 4, unloaded: 4, delivered: 5, failed: 5 };
  return rank[current] == null || rank[next] >= rank[current];
}

async function pushDeliveryStatus(odooPickingId, localStatus) {
  const odooStatus = CE_HUB_STATUS_MAP[localStatus];
  if (!odooStatus) return null;

  const [picking] = await callModel('stock.picking', 'read', [[odooPickingId]], { fields: ['id', 'x_delivery_status'] });
  if (!picking) throw new Error('Odoo Delivery Order was not found.');
  if (!canAdvanceDeliveryStatus(picking.x_delivery_status, odooStatus)) return picking.x_delivery_status === odooStatus ? null : { status_ignored: true };

  return callModel('stock.picking', 'write', [[odooPickingId], { x_delivery_status: odooStatus }]);
}

/**
 * Look up a stock.picking by its DO name (e.g. "002/DOO-002909") and write
 * x_delivery_status. Called automatically on every CE Hub status change.
 * Returns null (non-fatal) if Odoo is unreachable or the picking is not found.
 *
 * @param {string} odooOrderRef  - DO number stored in orders.odoo_order_ref
 * @param {string} localStatus   - CE Hub status (Picked|Loaded|Arrived|Delivering|Delivered|Failed); Completed is a no-op
 */
async function writeOdooDeliveryStatus(odooOrderRef, localStatus) {
  if (!process.env.ODOO_URL || !odooOrderRef) return null;

  const odooStatus = CE_HUB_STATUS_MAP[localStatus];
  if (!odooStatus) return null;

  const pickings = await callModel('stock.picking', 'search_read',
    [[['name', '=', odooOrderRef]]],
    { fields: ['id', 'x_delivery_status'], limit: 1 }
  );

  if (!pickings?.length) return null;
  if (!canAdvanceDeliveryStatus(pickings[0].x_delivery_status, odooStatus)) return pickings[0].x_delivery_status === odooStatus ? null : { status_ignored: true };

  return callModel('stock.picking', 'write', [[pickings[0].id], { x_delivery_status: odooStatus }]);
}

// Driver confirmation is the user trigger. Odoo owns customer WhatsApp via
// its automation on x_delivery_status -> failed; CE Hub does not send it.
// One atomic write includes any GCA-confirmed failure context fields BEFORE
// Odoo evaluates its automation. No guessed custom RPC method is called.
async function triggerOdooFailureNotification(payload) {
  if (!process.env.ODOO_URL) throw new Error('Odoo is not configured; failure notification handoff remains pending.');
  const reference = payload?.do_ref || payload?.odooRef;
  if (!reference) throw new Error('Missing DO reference for Odoo failure notification.');
  const pickings = await callModel('stock.picking', 'search_read', [[['name', '=', reference]]], { fields: ['id', 'x_delivery_status'], limit: 1 });
  if (!pickings?.length) throw new Error('Odoo Delivery Order not found; failure notification handoff remains pending.');
  const picking = pickings[0];
  if (picking.x_delivery_status === 'delivered') throw new Error('Cannot trigger a failure notification for an Odoo delivery already marked delivered.');
  // A timeout may happen after Odoo committed the first write. Do not rewrite
  // failed on retry and retrigger an on-update WhatsApp automation.
  if (picking.x_delivery_status === 'failed') return { already_failed: true, notification_owner: 'odoo' };
  const fields = { x_delivery_status: 'failed' };
  for (const [setting, value] of [
    ['ODOO_FAILURE_REASON_FIELD', payload.failure_reason],
    ['ODOO_FAILURE_NOTES_FIELD', payload.remarks],
    ['ODOO_FAILURE_EVENT_REFERENCE_FIELD', payload.failure_event_id],
  ]) {
    const field = process.env[setting];
    if (!field) continue;
    if (!/^x_[A-Za-z0-9_]+$/.test(field) || field === 'x_delivery_status') throw new Error(`Invalid configured failure field: ${setting}`);
    fields[field] = value || false;
  }
  const accepted = await callModel('stock.picking', 'write', [[picking.id], fields]);
  if (accepted !== true) throw new Error('Odoo did not acknowledge the failure notification trigger.');
  return { triggered: true, notification_owner: 'odoo' };
}

/**
 * Stream every missing-DOO candidate using the GCA-approved date and active
 * appointment rule. Datetime boundaries are the requested MYT calendar day.
 *
 * @param {string} dateStr - 'YYYY-MM-DD' in MYT
 * @returns {Promise<Array<{id:number, name:string, sale_id:any}>>}
 */
async function* iterateOrdersForDeliveryDate(dateStr, policy = loadFallbackPolicy()) {
  const domain = fallbackDomain(dateStr, policy);
  // A stable upper bound plus keyset pagination avoids offset skips when records
  // become ineligible while this run is processing them.
  const latest = await callModel('stock.picking', 'search_read', [domain], { fields: ['id'], limit: 1, order: 'id desc' });
  if (!Array.isArray(latest)) throw new Error('Invalid Odoo fallback discovery response.');
  if (!latest.length) return;
  const ceiling = latest[0].id;
  if (!Number.isInteger(ceiling) || ceiling <= 0) throw new Error('Invalid Odoo fallback upper bound.');
  let cursor = 0;
  while (cursor < ceiling) {
    const page = await callModel('stock.picking', 'search_read', [[...domain, ['id', '>', cursor], ['id', '<=', ceiling]]], {
      fields: ['id', 'name', 'sale_id'], limit: policy.pageSize, order: 'id asc',
    });
    if (!Array.isArray(page)) throw new Error('Invalid Odoo fallback page.');
    if (!page.length) return;
    for (const order of page) {
      if (!Number.isInteger(order.id) || order.id <= cursor || order.id > ceiling) throw new Error('Odoo fallback pagination did not advance safely.');
      cursor = order.id;
      yield order;
    }
  }
}

async function getOrdersForDeliveryDate(dateStr) {
  const orders = [];
  for await (const order of iterateOrdersForDeliveryDate(dateStr)) orders.push(order);
  return orders;
}

async function isOrderEligibleForDeliveryDate(id, dateStr, policy = loadFallbackPolicy()) {
  const records = await callModel('stock.picking', 'search_read', [[...fallbackDomain(dateStr, policy), ['id', '=', id]]], { fields: ['id', 'name'], limit: 1 });
  if (!Array.isArray(records)) throw new Error('Invalid Odoo eligibility response.');
  return records.some(record => record.id === id);
}

/**
 * Fully resolve one stock.picking into the same shape as the Odoo → CE Hub
 * webhook payload — customer, address, salesperson, order lines, serials.
 * Used by the 5PM fallback sync to import orders never pushed by Odoo.
 *
 * @param {number} odooPickingId - stock.picking integer id
 */
async function getOrderDetail(odooPickingId) {
  const readyField = process.env.ODOO_READY_FIELD;
  const preparedField = process.env.ODOO_PREPARED_QUANTITY_FIELD;
  // 1. Read stock.picking
  const [picking] = await callModel('stock.picking', 'read', [[odooPickingId]], {
    fields: ['id', 'name', 'sale_id', 'partner_id', 'scheduled_date', 'move_ids', ...(readyField ? [readyField] : [])],
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

  // 5. One Delivery Order line per stock.move; never group by Sales Order line.
  const moves = picking.move_ids?.length
    ? await callModel('stock.move', 'read', [picking.move_ids], {
        fields: ['id', 'product_id', 'product_uom_qty', ...(preparedField ? [preparedField] : [])],
      })
    : [];

  // 6. Read stock.move.line for serial numbers (lot_id may be false for non-serialized items)
  const moveLines = picking.move_ids?.length
    ? await callModel('stock.move.line', 'search_read',
        [[['picking_id', '=', odooPickingId]]],
        { fields: ['move_id', 'lot_id'] }
      )
    : [];

  const serialByMove = {};
  for (const ml of moveLines) {
    const mid = ml.move_id?.[0];
    if (mid && ml.lot_id) {
      if (!serialByMove[mid]) serialByMove[mid] = [];
      serialByMove[mid].push(ml.lot_id[1]);
    }
  }

  const productIds = [...new Set(moves.map(move => move.product_id?.[0]).filter(Boolean))];
  const productTracking = productIds.length ? await callModel('product.product', 'read', [productIds], { fields: ['id', 'tracking'] }) : [];
  const trackingByProduct = new Map(productTracking.map(product => [product.id, product.tracking]));
  const preparedLines = new Map();
  for (const move of moves) {
    const id = move.id;
    if (!Number.isInteger(id) || id <= 0 || !picking.move_ids.includes(id) || preparedLines.has(id)) throw new Error(`DOO ${picking.name}: invalid, repeated or unrelated stock.move.id.`);
    const tracking = trackingByProduct.get(move.product_id?.[0]);
    if (!['serial', 'none'].includes(tracking)) throw new Error(`DOO ${picking.name}: unsupported or unavailable product tracking for move ${move.id}.`);
    if (preparedField && !Number.isInteger(move[preparedField])) throw new Error(`Invalid prepared quantity on Odoo move ${move.id}.`);
    preparedLines.set(id, {
      order_line_id: id, product_name: move.product_id?.[1],
      product_uom_qty: move.product_uom_qty,
      prepared_quantity: preparedField ? move[preparedField] : null,
      tracking, serial_numbers: [...(serialByMove[id] || [])],
    });
  }
  if (preparedLines.size !== new Set(picking.move_ids || []).size) throw new Error(`DOO ${picking.name}: incomplete stock.move snapshot.`);
  if (readyField && typeof picking[readyField] !== 'boolean') throw new Error('Configured Odoo DOO Ready field must return a boolean.');

  // Strip HTML tags from sale.order note field
  const stripHtml = html => (html ? html.replace(/<[^>]*>/g, '').trim() : null);

  // Strip " (MY)" country suffix from state name e.g. "Selangor (MY)" → "Selangor"
  const stateName = customerPartner?.state_id?.[1]?.replace(/\s*\(MY\)\s*$/, '') || null;

  return {
    id:                      picking.id,
    order_line_model:        ODOO_LINE_MODEL,
    doo_ready:               readyField ? picking[readyField] : false,
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
    order_lines: [...preparedLines.values()],
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

/**
 * Write per-line item detail (quantity, serial number, per-line delivered
 * status) for Loaded / Arrived events, as a single JSON field on stock.picking.
 *
 * TODO: x_order_lines_json is a placeholder field name pending GCA confirmation
 * — same status as every field in writeOdooExtendedFields above, reuses the
 * same ODOO_SEND_EXTENDED_FIELDS flag.
 *
 * Deliberately NOT native stock.move.line writes (qty_done + lot_id per line).
 * That would be the "correct" Odoo-native target — it'd show up in Odoo's own
 * delivery UI instead of a hidden field — but it needs domain knowledge we
 * don't have from outside GCA's instance: CE Hub's order_line_id is stock.move.id,
 * and matching its native serial move lines still needs an agreed write contract. Some
 * Odoo versions require a stock.production.lot record to exist before a
 * serial can be assigned to a move line. Both are real ways for this write to
 * silently fail or attach data to the wrong line. A single JSON text field is
 * a much smaller, lower-risk ask of GCA — one more field alongside the 6
 * already requested — and carries the identical information.
 *
 * @param {string} odooOrderRef - DO number (orders.odoo_order_ref)
 * @param {Array}  orderLines   - payload.order_lines from buildOdooEventPayload()
 */
async function writeOdooOrderLines(odooOrderRef, orderLines, orderLineModel) {
  if (!process.env.ODOO_URL || !odooOrderRef) return null;
  if (process.env.ODOO_SEND_EXTENDED_FIELDS !== 'true') return null;
  if (!Array.isArray(orderLines) || orderLines.length === 0) return null;
  assertOutboundLineIdentity({ order_line_model: orderLineModel, order_lines: orderLines });

  const pickings = await callModel('stock.picking', 'search_read',
    [[['name', '=', odooOrderRef]]],
    { fields: ['id'], limit: 1 }
  ).catch(() => null);
  if (!pickings?.length) return null;

  // TODO: x_order_lines_json is a placeholder field name pending GCA confirmation.
  return callModel('stock.picking', 'write', [[pickings[0].id], {
    x_order_lines_json: JSON.stringify(orderLines),
  }]).catch(err => {
    console.error(`[Odoo] writeOdooOrderLines failed for ${odooOrderRef} (non-fatal, field unconfirmed):`, err.message);
    return null;
  });
}

module.exports = {
  authenticate,
  callModel,
  pushDeliveryStatus,
  writeOdooDeliveryStatus,
  triggerOdooFailureNotification,
  writeOdooExtendedFields,
  writeOdooOrderLines,
  getOrdersForDeliveryDate,
  iterateOrdersForDeliveryDate,
  isOrderEligibleForDeliveryDate,
  getOrderDetail,
};
