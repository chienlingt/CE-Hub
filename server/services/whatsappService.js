const prisma = require('../prismaClient');
const axios  = require('axios');

// ── Green API sender ──────────────────────────────────────────────────────────
// Free tier: 1500 messages/month — sign up at green-api.com
// Setup: create instance → scan QR with WhatsApp app → paste credentials in .env

async function sendViaGreenApi(phone, body) {
  const instanceId = process.env.GREEN_API_INSTANCE?.trim();
  const token      = process.env.GREEN_API_TOKEN?.trim();

  if (!instanceId || !token ||
      instanceId === 'YOUR_INSTANCE_ID' ||
      token      === 'YOUR_INSTANCE_TOKEN') {
    throw new Error(
      'Green API not configured. Add GREEN_API_INSTANCE and GREEN_API_TOKEN to server/.env'
    );
  }

  // Green API chatId: strip +, append @c.us
  const digits = phone.replace(/^\+/, '');
  const chatId = `${digits}@c.us`;

  const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;

  console.log(`[WhatsApp/GreenAPI] Sending to ${chatId}...`);

  const res = await axios.post(url, { chatId, message: body }, { timeout: 15000 });

  console.log(`[WhatsApp/GreenAPI] Full response:`, JSON.stringify(res.data));

  if (res.data?.error) {
    throw new Error(`Green API error: ${res.data.description || res.data.error}`);
  }

  if (!res.data?.idMessage) {
    throw new Error(`Green API returned no idMessage. Response: ${JSON.stringify(res.data)}`);
  }

  console.log(`[WhatsApp/GreenAPI] Sent to ${chatId}: ${res.data.idMessage}`);
  return res.data.idMessage;
}

// ── Settings helpers ──────────────────────────────────────────────────────────

async function isWhatsAppEnabled() {
  try {
    const setting = await prisma.system_settings.findUnique({
      where: { setting_key: 'whatsapp_customer_notification_enabled' },
    });
    return setting?.setting_value === 'true';
  } catch {
    return false;
  }
}

async function getTemplate(key, fallback) {
  try {
    const setting = await prisma.system_settings.findUnique({ where: { setting_key: key } });
    return setting?.setting_value || fallback;
  } catch {
    return fallback;
  }
}

async function getMessageTemplate() {
  return getTemplate(
    'whatsapp_failure_message_template',
    'Hi {customerName}, your delivery for order {orderRef} was unsuccessful. Reason: {reason}. Our team will contact you shortly to reschedule. We apologise for the inconvenience.'
  );
}

async function isSettingEnabled(key) {
  try {
    const setting = await prisma.system_settings.findUnique({ where: { setting_key: key } });
    return setting?.setting_value !== 'false';
  } catch {
    return true;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Automatic send — respects the admin toggle setting.
 * Used by notificationService when a delivery failure is reported.
 */
function normalizePhone(phone) {
  if (!phone) return null;
  // Remove spaces, dashes, parentheses
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.startsWith('+')) {
    return clean;
  }
  if (clean.startsWith('60')) {
    return `+${clean}`;
  }
  if (clean.startsWith('0')) {
    return `+60${clean.slice(1)}`;
  }
  return `+60${clean}`;
}

async function sendDeliveryFailureWhatsApp(toPhone, { customerName, orderRef, reason }) {
  if (!toPhone) return;
  const template = await getMessageTemplate();
  const body = template
    .replace('{customerName}', customerName || '')
    .replace('{orderRef}',     orderRef     || '')
    .replace('{reason}',       reason       || '');
  try {
    return await sendViaGreenApi(normalizePhone(toPhone), body);
  } catch (err) {
    console.warn('[WhatsApp] Customer send failed (non-fatal):', err.message);
  }
}

async function sendDeliveryFailureSalespersonWhatsApp(toPhone, { customerName, customerPhone, orderRef, reason, driverName, address, recipientName }) {
  if (!toPhone) return;
  const enabled = await isSettingEnabled('whatsapp_salesperson_notification_enabled');
  if (!enabled) return;

  const template = await getTemplate(
    'whatsapp_failure_salesperson_template',
    'Hi {recipientName}, delivery failed for order {orderRef}. Customer: {customerName} ({customerPhone}), Address: {address}. Driver: {driverName}. Reason: {reason}.'
  );
  const body = template
    .replace('{recipientName}',  recipientName  || 'Salesperson')
    .replace('{customerName}',   customerName   || '')
    .replace('{customerPhone}',  customerPhone  || 'N/A')
    .replace('{orderRef}',       orderRef       || '')
    .replace('{reason}',         reason         || '')
    .replace('{driverName}',     driverName     || '')
    .replace('{address}',        address        || '');
  try {
    return await sendViaGreenApi(normalizePhone(toPhone), body);
  } catch (err) {
    console.warn('[WhatsApp] Salesperson send failed (non-fatal):', err.message);
  }
}

async function sendDeliveryFailureAdminWhatsApp(toPhone, { adminName, customerName, orderRef, reason, driverName, address, salespersonName, salespersonPhone }) {
  if (!toPhone) return;
  const template = await getTemplate(
    'whatsapp_failure_admin_template',
    'Hi {adminName}, delivery failed — Order {orderRef}. Customer: {customerName}, Address: {address}. Driver: {driverName}. Reason: {reason}. Salesperson: {salespersonName} ({salespersonPhone}).'
  );
  const body = template
    .replace('{adminName}',       adminName       || 'Admin')
    .replace('{customerName}',    customerName    || '')
    .replace('{orderRef}',        orderRef        || '')
    .replace('{reason}',          reason          || '')
    .replace('{driverName}',      driverName      || '')
    .replace('{address}',         address         || '')
    .replace('{salespersonName}',  salespersonName  || 'N/A')
    .replace('{salespersonPhone}', salespersonPhone || 'N/A');
  try {
    return await sendViaGreenApi(normalizePhone(toPhone), body);
  } catch (err) {
    console.warn('[WhatsApp] Admin send failed (non-fatal):', err.message);
  }
}

/**
 * Generic send for A.3 outbox worker (on-the-way / D-1 notifications).
 * Always sends when Green API is configured — no admin toggle check.
 */
async function sendWhatsAppMessage(phone, message) {
  return sendWhatsAppDirect(phone, message);
}

/**
 * Direct send — bypasses the toggle. Used for manual admin-triggered sends.
 */
async function sendWhatsAppDirect(phone, message) {
  if (!phone) throw new Error('Phone number is required');
  const normalized = normalizePhone(phone);
  return sendViaGreenApi(normalized, message);
}

/**
 * Seed default WhatsApp settings into system_settings if not already present.
 */
async function seedWhatsAppSettings() {
  const defaults = [
    {
      setting_key:   'whatsapp_failure_message_template',
      setting_value: 'Hi {customerName}, your delivery for order {orderRef} was unsuccessful. Reason: {reason}. Our team will contact you shortly to reschedule. We apologise for the inconvenience.',
      description:   'WhatsApp template for customer on delivery failure. Placeholders: {customerName} {orderRef} {reason}',
    },
    {
      setting_key:   'whatsapp_salesperson_notification_enabled',
      setting_value: 'true',
      description:   'Send failure WhatsApp to salesperson in charge (true/false)',
    },
    {
      setting_key:   'whatsapp_failure_salesperson_template',
      setting_value: 'Hi {recipientName}, delivery failed for order {orderRef}. Customer: {customerName} ({customerPhone}), Address: {address}. Driver: {driverName}. Reason: {reason}.',
      description:   'WhatsApp template for salesperson on delivery failure. Placeholders: {recipientName} {customerName} {customerPhone} {orderRef} {reason} {driverName} {address}',
    },
    {
      setting_key:   'whatsapp_admin_notification_enabled',
      setting_value: 'true',
      description:   'Send failure WhatsApp to admin employees (true/false)',
    },
    {
      setting_key:   'whatsapp_failure_admin_template',
      setting_value: 'Hi {adminName}, delivery failed — Order {orderRef}. Customer: {customerName}, Address: {address}. Driver: {driverName}. Reason: {reason}. Salesperson: {salespersonName} ({salespersonPhone}).',
      description:   'WhatsApp template for admin on delivery failure. Placeholders: {adminName} {customerName} {orderRef} {reason} {driverName} {address} {salespersonName} {salespersonPhone}',
    },
    {
      setting_key:   'whatsapp_admin_recipients',
      setting_value: '[]',
      description:   'JSON array of admin employee IDs enabled for WhatsApp. Empty = all admins.',
    },
    {
      setting_key:   'failure_require_photo',
      setting_value: 'true',
      description:   'A5.2 — Require at least one evidence photo on driver failure confirmation (true/false)',
    },
    {
      setting_key:   'failure_require_remark',
      setting_value: 'true',
      description:   'A5.2 — Require a non-empty issue_desc remark on driver failure confirmation (true/false)',
    },
  ];

  for (const s of defaults) {
    await prisma.system_settings.upsert({
      where:  { setting_key: s.setting_key },
      create: s,
      update: {},
    });
  }
}

module.exports = {
  sendDeliveryFailureWhatsApp,
  sendDeliveryFailureSalespersonWhatsApp,
  sendDeliveryFailureAdminWhatsApp,
  sendWhatsAppDirect,
  sendWhatsAppMessage,
  seedWhatsAppSettings,
  isSettingEnabled,
  normalizePhone,
};
