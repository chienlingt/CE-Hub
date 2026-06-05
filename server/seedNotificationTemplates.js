// server/seedNotificationTemplates.js
//
// A.3.3a: Seeds notification message templates + config keys into system_settings.
// Run once: node seedNotificationTemplates.js
// Or call seedA3Templates() on startup to idempotently ensure keys exist.
//
// Template placeholders:
//   {customerName}  — customer full_name
//   {slotDate}      — e.g. "2025-11-25"
//   {timeWindow}    — e.g. "09:00 – 12:00"

const prisma = require('./prismaClient');

const A3_SETTINGS = [
  {
    key:   'template_on_the_way',
    value: 'Hi {customerName}, your delivery is on its way! It is scheduled for {slotDate} between {timeWindow}. Our team will be with you shortly. Thank you for choosing us!',
    description: 'WhatsApp/email body for CUSTOMER_ON_THE_WAY notification. Placeholders: {customerName}, {slotDate}, {timeWindow}.',
  },
  {
    key:   'template_d1_reminder',
    value: 'Hi {customerName}, this is a friendly reminder that your delivery is scheduled for tomorrow ({slotDate}) between {timeWindow}. Please ensure someone is available to receive it.',
    description: 'WhatsApp/email body for the D-1 reminder. Placeholders: {customerName}, {slotDate}, {timeWindow}.',
  },
  {
    key:   'notification_from_name',
    value: 'CE Hub Logistics',
    description: 'Sender display name used in customer notification emails.',
  },
  {
    key:   'outbox_max_attempts',
    value: '8',
    description: 'Maximum retry attempts for outbox rows before they are marked dead.',
  },
];

async function seedA3Templates() {
  for (const setting of A3_SETTINGS) {
    await prisma.system_settings.upsert({
      where:  { setting_key: setting.key },
      create: {
        setting_key:   setting.key,
        setting_value: setting.value,
        description:   setting.description,
      },
      update: {}, // Do not overwrite admin-customised values on subsequent startups
    });
  }
  console.log('[A.3] Notification templates seeded into system_settings.');
}

// Allow running standalone: node seedNotificationTemplates.js
if (require.main === module) {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });

  seedA3Templates()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedA3Templates };
