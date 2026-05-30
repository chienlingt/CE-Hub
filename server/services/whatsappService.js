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

async function getMessageTemplate() {
  try {
    const setting = await prisma.system_settings.findUnique({
      where: { setting_key: 'whatsapp_failure_message_template' },
    });
    return setting?.setting_value
      || 'Hi {customerName}, your delivery for order {orderRef} was unsuccessful. Reason: {reason}. Our team will contact you shortly to reschedule. We apologise for the inconvenience.';
  } catch {
    return 'Hi {customerName}, your delivery for order {orderRef} was unsuccessful. Reason: {reason}. Our team will contact you shortly to reschedule.';
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Automatic send — respects the admin toggle setting.
 * Used by notificationService when a delivery failure is reported.
 */
async function sendDeliveryFailureWhatsApp(toPhone, { customerName, orderRef, reason }) {
  if (!toPhone) return;

  const normalizedPhone = toPhone.startsWith('+')
    ? toPhone
    : `+60${toPhone.replace(/^0/, '')}`;

  const template = await getMessageTemplate();
  const body = template
    .replace('{customerName}', customerName)
    .replace('{orderRef}',     orderRef)
    .replace('{reason}',       reason);

  try {
    return await sendViaGreenApi(normalizedPhone, body);
  } catch (err) {
    console.warn('[WhatsApp] Auto-send failed (non-fatal):', err.message);
  }
}

/**
 * Direct send — bypasses the toggle. Used for manual admin-triggered sends.
 */
async function sendWhatsAppDirect(phone, message) {
  if (!phone) throw new Error('Phone number is required');

  const normalized = phone.startsWith('+')
    ? phone
    : `+60${phone.replace(/^0/, '')}`;

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
      description:   'WhatsApp message template for delivery failure. Placeholders: {customerName} {orderRef} {reason}',
    },
    {
      setting_key:   'internal_email_notification_enabled',
      setting_value: 'true',
      description:   'Send internal failure email to admin employees (true/false)',
    },
    {
      setting_key:   'customer_email_notification_enabled',
      setting_value: 'true',
      description:   'Send failure email to customer (true/false)',
    },
    {
      setting_key:   'admin_email_recipients',
      setting_value: '[]',
      description:   'JSON array of admin employee IDs enabled to receive failure emails. Empty = all admins.',
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
  sendWhatsAppDirect,
  seedWhatsAppSettings,
};
