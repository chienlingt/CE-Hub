// server/seedNotificationTemplates.js
//
// A.3.3a: Seeds notification message templates + config keys into system_settings.
// Run once: node seedNotificationTemplates.js
// Or call seedA3Templates() on startup to idempotently ensure keys exist.
//
// Template placeholders:
//   {customerName}  — customer full_name
//   {orderRef}      — Odoo order ref (fallback: short order ID)
//   {slotDate}      — e.g. "2025-11-25"
//   {timeWindow}    — e.g. "09:00 - 12:00"
//   {address}       — delivery address
//   {brandName}     — from notification_from_name

const prisma = require('./prismaClient');

const A3_SETTINGS = [
  {
    key:   'template_on_the_way',
    value: 'Dear {customerName}, this is {brandName} regarding your delivery for order {orderRef}. Your order is on its way and scheduled for {slotDate} between {timeWindow} at {address}. Our team will be with you shortly.',
    description: 'WhatsApp/email body for CUSTOMER_ON_THE_WAY notification. Placeholders: {customerName}, {orderRef}, {slotDate}, {timeWindow}, {address}, {brandName}.',
  },
  {
    key:   'template_d1_reminder',
    value: 'Dear {customerName}, this is {brandName} with a reminder that your delivery for order {orderRef} is scheduled for tomorrow ({slotDate}) between {timeWindow} at {address}. Please ensure someone is available to receive it.',
    description: 'WhatsApp/email body for the D-1 reminder. Placeholders: {customerName}, {orderRef}, {slotDate}, {timeWindow}, {address}, {brandName}.',
  },
  {
    key:   'notification_from_name',
    value: 'TBM Delivery',
    description: 'Sender display name used in customer notification emails.',
  },
  {
    key:   'customer_on_the_way_notification_enabled',
    value: 'true',
    description: 'Master toggle for CUSTOMER_ON_THE_WAY notifications.',
  },
  {
    key:   'customer_d1_reminder_notification_enabled',
    value: 'true',
    description: 'Master toggle for CUSTOMER_D1_REMINDER notifications.',
  },
  {
    key:   'subject_on_the_way',
    value: 'Your delivery is on its way - Order {orderRef}',
    description: 'Email subject for CUSTOMER_ON_THE_WAY notifications. Placeholders: {customerName}, {orderRef}, {slotDate}, {timeWindow}, {address}, {brandName}.',
  },
  {
    key:   'subject_d1_reminder',
    value: 'Delivery reminder - Order {orderRef} on {slotDate}',
    description: 'Email subject for CUSTOMER_D1_REMINDER notifications. Placeholders: {customerName}, {orderRef}, {slotDate}, {timeWindow}, {address}, {brandName}.',
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
