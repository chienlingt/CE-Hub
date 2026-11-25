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
// Shared CE Hub → Odoo x_delivery_status mapping: the six FRD v1.2 operational
// statuses only. Unloaded stays internal to CE Hub (Arrived means "all unloaded");
// Completed has no Odoo counterpart — both return null (no-op).
const CE_HUB_STATUS_MAP = {
  Picked:     'picked',
  Loaded:     'loaded',
  Delivering: 'in_transit',
  Arrived:    'arrived',
  Delivered:  'delivered',
  Failed:     'failed',
};

// A delayed/retried Picked or Arrived event must not roll back a later state.
// The one agreed reversal: an event from a NEWER delivery attempt may move a DO off
// `failed` (FRD INT-07 multiple attempts; see odooEventOutbox.js). Delivered is final.
function canAdvanceDeliveryStatus(current, next, { reopenFailed = false } = {}) {
  if (current === next) return false;
  if (current === 'failed' && reopenFailed && next !== 'failed') return true;
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
async function writeOdooDeliveryStatus(odooOrderRef, localStatus, { reopenFailed = false } = {}) {
  if (!process.env.ODOO_URL || !odooOrderRef) return null;

  const odooStatus = CE_HUB_STATUS_MAP[localStatus];
  if (!odooStatus) return null;

  const pickings = await callModel('stock.picking', 'search_read',
    [[['name', '=', odooOrderRef]]],
    { fields: ['id', 'x_delivery_status'], limit: 1 }
  );

  if (!pickings?.length) return null;
  if (!canAdvanceDeliveryStatus(pickings[0].x_delivery_status, odooStatus, { reopenFailed })) return pickings[0].x_delivery_status === odooStatus ? null : { status_ignored: true };

  return callModel('stock.picking', 'write', [[pickings[0].id], { x_delivery_status: odooStatus }]);
}

// Optional GCA-confirmed failure fields on stock.picking. Each one is written only
// when its setting is present; none has a guessed default.
const FAILURE_FIELD_SETTINGS = [
  ['ODOO_FAILURE_SNAPSHOT_FIELD', payload => JSON.stringify(payload)],
  ['ODOO_FAILURE_REASON_FIELD', payload => payload.failure_reason],
  ['ODOO_FAILURE_NOTES_FIELD', payload => payload.remarks],
  ['ODOO_FAILURE_EVENT_REFERENCE_FIELD', payload => payload.failure_event_id],
];

function configuredFailureFields(payload) {
  const fields = {};
  for (const [setting, valueOf] of FAILURE_FIELD_SETTINGS) {
    const field = process.env[setting];
    if (!field) continue;
    if (!/^x_[A-Za-z0-9_]+$/.test(field) || field === 'x_delivery_status') throw new Error(`Invalid configured failure field: ${setting}`);
    if (Object.hasOwn(fields, field)) throw new Error(`Failure destination fields must be distinct: ${setting}`);
    fields[field] = valueOf(payload) || false;
  }
  return fields;
}

// FRD INT-07/INT-10 attempt record: one Log Note per failed attempt, carrying
// the CE Hub attempt reference so a retry can find it instead of posting twice.
function failureLogNoteLines(payload) {
  const crew = [payload.driver_name, payload.assistant_name].filter(Boolean).join(' / ');
  return [
    `CE Hub delivery attempt failed. Attempt reference: ${payload.failure_event_id}`,
    `Attempt time: ${payload.attempt_time}`,
    `Failure reason: ${payload.failure_reason || '-'}`,
    payload.remarks && `Notes: ${payload.remarks}`,
    `Driver: ${crew || '-'}${payload.driver_ref ? ` (CE Hub ${payload.driver_ref})` : ''}`,
    `Vehicle: ${payload.vehicle_plate || '-'}${payload.vehicle_ref ? ` (CE Hub ${payload.vehicle_ref})` : ''}`,
    `Trip reference: ${payload.trip_ref || '-'}; slot reference: ${payload.slot_ref || '-'}`,
    payload.attempt_ref && `Delivery attempt: ${payload.attempt_no} (${payload.attempt_ref})`,
    ...(payload.order_lines || []).map(resultLineText),
    ...damagedLines(payload),
  ];
}

// One line of a delivery result: disjoint delivered / undelivered / damaged
// quantities and serials. Older payloads without the split fall back to serial_numbers.
function resultLineText(line) {
  if (line.damaged_qty === undefined) {
    return `Line ${line.order_line_id}: quantity ${line.quantity}, delivered ${line.actual_delivered_qty ?? 0}` +
      `${line.serial_numbers?.length ? `, undelivered serials ${line.serial_numbers.join(', ')}` : ''}`;
  }
  const list = (label, serials) => (serials?.length ? `; ${label} serials ${serials.join(', ')}` : '');
  return `Line ${line.order_line_id}: quantity ${line.quantity}, delivered ${line.delivered_qty ?? line.actual_delivered_qty ?? '-'}, ` +
    `undelivered ${line.undelivered_qty ?? '-'}, damaged ${line.damaged_qty ?? 0}` +
    list('delivered', line.delivered_serial_numbers) + list('undelivered', line.undelivered_serial_numbers) +
    list('damaged', line.damaged_serial_numbers);
}

// FRD INT-10 damaged stock: one line per damaged unit with its reason, for the RMA follow-up.
function damagedLines(payload) {
  return (payload.order_lines || []).flatMap(line => (line.exceptions || [])
    .filter(exception => exception.outcome === 'damaged')
    .map(exception => `Damaged: line ${line.order_line_id} ${exception.serial_number ? `serial ${exception.serial_number}` : `unit #${exception.unit_number}`}` +
      ` - ${exception.reason || 'no reason'} (${(exception.evidence_paths || []).length} photo${(exception.evidence_paths || []).length === 1 ? '' : 's'})`));
}

// Driver confirmation hands the failure to Odoo. Per FRD v1.2 INT-13/AC-14 the
// Failed Delivery WhatsApp is MANUAL in Odoo: a user sends it once the structured
// failure information below is available. CE Hub never sends it.
//
// 1. One write: x_delivery_status='failed' plus any GCA-confirmed failure fields.
//    Skipped when the DO already shows failed (a retry after a timeout), so the
//    status is never rewritten.
// 2. The attempt Log Note (standard mail.thread API), unless one with this
//    attempt reference already exists.
// 3. The placeholder extended fields, non-fatally (off unless ODOO_SEND_EXTENDED_FIELDS).
async function triggerOdooFailureNotification(payload) {
  if (!process.env.ODOO_URL) throw new Error('Odoo is not configured; failure synchronization remains pending.');
  assertOutboundLineIdentity(payload);
  if (!payload.failure_event_id || !payload.attempt_time || Number.isNaN(Date.parse(payload.attempt_time))) {
    throw new Error('Failure snapshot lacks immutable attempt identity/time. Reconcile this legacy event; do not rebuild it from current order data.');
  }
  const reference = payload?.do_ref || payload?.odooRef;
  if (!reference) throw new Error('Missing DO reference for Odoo failure synchronization.');
  const extraFields = configuredFailureFields(payload);
  const pickings = await callModel('stock.picking', 'search_read', [[['name', '=', reference]]], { fields: ['id', 'x_delivery_status'], limit: 1 });
  if (!pickings?.length) throw new Error('Odoo Delivery Order not found; failure synchronization remains pending.');
  const picking = pickings[0];
  if (picking.x_delivery_status === 'delivered') throw new Error('Cannot record a failure for an Odoo delivery already marked delivered.');

  const alreadyFailed = picking.x_delivery_status === 'failed';
  if (!alreadyFailed) {
    const accepted = await callModel('stock.picking', 'write', [[picking.id], { x_delivery_status: 'failed', ...extraFields }]);
    if (accepted !== true) throw new Error('Odoo did not acknowledge the failed delivery status.');
  }

  const existingNotes = await callModel('mail.message', 'search_read', [[
    ['model', '=', 'stock.picking'], ['res_id', '=', picking.id], ['body', 'ilike', payload.failure_event_id],
  ]], { fields: ['id'], limit: 1 });
  if (!Array.isArray(existingNotes)) throw new Error('Invalid Odoo Log Note lookup response.');
  let logNote = 'existing';
  if (!existingNotes.length) {
    const messageId = await postOdooLogNote(picking.id, failureLogNoteLines(payload));
    if (!Number.isInteger(messageId) && messageId !== true) throw new Error('Odoo did not acknowledge the failure Log Note.');
    logNote = 'posted';
  }

  await writeOdooExtendedFields(reference, payload);
  return { ...(alreadyFailed ? { already_failed: true } : { triggered: true }), log_note: logNote, notification_owner: 'odoo' };
}

function resultReference(payload) {
  return payload.attempt_ref || payload.ce_hub_order_ref;
}

// FRD INT-08/INT-09 delivery result as a Log Note on the DO: delivered and
// undelivered quantity and serials per Odoo line, completion time, notes and proof
// references. It works before GCA confirms any custom field; Odoo's own line
// reconciliation (stock.move.line, DOO Done) is still a separate GCA decision.
function proofLink(path) {
  const base = (process.env.CE_HUB_PUBLIC_URL || '').replace(/\/$/, '');
  return /^https?:/.test(path) || !base ? path : `${base}${path}`;
}

function deliveryResultNoteLines(payload) {
  const crew = [payload.driver_name, payload.assistant_name].filter(Boolean).join(' / ');
  const photos = payload.proof_photo_paths || [];
  return [
    `CE Hub delivery result: ${payload.is_partial ? 'partial delivery' : 'full delivery'}. Reference: ${resultReference(payload)}`,
    `Completion time: ${payload.delivered_time || '-'}`,
    `Driver: ${crew || '-'}; vehicle: ${payload.vehicle_plate || '-'}`,
    payload.attempt_ref && `Delivery attempt: ${payload.attempt_no} (${payload.attempt_ref}); trip ${payload.trip_ref || '-'}`,
    ...(payload.order_lines || []).map(line => {
      if (line.damaged_qty !== undefined) return resultLineText(line);
      const delivered = line.delivered_serial_numbers?.length ? `; delivered serials ${line.delivered_serial_numbers.join(', ')}` : '';
      const undelivered = line.undelivered_serial_numbers?.length ? `; undelivered serials ${line.undelivered_serial_numbers.join(', ')}` : '';
      return `Line ${line.order_line_id}: quantity ${line.quantity}, delivered ${line.actual_delivered_qty ?? '-'}, undelivered ${line.undelivered_qty ?? '-'}${delivered}${undelivered}`;
    }),
    ...damagedLines(payload),
    payload.remarks && `Undelivered reason: ${payload.remarks}`,
    payload.delivery_notes && payload.delivery_notes !== payload.remarks && `Notes: ${payload.delivery_notes}`,
    `Proof: ${photos.length} photo${photos.length === 1 ? '' : 's'}${payload.signature_captured ? ', customer signature captured in CE Hub' : ', no signature'}`,
    ...photos.map(path => `Photo: ${proofLink(path)}`),
  ];
}

async function postOdooDeliveryResultNote(odooOrderRef, payload) {
  if (!process.env.ODOO_URL || !odooOrderRef) throw new Error('Delivery result synchronization blocked: Odoo URL or DO reference missing.');
  // Rows queued before this change carry no order reference to deduplicate on.
  if (!payload?.ce_hub_order_ref) return { log_note: 'skipped_legacy_payload' };
  const pickingId = await findPickingId(odooOrderRef);
  const marker = `CE Hub delivery result: ${payload.is_partial ? 'partial delivery' : 'full delivery'}. Reference: ${resultReference(payload)}`;
  // The result reference is per attempt, so a later attempt's result is never mistaken
  // for an earlier attempt's note.
  const existing = await callModel('mail.message', 'search_read', [[
    ['model', '=', 'stock.picking'], ['res_id', '=', pickingId], ['body', 'ilike', `Reference: ${resultReference(payload)}`],
  ]], { fields: ['id'], limit: 1 });
  if (!Array.isArray(existing)) throw new Error('Invalid Odoo Log Note lookup response.');
  if (existing.length) return { log_note: 'existing' };
  const messageId = await postOdooLogNote(pickingId, deliveryResultNoteLines(payload));
  if (!Number.isInteger(messageId) && messageId !== true) throw new Error(`Odoo did not acknowledge the delivery result Log Note (${marker}).`);
  return { log_note: 'posted' };
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
async function getOrderDetail(odooPickingId, { fallbackPolicy = null } = {}) {
  const readyField = process.env.ODOO_READY_FIELD;
  const preparedField = process.env.ODOO_PREPARED_QUANTITY_FIELD;
  // 1. Read stock.picking
  const [picking] = await callModel('stock.picking', 'read', [[odooPickingId]], {
    fields: [...new Set(['id', 'name', 'sale_id', 'partner_id', 'scheduled_date', 'move_ids', ...(readyField ? [readyField] : []),
      ...(fallbackPolicy ? [fallbackPolicy.dateField, fallbackPolicy.sessionField, fallbackPolicy.referenceField] : [])])],
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
    ...(fallbackPolicy && { fallback_appointment: { date: picking[fallbackPolicy.dateField], session: picking[fallbackPolicy.sessionField], reference: picking[fallbackPolicy.referenceField] } }),
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
    x_vehicle_plate:        payload?.vehicle_plate   || false,
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

// ── FRD INT-04 / INT-11 appointment write-back ────────────────────────────────
//
// Gated behind ODOO_SEND_APPOINTMENT_FIELDS, separate from the extended fields.
// Unlike writeOdooExtendedFields these THROW on failure so the outbox retries:
// a lost confirmation leaves Odoo's Confirm Appointment button in the wrong state.

async function findPickingId(odooOrderRef) {
  const pickings = await callModel('stock.picking', 'search_read',
    [[['name', '=', odooOrderRef]]],
    { fields: ['id'], limit: 1 }
  );
  if (!pickings?.length) throw new Error(`Odoo Delivery Order ${odooOrderRef} not found.`);
  return pickings[0].id;
}

// Log Note on the DO (FRD §8/§10 history). Uses Odoo's standard mail.thread API.
async function postOdooLogNote(pickingId, lines) {
  const body = lines.filter(Boolean).map(line => `<p>${String(line).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>`).join('');
  return callModel('stock.picking', 'message_post', [[pickingId]], { body, message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
}

/**
 * @param {string} odooOrderRef - DO number (orders.odoo_order_ref)
 * @param {object} payload      - odooPayloadBuilder.buildAppointmentPayload() output
 */
async function writeOdooAppointmentResult(odooOrderRef, payload) {
  if (!process.env.ODOO_URL || !odooOrderRef) throw new Error('Appointment synchronization blocked: Odoo URL or DO reference missing.');
  if (process.env.ODOO_SEND_APPOINTMENT_FIELDS !== 'true') throw new Error('Appointment synchronization blocked: GCA field mapping is not enabled.');

  const pickingId = await findPickingId(odooOrderRef);
  // TODO: every x_ field name below is a placeholder pending GCA confirmation.
  const accepted = await callModel('stock.picking', 'write', [[pickingId], {
    x_cehub_order_id:       payload.cehub_order_id || false,
    x_appointment_status:   payload.confirmation_status,
    x_cehub_slot_ref:       payload.slot_ref || false,
    x_confirmed_date:       payload.confirmed_date || false,
    x_confirmed_session:    payload.confirmed_session || false,
    x_scheduled_date_start: payload.scheduled_start || false,
    x_scheduled_date_end:   payload.scheduled_end || false,
    x_confirmed_qty_json:   payload.order_lines?.length ? JSON.stringify(payload.order_lines) : false,
    x_appointment_message:  payload.message || false,
  }]);
  if (accepted !== true) throw new Error('Odoo did not acknowledge appointment confirmation fields.');
  await postOdooLogNote(pickingId, [
    `CE Hub appointment ${payload.confirmation_status}${payload.request_ref ? ` (request ${payload.request_ref})` : ''}.`,
    payload.confirmed_date && `Confirmed: ${payload.confirmed_date} ${payload.confirmed_session || ''} ${payload.scheduled_start || ''} – ${payload.scheduled_end || ''}`,
    payload.confirmed_quantity_total != null && `Confirmed quantity: ${payload.confirmed_quantity_total}`,
    payload.message && `Reason: ${payload.message}`,
  ]);
  return true;
}

/**
 * @param {string} odooOrderRef - DO number (orders.odoo_order_ref)
 * @param {object} payload      - odooPayloadBuilder.buildAppointmentDecisionPayload() output
 */
async function writeOdooAppointmentDecision(odooOrderRef, payload) {
  if (!process.env.ODOO_URL || !odooOrderRef) throw new Error('Appointment decision blocked: Odoo URL or DO reference missing.');
  if (process.env.ODOO_SEND_APPOINTMENT_FIELDS !== 'true') throw new Error('Appointment decision blocked: GCA field mapping is not enabled.');
  const cancelledField = process.env.ODOO_ORDER_CANCELLED_FIELD;
  if (payload.action === 'cancel_order' && (!cancelledField || !/^x_[A-Za-z0-9_]+$/.test(cancelledField)
    || ['x_delivery_status', 'x_appointment_status', 'x_appointment_change_status', 'x_appointment_change_note', 'x_cehub_slot_ref', 'x_confirmed_date', 'x_confirmed_session', 'x_scheduled_date_start', 'x_scheduled_date_end', 'x_confirmed_qty_json'].includes(cancelledField))) {
    throw new Error('DO cancellation decision blocked: GCA must confirm ODOO_ORDER_CANCELLED_FIELD (Boolean). Do not reopen booking for a cancelled DO.');
  }

  const pickingId = await findPickingId(odooOrderRef);
  // TODO: every x_ field name below is a placeholder pending GCA confirmation.
  const accepted = await callModel('stock.picking', 'write', [[pickingId], {
    x_appointment_change_status: payload.decision,
    x_appointment_change_note:   payload.note || false,
    ...(payload.action === 'cancel_order' && payload.order_cancelled && { [cancelledField]: true }),
    ...(payload.clear_confirmed_appointment && {
      x_appointment_status:   'cancelled',
      x_cehub_slot_ref:       false,
      x_confirmed_date:       false,
      x_confirmed_session:    false,
      x_scheduled_date_start: false,
      x_scheduled_date_end:   false,
      x_confirmed_qty_json: false,
    }),
  }]);
  if (accepted !== true) throw new Error('Odoo did not acknowledge appointment decision fields.');
  const previous = payload.previous_appointment || {};
  await postOdooLogNote(pickingId, [
    `CE Hub ${payload.decision} the appointment ${payload.action} request${payload.request_ref ? ` ${payload.request_ref}` : ''}.`,
    `Previous status: ${previous.status || 'unknown'}; slot reference: ${previous.slot_ref || 'none'}; confirmation request: ${previous.request_ref || 'none'}.`,
    previous.date && `Previous appointment: ${previous.date} ${previous.session || ''} ${previous.scheduled_start || ''} – ${previous.scheduled_end || ''}`,
    payload.note && `Note: ${payload.note}`,
  ]);
  return true;
}

// ── FRD INT-07..INT-10 additions (JSON-RPC transport) ─────────────────────────

// Post a Log Note unless one containing `marker` already exists on the picking, so a
// retried outbox row never posts twice. The marker is written into the note itself.
async function postOdooLogNoteOnce(pickingId, marker, lines) {
  const existing = await callModel('mail.message', 'search_read', [[
    ['model', '=', 'stock.picking'], ['res_id', '=', pickingId], ['body', 'ilike', marker],
  ]], { fields: ['id'], limit: 1 });
  if (!Array.isArray(existing)) throw new Error('Invalid Odoo Log Note lookup response.');
  if (existing.length) return 'existing';
  const messageId = await postOdooLogNote(pickingId, [...lines, marker]);
  if (!Number.isInteger(messageId) && messageId !== true) throw new Error(`Odoo did not acknowledge the Log Note (${marker}).`);
  return 'posted';
}

function crewLine(payload) {
  const crew = [payload.driver_name, payload.assistant_name].filter(Boolean).join(' / ');
  return `Driver: ${crew || '-'}${payload.driver_ref ? ` (CE Hub ${payload.driver_ref})` : ''}; ` +
    `vehicle: ${payload.vehicle_plate || '-'}${payload.vehicle_ref ? ` (CE Hub ${payload.vehicle_ref})` : ''}`;
}

/**
 * FRD INT-07 attempt history: one Log Note when a delivery attempt first reaches Odoo
 * (its first Picked/Loaded/In Transit/Arrived event), with the attempt, trip and crew.
 */
async function postOdooAttemptNote(odooOrderRef, payload) {
  if (!payload?.attempt_ref) return { log_note: 'skipped_legacy_payload' };
  const pickingId = await findPickingId(odooOrderRef);
  // Marker deliberately avoids the word "Reference": the delivery-result note is found by
  // `Reference: <attempt_ref>` (case-insensitive), and must never match this note.
  const note = await postOdooLogNoteOnce(pickingId, `CE Hub attempt: ${payload.attempt_ref}`, [
    `CE Hub delivery attempt ${payload.attempt_no} started (first status: ${CE_HUB_STATUS_MAP[payload.status] || payload.status}).`,
    `Event time: ${payload.occurred_at || '-'}`,
    crewLine(payload),
    `Trip reference: ${payload.trip_ref || '-'}; slot reference: ${payload.slot_ref || '-'}`,
  ]);
  return { log_note: note };
}

/**
 * FRD INT-07 driver change: latest driver/vehicle on the DO (extended fields, when
 * enabled) plus a traceable Log Note, deduplicated by the event's update reference.
 */
async function writeOdooDriverChange(odooOrderRef, payload, eventId) {
  if (!process.env.ODOO_URL || !odooOrderRef) throw new Error('Driver change synchronization blocked: Odoo URL or DO reference missing.');
  const pickingId = await findPickingId(odooOrderRef);
  await writeOdooExtendedFields(odooOrderRef, payload);
  const previous = payload.previous_crew || {};
  const note = await postOdooLogNoteOnce(pickingId, `CE Hub update reference: ${eventId}`, [
    'CE Hub delivery crew changed.',
    `Now: ${crewLine(payload)}`,
    `Before: driver ${previous.driver_name || '-'}${previous.assistant_name ? ` / ${previous.assistant_name}` : ''}; vehicle ${previous.vehicle_plate || '-'}`,
    payload.attempt_ref && `Delivery attempt: ${payload.attempt_no} (${payload.attempt_ref})`,
    `Changed at: ${payload.occurred_at || '-'}`,
  ]);
  return { log_note: note };
}

/**
 * FRD §12 data points 26-27: signature, delivery photos and damage evidence as
 * ir.attachment records on the DO. Files already attached under the same name are
 * skipped, so a retry never duplicates them.
 *
 * @param {string} odooOrderRef
 * @param {Array<{ filename: string, mimetype: string, base64: string }>} files - odooProofFiles.proofFilesFor()
 */
async function attachOdooFiles(odooOrderRef, files) {
  if (!files?.length) return { attached: 0, existing: 0 };
  const pickingId = await findPickingId(odooOrderRef);
  const names = files.map(file => file.filename);
  const existing = await callModel('ir.attachment', 'search_read', [[
    ['res_model', '=', 'stock.picking'], ['res_id', '=', pickingId], ['name', 'in', names],
  ]], { fields: ['name'] });
  if (!Array.isArray(existing)) throw new Error('Invalid Odoo attachment lookup response.');
  const have = new Set(existing.map(record => record.name));
  let attached = 0;
  for (const file of files) {
    if (have.has(file.filename)) continue;
    const id = await callModel('ir.attachment', 'create', [{
      name: file.filename, datas: file.base64, mimetype: file.mimetype,
      res_model: 'stock.picking', res_id: pickingId,
    }]);
    if (!Number.isInteger(id) && !(Array.isArray(id) && id.length)) throw new Error(`Odoo did not acknowledge attachment ${file.filename}.`);
    attached += 1;
  }
  return { attached, existing: have.size };
}

module.exports = {
  authenticate,
  writeOdooAppointmentResult,
  writeOdooAppointmentDecision,
  callModel,
  pushDeliveryStatus,
  writeOdooDeliveryStatus,
  triggerOdooFailureNotification,
  postOdooDeliveryResultNote,
  deliveryResultNoteLines,
  writeOdooExtendedFields,
  writeOdooOrderLines,
  canAdvanceDeliveryStatus,
  failureLogNoteLines,
  postOdooAttemptNote,
  writeOdooDriverChange,
  attachOdooFiles,
  getOrdersForDeliveryDate,
  iterateOrdersForDeliveryDate,
  isOrderEligibleForDeliveryDate,
  getOrderDetail,
};
