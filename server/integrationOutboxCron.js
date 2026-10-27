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
//                             ORDER_FAILED (A5.3)     → writeOdooDeliveryStatus('Failed') + extended fields
//                             ORDER_SCHEDULED         → writeOdooDeliveryStatus('Scheduled' — no-op) + extended fields
//                             ORDER_APPROVAL_CANCELLED → clears the confirmed appointment (extended fields)
//                             (both legacy — no longer enqueued; kept so queued rows drain)
//                             APPOINTMENT_CONFIRMATION    → writeOdooAppointmentResult (FRD INT-04)
//                             APPOINTMENT_CHANGE_DECISION → writeOdooAppointmentDecision (FRD INT-11)
//   target: 'notification'  — CUSTOMER_ON_THE_WAY → WhatsApp only
//   target: 'internal'      — SLOT_DEPARTED / SLOT_ENDED → no-op (logging only)

const {
  writeOdooDeliveryStatus, writeOdooExtendedFields, writeOdooOrderLines, triggerOdooFailureNotification,
  writeOdooAppointmentResult, writeOdooAppointmentDecision,
} = require('./services/odooService');
const { sendOdooStatusWebhook, shouldUseWebhook } = require('./services/odooWebhookService');
const { assertOutboundLineIdentity } = require('./services/odooLineIdentity');
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

  // Validate old queued line IDs before any external status/line write.
  if (['Loaded', 'Arrived'].includes(status)) assertOutboundLineIdentity(payload);
  if (shouldUseWebhook(status)) {
    await sendOdooStatusWebhook(payload);
    console.log(`[OutboxWorker] Odoo webhook sync: ${odooRef} → ${status}`);
    return;
  }

  const statusResult = await writeOdooDeliveryStatus(odooRef, status);
  if (statusResult?.status_ignored) {
    console.log(`[OutboxWorker] Ignored older status ${status} for ${odooRef}`);
    return;
  }
  await writeOdooExtendedFields(odooRef, payload);
  if (['Loaded', 'Arrived'].includes(status)) {
    await writeOdooOrderLines(odooRef, payload.order_lines, payload.order_line_model);
  }
  console.log(`[OutboxWorker] Odoo sync: ${odooRef} → ${status}`);
}

// ── A5.3: ORDER_FAILED handler — write Failed status to Odoo ──────────────

async function handleOrderFailed(row) {
  const payload = row.payload || {};
  await triggerOdooFailureNotification(payload);
  if (payload.failure_event_id) await prisma.delivery_failure_events.updateMany({
    where: { id: payload.failure_event_id }, data: { odoo_sync_status: 'synced' },
  });
  console.log(`[OutboxWorker] ORDER_FAILED: Odoo accepted the failure/WhatsApp trigger for ${payload.do_ref || payload.odooRef}`);
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

// ── ORDER_APPROVAL_CANCELLED handler — admin undid an approval ────────────
// FRD §05: the confirmation result carries a status of Confirmed / rejected /
// cancelled / error. A cancelled confirmation clears the appointment fields on
// the Odoo side. Rides on writeOdooExtendedFields, so it carries the same
// still-unconfirmed field names and the ODOO_SEND_EXTENDED_FIELDS gate.

async function handleOrderApprovalCancelled(row) {
  if (!process.env.ODOO_URL) {
    console.log('[OutboxWorker] ODOO_URL not set — skipping ORDER_APPROVAL_CANCELLED:', row.id);
    return;
  }

  const payload = row.payload || {};
  const odooRef = payload.do_ref;
  if (!odooRef) {
    console.log('[OutboxWorker] ORDER_APPROVAL_CANCELLED skipped (no do_ref) for order', payload.ce_hub_order_ref);
    return;
  }

  await writeOdooExtendedFields(odooRef, {
    ...payload,
    scheduled_start: null, scheduled_end: null, driver_name: null, assistant_name: null,
  });
  console.log(`[OutboxWorker] ORDER_APPROVAL_CANCELLED: cleared confirmed appointment for ${odooRef}`);
}

// ── APPOINTMENT_CONFIRMATION handler — FRD INT-04 result to Odoo ──────────
// confirmed (admin approval) / cancelled (approval undone) / rejected.

async function handleAppointmentConfirmation(row) {
  if (!process.env.ODOO_URL) {
    console.log('[OutboxWorker] ODOO_URL not set — skipping APPOINTMENT_CONFIRMATION:', row.id);
    return;
  }

  const payload = row.payload || {};
  if (!payload.do_ref) {
    console.log('[OutboxWorker] APPOINTMENT_CONFIRMATION skipped (no do_ref) for order', payload.cehub_order_id);
    return;
  }

  const written = await writeOdooAppointmentResult(payload.do_ref, payload);
  console.log(`[OutboxWorker] APPOINTMENT_CONFIRMATION: ${payload.confirmation_status} for ${payload.do_ref}${written ? '' : ' (appointment fields not enabled)'}`);
}

// ── APPOINTMENT_CHANGE_DECISION handler — FRD INT-11 decision to Odoo ─────

async function handleAppointmentChangeDecision(row) {
  if (!process.env.ODOO_URL) {
    console.log('[OutboxWorker] ODOO_URL not set — skipping APPOINTMENT_CHANGE_DECISION:', row.id);
    return;
  }

  const payload = row.payload || {};
  if (!payload.do_ref) {
    console.log('[OutboxWorker] APPOINTMENT_CHANGE_DECISION skipped (no do_ref) for request', payload.request_id);
    return;
  }

  const written = await writeOdooAppointmentDecision(payload.do_ref, payload);
  console.log(`[OutboxWorker] APPOINTMENT_CHANGE_DECISION: ${payload.action} ${payload.decision} for ${payload.do_ref}${written ? '' : ' (appointment fields not enabled)'}`);
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
// Internal run audit only. Fallback does not trigger customer notifications.
async function handleFallbackPollComplete(row) {
  const { date, run_id, status, synced_dos = [], skipped_dos = [], failed_dos = [] } = row.payload || {};
  console.log('[OutboxWorker] FALLBACK_POLL_COMPLETE:', run_id || row.id, date, status || 'legacy',
    'synced:', synced_dos.length, 'skipped:', skipped_dos.length, 'failed:', failed_dos.length);
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
    case 'ORDER_APPROVAL_CANCELLED':
      return handleOrderApprovalCancelled(row);
    case 'APPOINTMENT_CONFIRMATION':
      return handleAppointmentConfirmation(row);
    case 'APPOINTMENT_CHANGE_DECISION':
      return handleAppointmentChangeDecision(row);
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
      if (row.payload?.preview_only || row.idempotency_key?.startsWith('sync_preview:') || (row.payload?.do_ref || row.payload?.odooRef || '').startsWith('SYNC-DEMO-')) continue;
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
