// server/seedNotificationTemplates.js
//
// Seeds the notification settings the outbox worker needs into system_settings.
// Run once: node seedNotificationTemplates.js
// Or call seedA3Templates() on startup to idempotently ensure keys exist.

const prisma = require('./prismaClient');

const A3_SETTINGS = [
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
  console.log('[A.3] Notification settings seeded into system_settings.');
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
