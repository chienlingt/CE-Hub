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
const { sendEmail } = require('./services/emailService');
const { sendWhatsAppMessage } = require('./services/whatsappService');

const prisma = require('./prismaClient');

let _running = false; // prevent overlapping runs
const DEFAULT_FROM_NAME = 'TBM Delivery';

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
  const {
    orderId,
    phone,
    email,
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
    'subject_on_the_way',
    'notification_from_name',
  ]);

  if (settings.customer_on_the_way_notification_enabled === 'false') {
    console.log('[OutboxWorker] CUSTOMER_ON_THE_WAY disabled via settings - skipping send.');
    return;
  }

  const brandName = settings.notification_from_name || DEFAULT_FROM_NAME;
  const vars = {
    customerName: customerName || 'Customer',
    orderRef: orderRef || orderId?.slice(0, 8).toUpperCase() || 'your order',
    slotDate: slotDate || 'today',
    timeWindow: formatTimeWindow(timeWindowStart, timeWindowEnd),
    address: address || 'your delivery address',
    brandName,
  };

  const defaultMessage = `Dear {customerName}, this is {brandName} regarding your delivery for order {orderRef}. Your order is on its way and scheduled for {slotDate} between {timeWindow} at {address}. Our team will be with you shortly.`;
  const defaultSubject = 'Your delivery is on its way - Order {orderRef}';
  const message = applyTemplate(settings.template_on_the_way || defaultMessage, vars);
  const subject = applyTemplate(settings.subject_on_the_way || defaultSubject, vars);

  const errors = [];

  // WhatsApp via Green API
  if (phone) {
    try {
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
      await sendEmail({
        to: email,
        subject,
        text: message,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
        from: `"${brandName}" <${process.env.EMAIL_USER}>`,
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
  const {
    orderId,
    phone,
    email,
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
    'subject_d1_reminder',
    'notification_from_name',
  ]);

  if (settings.customer_d1_reminder_notification_enabled === 'false') {
    console.log('[OutboxWorker] CUSTOMER_D1_REMINDER disabled via settings - skipping send.');
    return;
  }

  const brandName = settings.notification_from_name || DEFAULT_FROM_NAME;
  const vars = {
    customerName: customerName || 'Customer',
    orderRef: orderRef || orderId?.slice(0, 8).toUpperCase() || 'your order',
    slotDate: slotDate || 'tomorrow',
    timeWindow: formatTimeWindow(timeWindowStart, timeWindowEnd),
    address: address || 'your delivery address',
    brandName,
  };

  const defaultMessage = `Dear {customerName}, this is {brandName} with a reminder that your delivery for order {orderRef} is scheduled for tomorrow ({slotDate}) between {timeWindow} at {address}. Please ensure someone is available to receive it.`;
  const defaultSubject = 'Delivery reminder - Order {orderRef} on {slotDate}';
  const message = applyTemplate(settings.template_d1_reminder || defaultMessage, vars);
  const subject = applyTemplate(settings.subject_d1_reminder || defaultSubject, vars);

  const errors = [];

  if (phone) {
    try {
      await sendWhatsAppMessage(phone, message);
      console.log(`[OutboxWorker] D-1 WhatsApp sent → ${phone}`);
    } catch (e) {
      errors.push(`WhatsApp: ${e.message}`);
    }
  }

  if (email) {
    try {
      await sendEmail({
        to: email,
        subject,
        text: message,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
        from: `"${brandName}" <${process.env.EMAIL_USER}>`,
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
