// server/services/odooEventOutbox.js
//
// The one way CE Hub queues a delivery event for Odoo (FRD INT-07 to INT-10).
//
// Every event is scoped to a delivery attempt. A Failed DO that gets a new confirmed
// appointment starts attempt N+1 (orders.number_of_attempts), so its Picked/Loaded/...
// events get new keys instead of colliding with the first attempt's rows:
//
//   order:{orderId}:a{attempt}:odoo:{status}
//   order:{orderId}:a{attempt}:failure:{failureEventId}
//   order:{orderId}:a{attempt}:driver:{driverId}:{assistantId}
//
// Each new row also takes the next per-DO `sequence` (orders.odoo_event_seq), which the
// callback envelope sends so Odoo can order events (FRD §13). The outbox row id is the
// event's update reference (`event_id`); it does not change across retries.

const { buildOdooEventPayload, attemptNumber } = require('./odooPayloadBuilder');

function odooEventKey(orderId, attemptNo, suffix) {
  return `order:${orderId}:a${attemptNo}:${suffix}`;
}

async function nextSequence(db, orderId) {
  const row = await db.orders.update({
    where: { id: orderId },
    data: { odoo_event_seq: { increment: 1 } },
    select: { odoo_event_seq: true },
  });
  return row.odoo_event_seq;
}

async function insertRow(db, { eventType, key, payload }) {
  return db.integration_outbox.upsert({
    where: { idempotency_key: key },
    update: {},
    create: {
      event_type: eventType, target: 'odoo', payload, idempotency_key: key,
      status: 'pending', attempts: 0, next_retry_at: new Date(),
    },
  });
}

/**
 * Queue one Odoo delivery event for the order's current attempt. A second call for the
 * same attempt and status returns the existing row (the key is stable), unless
 * `refreshPending` is set, which refreshes a not-yet-attempted snapshot in place.
 *
 * @param {object} db - prisma client or transaction
 * @param {string} orderId
 * @param {string} status - Picked|Loaded|Delivering|Arrived|Delivered|Failed
 * @param {{ eventType?: string, keySuffix?: string, extraPayload?: object, refreshPending?: boolean }} [options]
 * @returns {Promise<object|null>} the outbox row, or null when the order has no DO reference
 */
async function enqueueOdooStatusEvent(db, orderId, status, {
  eventType = 'SLOT_STATUS_CHANGED', keySuffix, extraPayload = {}, refreshPending = false,
} = {}) {
  const order = await db.orders.findUnique({
    where: { id: orderId },
    select: { id: true, odoo_order_ref: true, number_of_attempts: true },
  });
  if (!order?.odoo_order_ref) return null;

  const key = odooEventKey(orderId, attemptNumber(order), keySuffix || `odoo:${status}`);
  const existing = await db.integration_outbox.findUnique({ where: { idempotency_key: key } });
  if (existing && !refreshPending) return existing;

  const base = await buildOdooEventPayload(orderId, status, db);
  if (!base) return null;
  if (existing) {
    await db.integration_outbox.updateMany({
      where: { id: existing.id, status: 'pending', attempts: 0 },
      data: { payload: { ...base, ...extraPayload, sequence: existing.payload?.sequence ?? null } },
    });
    return existing;
  }
  const payload = { ...base, ...extraPayload, sequence: await nextSequence(db, orderId) };
  return insertRow(db, { eventType, key, payload });
}

/**
 * Queue a non-status Odoo event that still belongs to one DO (appointment result,
 * change decision, driver change). Adds the per-DO sequence; the key is the caller's.
 */
async function enqueueOdooOrderEvent(db, orderId, { eventType, key, payload }) {
  const existing = await db.integration_outbox.findUnique({ where: { idempotency_key: key } });
  if (existing) return existing;
  const sequence = orderId ? await nextSequence(db, orderId) : null;
  return insertRow(db, { eventType, key, payload: { ...payload, sequence } });
}

module.exports = { enqueueOdooStatusEvent, enqueueOdooOrderEvent, odooEventKey, nextSequence };
