const prisma = require('../prismaClient');
const axios  = require('axios');

// ── Provider detection ────────────────────────────────────────────────────────
// Set WHATSAPP_PROVIDER=callmebot in .env to use CallMeBot (free, no opt-in for sender)
// Leave blank or set to 'twilio' to use Twilio sandbox/production
function getProvider() {
  return (process.env.WHATSAPP_PROVIDER || 'twilio').toLowerCase();
}

// ── CallMeBot sender ──────────────────────────────────────────────────────────
// Free — recipient must activate once at https://www.callmebot.com/blog/free-api-whatsapp-messages/
// Each recipient gets their own API key by messaging +34 644 22 44 79
// Store keys as: CALLMEBOT_APIKEYS=+60117xxx:123456,+60112xxx:789012
function getCallMeBotApiKey(phone) {
  const normalized = phone.startsWith('+') ? phone : `+60${phone.replace(/^0/, '')}`;
  const raw = process.env.CALLMEBOT_APIKEYS || '';
  if (!raw) return null;
  const map = {};
  raw.split(',').forEach(pair => {
    const [num, key] = pair.trim().split(':');
    if (num && key) map[num.trim()] = key.trim();
  });
  return map[normalized] || null;
}

async function sendViaCallMeBot(phone, body) {
  const normalized = phone.startsWith('+') ? phone : `+60${phone.replace(/^0/, '')}`;
  const apiKey     = getCallMeBotApiKey(phone);

  if (!apiKey) {
    throw new Error(
      `No CallMeBot API key for ${normalized}. ` +
      `Recipient must activate at callmebot.com and add their key to CALLMEBOT_APIKEYS in .env`
    );
  }

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(normalized)}&text=${encodeURIComponent(body)}&apikey=${apiKey}`;
  const res = await axios.get(url, { timeout: 10000 });
  console.log(`[WhatsApp/CallMeBot] Sent to ${normalized}:`, res.data?.substring?.(0, 80));
  return res.data;
}

// ── Green API sender ──────────────────────────────────────────────────────────
// Free tier: 1500 messages/month, no daily limit
// Setup: green-api.com → create instance → scan QR with WhatsApp app
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

  // Green API chatId: strip +, ensure starts with country code, append @c.us
  const digits = phone.replace(/^\+/, '');
  const chatId = `${digits}@c.us`;

  const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;

  console.log(`[WhatsApp/GreenAPI] Sending to ${chatId}...`);

  const res = await axios.post(url, { chatId, message: body }, { timeout: 15000 });

  console.log(`[WhatsApp/GreenAPI] Full response:`, JSON.stringify(res.data));

  // Green API returns { idMessage: "..." } on success
  // or { error: 1, description: "..." } on failure
  if (res.data?.error) {
    throw new Error(`Green API error: ${res.data.description || res.data.error}`);
  }

  if (!res.data?.idMessage) {
    throw new Error(`Green API returned no idMessage. Full response: ${JSON.stringify(res.data)}`);
  }

  console.log(`[WhatsApp/GreenAPI] Sent to ${chatId}: ${res.data.idMessage}`);
  return res.data.idMessage;
}

// ── Twilio sender ─────────────────────────────────────────────────────────────
let twilioClient = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;

  const sid   = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();

  if (!sid || !token) {
    console.warn('[WhatsApp] Twilio credentials not configured.');
    return null;
  }

  try {
    const twilio = require('twilio');
    twilioClient = twilio(sid, token);
    return twilioClient;
  } catch (err) {
    console.warn('[WhatsApp] Twilio package not available:', err.message);
    return null;
  }
}

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
    return setting?.setting_value || 'Hi {customerName}, your delivery for order {orderRef} was unsuccessful. Reason: {reason}. Our team will contact you shortly to reschedule. We apologise for the inconvenience.';
  } catch {
    return 'Hi {customerName}, your delivery for order {orderRef} was unsuccessful. Reason: {reason}. Our team will contact you shortly to reschedule.';
  }
}

/**
 * Send a WhatsApp message to the customer on delivery failure.
 * Silently skipped if:
 *  - WhatsApp is disabled in system settings
 *  - Twilio credentials are not configured
 *  - Customer has no phone number
 *
 * @param {string} toPhone   Customer phone number (e.g. +60123456789)
 * @param {object} data      { customerName, orderRef, reason }
 */
async function sendDeliveryFailureWhatsApp(toPhone, { customerName, orderRef, reason }) {
  if (!toPhone) return;

  const enabled = await isWhatsAppEnabled();
  if (!enabled) return;

  const client = getTwilioClient();
  if (!client) return;

  const from     = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'; // Twilio sandbox default
  const template = await getMessageTemplate();

  const body = template
    .replace('{customerName}', customerName)
    .replace('{orderRef}',     orderRef)
    .replace('{reason}',       reason);

  const normalizedPhone = toPhone.startsWith('+') ? toPhone : `+60${toPhone.replace(/^0/, '')}`;

  try {
    const provider = getProvider();

    if (provider === 'callmebot') {
      await sendViaCallMeBot(normalizedPhone, body);
      return 'callmebot_ok';
    }

    if (provider === 'greenapi') {
      return sendViaGreenApi(normalizedPhone, body);
    }

    // Default: Twilio
    const client = getTwilioClient();
    if (!client) return;

    const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
    const msg  = await client.messages.create({
      from,
      to:   `whatsapp:${normalizedPhone}`,
      body,
    });
    console.log(`[WhatsApp/Twilio] Sent to ${normalizedPhone}: ${msg.sid}`);
    return msg.sid;
  } catch (err) {
    console.warn(`[WhatsApp] Failed to send to ${normalizedPhone}:`, err.message);
  }
}

/**
 * Seed default WhatsApp settings if they don't exist.
 * Call once on server startup.
 */
async function seedWhatsAppSettings() {
  const defaults = [
    {
      setting_key:   'whatsapp_customer_notification_enabled',
      setting_value: 'false',
      description:   'Send WhatsApp message to customer on delivery failure (true/false)',
    },
    {
      setting_key:   'whatsapp_failure_message_template',
      setting_value: 'Hi {customerName}, your delivery for order {orderRef} was unsuccessful. Reason: {reason}. Our team will contact you shortly to reschedule. We apologise for the inconvenience.',
      description:   'WhatsApp message template for delivery failure. Placeholders: {customerName} {orderRef} {reason}',
    },
    {
      setting_key:   'admin_notification_email',
      setting_value: 'chienlingtan@gmail.com',
      description:   'Always send failure notification emails to this address regardless of DB admin accounts',
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

/**
 * Send a WhatsApp message directly — bypasses the enabled toggle.
 * Use this for manual sends triggered by admin action.
 */
async function sendWhatsAppDirect(phone, message) {
  if (!phone) throw new Error('Phone number is required');

  const normalizedPhone = phone.startsWith('+') ? phone : `+60${phone.replace(/^0/, '')}`;
  const provider = getProvider();

  if (provider === 'callmebot') {
    return sendViaCallMeBot(normalizedPhone, message);
  }
  if (provider === 'greenapi') {
    return sendViaGreenApi(normalizedPhone, message);
  }

  // Twilio
  const client = getTwilioClient();
  if (!client) throw new Error('Twilio not configured');
  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  const msg  = await client.messages.create({
    from,
    to:   `whatsapp:${normalizedPhone}`,
    body: message,
  });
  return msg.sid;
}

module.exports = { sendDeliveryFailureWhatsApp, sendWhatsAppDirect, seedWhatsAppSettings };
