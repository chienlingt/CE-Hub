// server/integrationOutboxCron.js
//
// Integration Outbox Worker (A.3.2a)
//
// Runs every minute and processes pending rows from integration_outbox.
// Dispatches each row to the appropriate handler based on event_type / target.
// On success → marks processed. On failure → increments attempts and schedules retry.
//
// Handlers:
//   target: 'odoo'          — SLOT_STATUS_CHANGED → writeOdooDeliveryStatus
//   target: 'notification'  — CUSTOMER_ON_THE_WAY → WhatsApp + email
//   target: 'internal'      — SLOT_DEPARTED / SLOT_ENDED → no-op (logging only)

const { writeOdooDeliveryStatus } = require('./services/odooService');
const {
  fetchPendingBatch,
  markProcessed,
  recordFailure,
} = require('./services/integrationOutboxService');

const prisma = require('./prismaClient');

let _running = false; // prevent overlapping runs

// ── Odoo handler ─────────────────────────────────────────────────────────────

async function handleOdoo(row) {
  if (!process.env.ODOO_URL) {
    console.log('[OutboxWorker] ODOO_URL not set — skipping Odoo event:', row.event_type);
    return;
  }

  const { odooRef, status } = row.payload || {};
  if (!odooRef) {
    console.warn('[OutboxWorker] Odoo row missing odooRef — marking dead:', row.id);
    throw new Error('Missing odooRef in payload');
  }

  await writeOdooDeliveryStatus(odooRef, status);
  console.log(`[OutboxWorker] Odoo sync: ${odooRef} → ${status}`);
}

// ── Customer notification handler ─────────────────────────────────────────────

async function handleCustomerOnTheWay(row) {
  const { orderId, phone, email, customerName, slotDate, timeWindowStart, timeWindowEnd } = row.payload || {};

  const now = new Date();

  // Build message from system_settings templates (falls back to defaults)
  const templateRow = await prisma.system_settings.findUnique({
    where: { setting_key: 'template_on_the_way' },
  });

  const timeWindow = (timeWindowStart && timeWindowEnd)
    ? `${timeWindowStart} – ${timeWindowEnd}`
    : 'your scheduled time window';

  const defaultMessage =
    `Hi ${customerName || 'there'}, your delivery is on its way! ` +
    `It is scheduled for ${slotDate || 'today'} between ${timeWindow}. ` +
    `Our team will be with you shortly.`;

  let message = templateRow?.setting_value
    ? templateRow.setting_value
        .replace('{customerName}', customerName || 'there')
        .replace('{slotDate}',    slotDate      || 'today')
        .replace('{timeWindow}',  timeWindow)
    : defaultMessage;

  const errors = [];

  // WhatsApp via Green API
  if (phone) {
    try {
      const { sendWhatsAppMessage } = require('./services/whatsappService');
      await sendWhatsAppMessage(phone, message);
      console.log(`[OutboxWorker] On-the-way WhatsApp sent → ${phone}`);
    } catch (e) {
      console.warn(`[OutboxWorker] On-the-way WhatsApp failed for ${phone}:`, e.message);
      errors.push(`WhatsApp: ${e.message}`);
    }
  }

  // Email
  if (email) {
    try {
      const { sendEmail } = require('./services/emailService');
      await sendEmail({
        to:      email,
        subject: `Your delivery is on its way${slotDate ? ` — ${slotDate}` : ''}`,
        text:    message,
        html:    `<p>${message.replace(/\n/g, '<br>')}</p>`,
      });
      console.log(`[OutboxWorker] On-the-way email sent → ${email}`);
    } catch (e) {
      console.warn(`[OutboxWorker] On-the-way email failed for ${email}:`, e.message);
      errors.push(`Email: ${e.message}`);
    }
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

  // If both channels failed, surface the error so the row gets retried
  if (!phone && !email) {
    throw new Error('No phone or email for customer — cannot notify');
  }

  if (errors.length === 2) {
    throw new Error(errors.join('; '));
  }
}

// ── D-1 reminder handler ──────────────────────────────────────────────────────

async function handleD1Reminder(row) {
  const { orderId, phone, email, customerName, slotDate, timeWindowStart, timeWindowEnd } = row.payload || {};

  const now = new Date();
  const templateRow = await prisma.system_settings.findUnique({
    where: { setting_key: 'template_d1_reminder' },
  });

  const timeWindow = (timeWindowStart && timeWindowEnd)
    ? `${timeWindowStart} – ${timeWindowEnd}`
    : 'your scheduled time window';

  const defaultMessage =
    `Hi ${customerName || 'there'}, this is a reminder that your delivery is scheduled for ` +
    `tomorrow (${slotDate || 'tomorrow'}) between ${timeWindow}. ` +
    `Please ensure someone is available to receive it.`;

  let message = templateRow?.setting_value
    ? templateRow.setting_value
        .replace('{customerName}', customerName || 'there')
        .replace('{slotDate}',    slotDate      || 'tomorrow')
        .replace('{timeWindow}',  timeWindow)
    : defaultMessage;

  const errors = [];

  if (phone) {
    try {
      const { sendWhatsAppMessage } = require('./services/whatsappService');
      await sendWhatsAppMessage(phone, message);
      console.log(`[OutboxWorker] D-1 WhatsApp sent → ${phone}`);
    } catch (e) {
      errors.push(`WhatsApp: ${e.message}`);
    }
  }

  if (email) {
    try {
      const { sendEmail } = require('./services/emailService');
      await sendEmail({
        to:      email,
        subject: `Delivery reminder — ${slotDate || 'tomorrow'}`,
        text:    message,
        html:    `<p>${message.replace(/\n/g, '<br>')}</p>`,
      });
      console.log(`[OutboxWorker] D-1 email sent → ${email}`);
    } catch (e) {
      errors.push(`Email: ${e.message}`);
    }
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

  if (!phone && !email) throw new Error('No phone or email — cannot send reminder');
  if (errors.length === 2) throw new Error(errors.join('; '));
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
    case 'CUSTOMER_ON_THE_WAY':
      return handleCustomerOnTheWay(row);
    case 'CUSTOMER_D1_REMINDER':
      return handleD1Reminder(row);
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
