// server/integrationOutboxCron.js
//
// Integration Outbox Worker (A.3.2a)
//
// Runs every minute and processes pending rows from integration_outbox.
// Dispatches each row to the appropriate handler based on event_type / target.
// On success → marks processed. On failure → increments attempts and schedules retry.
//
// Handlers:
//   target: 'odoo'          — SLOT_STATUS_CHANGED → writeOdooDeliveryStatus + writeOdooExtendedFields
//                             (Loaded/Arrived also get writeOdooOrderLines via RPC, or the
//                             whole event via webhook instead if ODOO_USE_WEBHOOK=true —
//                             see odooWebhookService.js)
//                             ORDER_FAILED (A5.3)  → writeOdooDeliveryStatus('Failed') + extended fields
//                             ORDER_SCHEDULED      → writeOdooDeliveryStatus('Scheduled' — no-op) + extended fields
//                             RETURN_DO_CREATE (A5.5 stub) → logs until ERP API confirmed
//   target: 'notification'  — CUSTOMER_ON_THE_WAY → WhatsApp only
//   target: 'internal'      — SLOT_DEPARTED / SLOT_ENDED → no-op (logging only)

const { writeOdooDeliveryStatus, writeOdooExtendedFields, writeOdooOrderLines } = require('./services/odooService');
const { sendOdooStatusWebhook, shouldUseWebhook } = require('./services/odooWebhookService');
const {
  fetchPendingBatch,
  markProcessed,
  recordFailure,
} = require('./services/integrationOutboxService');
const { sendWhatsAppMessage } = require('./services/whatsappService');
const {
  DEFAULT_BRAND_NAME,
  TEMPLATE_ON_THE_WAY,
  TEMPLATE_D1_REMINDER,
} = require('./notificationTemplateDefaults');

const prisma = require('./prismaClient');

let _running = false; // prevent overlapping runs
const DEFAULT_FROM_NAME = DEFAULT_BRAND_NAME;

function formatTimeWindow(start, end) {
  if (!start || !end) return 'your scheduled time window';
  return `${start} - ${end}`;
}

function applyTemplate(template, vars) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '');
}

async function getSettingMap(settingKeys) {
  const rows = await prisma.system_settings.findMany({
    where: { setting_key: { in: settingKeys } },
  });
  return rows.reduce((acc, row) => {
    acc[row.setting_key] = row.setting_value;
    return acc;
  }, {});
}

// ── Odoo handler ─────────────────────────────────────────────────────────────

async function handleOdoo(row) {
  if (!process.env.ODOO_URL) {
    console.log('[OutboxWorker] ODOO_URL not set — skipping Odoo event:', row.event_type);
    return;
  }

  // `odooRef`/`status` are legacy-shaped payloads from before the shared payload
  // builder existed; new rows carry `do_ref`/`status` (see odooPayloadBuilder.js).
  // Support both so already-queued rows from before this change still process.
  const payload = row.payload || {};
  const odooRef = payload.do_ref || payload.odooRef;
  const status  = payload.status;
  if (!odooRef) {
    console.warn('[OutboxWorker] Odoo row missing odooRef — marking dead:', row.id);
    throw new Error('Missing odooRef in payload');
  }

  if (shouldUseWebhook(status)) {
    await sendOdooStatusWebhook(payload);
    console.log(`[OutboxWorker] Odoo webhook sync: ${odooRef} → ${status}`);
    return;
  }

  await writeOdooDeliveryStatus(odooRef, status);
  await writeOdooExtendedFields(odooRef, payload);
  if (['Loaded', 'Arrived'].includes(status)) {
    await writeOdooOrderLines(odooRef, payload.order_lines);
  }
  console.log(`[OutboxWorker] Odoo sync: ${odooRef} → ${status}`);
}

// ── A5.3: ORDER_FAILED handler — write Failed status to Odoo ──────────────

async function handleOrderFailed(row) {
  if (!process.env.ODOO_URL) {
    console.log('[OutboxWorker] ODOO_URL not set — skipping ORDER_FAILED:', row.id);
    return;
  }

  const payload = row.payload || {};
  const odooRef = payload.do_ref || payload.odooRef;
  if (!odooRef) {
    // No Odoo ref — mark processed silently (nothing to sync)
    console.log(`[OutboxWorker] ORDER_FAILED skipped (no odooRef) for order ${payload.orderId || payload.ce_hub_order_ref}`);
    return;
  }

  await writeOdooDeliveryStatus(odooRef, 'Failed');
  await writeOdooExtendedFields(odooRef, payload);
  console.log(`[OutboxWorker] ORDER_FAILED: wrote Failed to Odoo for ${odooRef}`);
}

// ── ORDER_SCHEDULED handler — write the assigned window back to Odoo ──────
// writeOdooDeliveryStatus is a no-op for 'Scheduled' (not in CE_HUB_STATUS_MAP);
// only the extended (still-unconfirmed) fields carry anything for this event.

async function handleOrderScheduled(row) {
  if (!process.env.ODOO_URL) {
    console.log('[OutboxWorker] ODOO_URL not set — skipping ORDER_SCHEDULED:', row.id);
    return;
  }

  const payload = row.payload || {};
  const odooRef = payload.do_ref;
  if (!odooRef) {
    console.log('[OutboxWorker] ORDER_SCHEDULED skipped (no do_ref) for order', payload.ce_hub_order_ref);
    return;
  }

  await writeOdooExtendedFields(odooRef, payload);
  console.log(`[OutboxWorker] ORDER_SCHEDULED: pushed schedule fields for ${odooRef}`);
}

// ── A5.5 stub: RETURN_DO_CREATE — deferred until Odoo Return DO API confirmed ──

async function handleReturnDoCreate(row) {
  const { orderId, odooRef } = row.payload || {};
  console.log(
    `[OutboxWorker] RETURN_DO_CREATE stub — order ${orderId} (${odooRef || 'no odooRef'}). ` +
    'Return DO creation deferred until Odoo API is confirmed (Phase 2).'
  );
  // Mark as processed so it does not block the queue.
  // Phase 2 will replace this stub with the actual Odoo stock.picking return call.
}

// ── Customer notification handler ─────────────────────────────────────────────

async function handleCustomerOnTheWay(row) {
  const {
    orderId,
    phone,
    customerName,
    slotDate,
    timeWindowStart,
    timeWindowEnd,
    orderRef,
    address,
  } = row.payload || {};
  const now = new Date();
  const settings = await getSettingMap([
    'customer_on_the_way_notification_enabled',
    'template_on_the_way',
    'notification_from_name',
  ]);

  if (settings.customer_on_the_way_notification_enabled === 'false') {
    console.log('[OutboxWorker] CUSTOMER_ON_THE_WAY disabled via settings - skipping send.');
    return;
  }

  if (!phone) {
    console.warn(`[OutboxWorker] CUSTOMER_ON_THE_WAY skipped — no phone for order ${orderId}`);
    return;
  }

  const brandName = settings.notification_from_name || DEFAULT_FROM_NAME;
  const vars = {
    customerName: customerName || 'Customer',
    orderRef: orderRef || 'your order',
    slotDate: slotDate || 'today',
    timeWindow: formatTimeWindow(timeWindowStart, timeWindowEnd),
    address: address || 'your delivery address',
    brandName,
  };

  const message = applyTemplate(settings.template_on_the_way || TEMPLATE_ON_THE_WAY, vars);

  try {
    await sendWhatsAppMessage(phone, message);
    console.log(`[OutboxWorker] On-the-way WhatsApp sent → ${phone}`);
  } catch (e) {
    console.warn(`[OutboxWorker] On-the-way WhatsApp failed for ${phone}:`, e.message);
    throw e;
  }

  // Stamp notified_on_the_way_at
  if (orderId) {
    try {
      await prisma.orders.update({
        where: { id: orderId },
        data:  { notified_on_the_way_at: now },
      });
    } catch (e) {
      console.warn('[OutboxWorker] Failed to stamp notified_on_the_way_at:', e.message);
    }
  }
}

// ── D-1 reminder handler ──────────────────────────────────────────────────────

async function handleD1Reminder(row) {
  const {
    orderId,
    phone,
    customerName,
    slotDate,
    timeWindowStart,
    timeWindowEnd,
    orderRef,
    address,
  } = row.payload || {};
  const now = new Date();
  const settings = await getSettingMap([
    'customer_d1_reminder_notification_enabled',
    'template_d1_reminder',
    'notification_from_name',
  ]);

  if (settings.customer_d1_reminder_notification_enabled === 'false') {
    console.log('[OutboxWorker] CUSTOMER_D1_REMINDER disabled via settings - skipping send.');
    return;
  }

  if (!phone) {
    console.warn(`[OutboxWorker] CUSTOMER_D1_REMINDER skipped — no phone for order ${orderId}`);
    return;
  }

  const brandName = settings.notification_from_name || DEFAULT_FROM_NAME;
  const vars = {
    customerName: customerName || 'Customer',
    orderRef: orderRef || 'your order',
    slotDate: slotDate || 'tomorrow',
    timeWindow: formatTimeWindow(timeWindowStart, timeWindowEnd),
    address: address || 'your delivery address',
    brandName,
  };

  const message = applyTemplate(settings.template_d1_reminder || TEMPLATE_D1_REMINDER, vars);

  try {
    await sendWhatsAppMessage(phone, message);
    console.log(`[OutboxWorker] D-1 WhatsApp sent → ${phone}`);
  } catch (e) {
    console.warn(`[OutboxWorker] D-1 WhatsApp failed for ${phone}:`, e.message);
    throw e;
  }

  if (orderId) {
    try {
      await prisma.orders.update({
        where: { id: orderId },
        data:  { notified_d1_at: now },
      });
    } catch (e) {
      console.warn('[OutboxWorker] Failed to stamp notified_d1_at:', e.message);
    }
  }
}

// ── FALLBACK_POLL_COMPLETE handler ────────────────────────────────────────────
// Signals Odoo/GCA that the 5PM fallback sync finished and all next-day DOs are
// now in CE Hub. GCA uses this event to trigger the D-1 WhatsApp reminders.
// TODO: replace the log with a real Odoo API call once GCA confirms the endpoint.

async function handleFallbackPollComplete(row) {
  const { date, synced_dos = [], skipped_dos = [], synced_count, skipped_count } = row.payload || {};
  console.log(
    `[OutboxWorker] FALLBACK_POLL_COMPLETE: date=${date}, synced=${synced_count ?? synced_dos.length} [${synced_dos.join(', ')}], ` +
    `skipped=${skipped_count ?? skipped_dos.length} [${skipped_dos.join(', ')}]. ` +
    'D-1 WhatsApp trigger pending GCA API confirmation.'
  );
  // TODO: call Odoo endpoint here when GCA provides it, e.g.:
  // await callModel('some.model', 'trigger_d1_whatsapp', [[]], { date, synced_dos });
}

// ── Internal event handler (logging only) ─────────────────────────────────────

async function handleInternal(row) {
  console.log(`[OutboxWorker] Internal event processed: ${row.event_type} — ${JSON.stringify(row.payload)}`);
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

async function dispatchRow(row) {
  switch (row.event_type) {
    case 'SLOT_STATUS_CHANGED':
      if (row.target === 'odoo') return handleOdoo(row);
      break;
    case 'ORDER_FAILED':
      return handleOrderFailed(row);
    case 'ORDER_SCHEDULED':
      return handleOrderScheduled(row);
    case 'RETURN_DO_CREATE':
      return handleReturnDoCreate(row);
    case 'CUSTOMER_ON_THE_WAY':
      return handleCustomerOnTheWay(row);
    case 'CUSTOMER_D1_REMINDER':
      return handleD1Reminder(row);
    case 'FALLBACK_POLL_COMPLETE':
      return handleFallbackPollComplete(row);
    case 'SLOT_DEPARTED':
    case 'SLOT_ENDED':
      return handleInternal(row);
    default:
      console.warn(`[OutboxWorker] Unknown event_type: ${row.event_type}`);
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

async function runOutboxWorker() {
  if (_running) return;
  _running = true;

  try {
    const rows = await fetchPendingBatch(20);
    if (!rows.length) return;

    console.log(`[OutboxWorker] Processing ${rows.length} pending rows…`);

    for (const row of rows) {
      try {
        await dispatchRow(row);
        await markProcessed(row.id);
      } catch (err) {
        console.error(`[OutboxWorker] Row ${row.id} (${row.event_type}) failed:`, err.message);
        await recordFailure(row.id, err.message, row.attempts);
      }
    }
  } catch (err) {
    console.error('[OutboxWorker] Fatal error in runOutboxWorker:', err.message);
  } finally {
    _running = false;
  }
}

module.exports = { runOutboxWorker };
