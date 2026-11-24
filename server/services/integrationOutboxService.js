// server/services/integrationOutboxService.js
//
// Integration Outbox — reliable async delivery of external API calls (A.3.2).
//
// All HTTP/external I/O is deferred to the outbox worker (integrationOutboxCron).
// Routes and lifecycle service only call `enqueue()`; they never call external
// APIs inline, ensuring sub-500ms response times even when third parties are down.
//
// Idempotency key convention:
//   slot:{timeSlotId}:depart         — slot-level departure
//   slot:{timeSlotId}:end_trip       — slot-level trip completion
//   order:{orderId}:a{attempt}:...  — per-order Odoo delivery events (see odooEventOutbox.js)
//   order:{orderId}:on_the_way       — customer on-the-way event (message sent by Odoo, not CE Hub)
//   order:{orderId}:odoo:appointment:{status}:{suffix} — FRD INT-04 confirmation result
//   odoo-change:{requestId}:decision — FRD INT-11 edit/cancel decision
//
// Retry policy: exponential backoff with jitter, max OUTBOX_MAX_ATTEMPTS attempts,
//   then status → 'dead' for manual review.

const prisma = require('../prismaClient');
const { enqueueOdooStatusEvent } = require('./odooEventOutbox');
const { pickNextStop } = require('./nextStopSpec');

const MAX_ATTEMPTS   = parseInt(process.env.OUTBOX_MAX_ATTEMPTS || '8', 10);
// Backoff delays in minutes: attempt 1→1m, 2→5m, 3→15m, 4→60m, 5+→60m
const BACKOFF_MINUTES = [1, 5, 15, 60, 60, 60, 60, 60];

/**
 * Return the next_retry_at timestamp for a given attempt number (1-based).
 */
function nextRetryAt(attempt) {
  const minutes = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)] || 60;
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Enqueue a job to the integration_outbox.
 * Silently ignores duplicate idempotency keys (already-enqueued jobs are safe).
 *
 * @param {{ eventType: string, target: string, payload: object, idempotencyKey: string }} job
 */
async function enqueue({ eventType, target, payload, idempotencyKey }) {
  if (!eventType || !target || !idempotencyKey) {
    console.error('[Outbox] enqueue() called with missing required fields:', { eventType, target, idempotencyKey });
    return null;
  }

  try {
    const row = await prisma.integration_outbox.upsert({
      where:  { idempotency_key: idempotencyKey },
      create: {
        event_type:      eventType,
        target,
        payload:         payload || {},
        idempotency_key: idempotencyKey,
        status:          'pending',
        attempts:        0,
        next_retry_at:   new Date(),
      },
      // If already exists (and not dead), don't overwrite — key is stable
      update: {},
    });
    return row;
  } catch (err) {
    // Unique constraint race is safe to ignore
    if (err.code === 'P2002') return null;
    console.error('[Outbox] enqueue() failed:', err.message);
    return null;
  }
}

/**
 * Enqueue all side effects for a slot departure.
 *   - One slot-level event
 *   - One per-order Odoo status sync for each active order
 *
 * Called by departTimeSlot after DB commit.
 *
 * @param {string} timeSlotId
 * @param {Array<{ id: string, odoo_order_ref?: string }>} activeOrders
 */
async function enqueueSlotDepartureSideEffects(timeSlotId, activeOrders) {
  // Slot-level event (idempotency key for the entire departure)
  await enqueue({
    eventType:      'SLOT_DEPARTED',
    target:         'internal',
    payload:        { timeSlotId },
    idempotencyKey: `slot:${timeSlotId}:depart`,
  });

  // Per-order Odoo write-back
  for (const order of activeOrders) {
    if (order.odoo_order_ref) {
      await enqueueOdooStatusEvent(prisma, order.id, 'Delivering')
        .catch(err => console.error('[Outbox] Delivering enqueue failed:', err.message));
    }
  }
}

/**
 * Enqueue all side effects for a slot trip end.
 *   - One slot-level event
 *   - Per-order Odoo write-back for Delivered/Completed orders
 *
 * @param {string} timeSlotId
 * @param {Array<{ id: string, order_status: string, odoo_order_ref?: string }>} slotOrders
 */
async function enqueueSlotEndTripSideEffects(timeSlotId, slotOrders) {
  await enqueue({
    eventType:      'SLOT_ENDED',
    target:         'internal',
    payload:        { timeSlotId },
    idempotencyKey: `slot:${timeSlotId}:end_trip`,
  });

  for (const order of slotOrders) {
    if (order.odoo_order_ref && order.order_status === 'Delivered') {
      await enqueueOdooStatusEvent(prisma, order.id, order.order_status)
        .catch(err => console.error('[Outbox] Delivered enqueue failed:', err.message));
    }
  }
}

/**
 * Enqueue on-the-way customer notifications for all active orders on a slot.
 * One outbox row per order (idempotent — second depart 409s before here).
 *
 * @param {string} timeSlotId
 * @param {Array<{ id: string, customers?: { id, full_name, phone, email } }>} activeOrders
 * @param {{ date?: string, time_window_start?: string, time_window_end?: string }} slotMeta
 */
async function enqueueOnTheWayNotifications(timeSlotId, activeOrders, slotMeta = {}) {
  for (const order of activeOrders) {
    const customer = order.customers;
    if (!customer) continue;

    await enqueue({
      eventType:      'CUSTOMER_ON_THE_WAY',
      target:         'notification',
      payload: {
        orderId:        order.id,
        customerId:     customer.id,
        timeSlotId,
        orderRef:       order.odoo_order_ref || 'Not Synced',
        address:        order.delivery_address || 'your delivery address',
        phone:          customer.phone || null,
        email:          customer.email || null,
        customerName:   customer.full_name || 'Customer',
        slotDate:       slotMeta.date || null,
        timeWindowStart: slotMeta.time_window_start || null,
        timeWindowEnd:  slotMeta.time_window_end || null,
      },
      idempotencyKey: `order:${order.id}:on_the_way`,
    });
  }
}

/**
 * FR-03-003: queue the On-the-Way event for the next open stop on a slot only.
 * Called on departure (Stop 1) and after each stop is delivered or failed.
 * The idempotency key order:{id}:on_the_way means a customer is told at most once.
 *
 * @param {string} timeSlotId
 * @returns {Promise<string|null>} the order id that was queued, or null
 */
async function enqueueNextOnTheWay(timeSlotId) {
  if (!timeSlotId) return null;
  const slot = await prisma.time_slots.findUnique({
    where: { id: timeSlotId },
    select: {
      id: true, date: true, time_window_start: true, time_window_end: true, slot_status: true,
      orders: {
        select: {
          id: true, order_status: true, truck_loading_sequence: true, scheduled_start_date_time: true,
          odoo_order_ref: true, delivery_address: true,
          customers: { select: { id: true, full_name: true, phone: true, email: true } },
        },
      },
    },
  });
  if (!slot || slot.slot_status !== 'out_for_delivery') return null;
  const next = pickNextStop(slot.orders);
  if (!next) return null;
  await enqueueOnTheWayNotifications(slot.id, [next], {
    date: slot.date,
    time_window_start: slot.time_window_start,
    time_window_end: slot.time_window_end,
  });
  return next.id;
}

/**
 * Fetch the next batch of pending outbox rows ready to process.
 *
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function fetchPendingBatch(limit = 20) {
  return prisma.integration_outbox.findMany({
    where: {
      status:       'pending',
      NOT: { idempotency_key: { startsWith: 'sync_preview:' } },
      next_retry_at: { lte: new Date() },
    },
    orderBy: { created_at: 'asc' },
    take:    limit,
  });
}

/**
 * Mark an outbox row as processed.
 */
async function markProcessed(id) {
  return prisma.integration_outbox.update({
    where: { id },
    data:  { status: 'processed', processed_at: new Date() },
  });
}

/**
 * Record a failed attempt and schedule retry or mark dead. A permanent failure
 * (e.g. the Odoo callback receiver answered 4xx) goes dead at once: retrying the
 * same envelope cannot succeed.
 */
async function recordFailure(id, errorMessage, currentAttempts, { permanent = false } = {}) {
  const nextAttempt = currentAttempts + 1;
  const isDead      = permanent || nextAttempt >= MAX_ATTEMPTS;

  return prisma.integration_outbox.update({
    where: { id },
    data: {
      attempts:      nextAttempt,
      status:        isDead ? 'dead' : 'pending',
      last_error:    String(errorMessage).slice(0, 500),
      next_retry_at: isDead ? null : nextRetryAt(nextAttempt),
    },
  });
}

/**
 * GET /api/integration-outbox — returns rows by status (admin visibility).
 * Used by SyncMonitor or direct admin inspection.
 */
async function getOutboxRows({ status, limit = 50, offset = 0 } = {}) {
  const where = status ? { status } : {};
  const [rows, total] = await Promise.all([
    prisma.integration_outbox.findMany({ where, orderBy: { created_at: 'desc' }, take: limit, skip: offset }),
    prisma.integration_outbox.count({ where }),
  ]);
  return { rows, total };
}

module.exports = {
  enqueue,
  enqueueSlotDepartureSideEffects,
  enqueueSlotEndTripSideEffects,
  enqueueOnTheWayNotifications,
  enqueueNextOnTheWay,
  fetchPendingBatch,
  markProcessed,
  recordFailure,
  getOutboxRows,
};
