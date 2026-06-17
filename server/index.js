// server/index.js
// Main Express server - mounts all route modules
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const prisma = require('./prismaClient');

const uploadsRoot = path.join(__dirname, 'uploads');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
// CORS configuration - allows frontend to access API
const defaultOrigin = process.env.CLIENT_URL || 'https://lab2.tbm2u.net';
const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === defaultOrigin || localOriginPattern.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());

// Serve uploaded POD / issue evidence files.
// Allow cross-origin embedding so <img> thumbnails work when the React app
// (e.g. :3000) and API (:4000) run on different origins during local dev.
function sniffImageMime(filePath) {
  try {
    const head = fs.readFileSync(filePath, { encoding: null }).subarray(0, 12);
    if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
      return 'image/jpeg';
    }
    if (head.length >= 8 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') {
      return 'image/webp';
    }
    if (head.length >= 8 && head.toString('ascii', 0, 8) === '\x89PNG\r\n\x1a\n') {
      return 'image/png';
    }
  } catch {
    // fall through — sendFile will guess from extension
  }
  return null;
}

function sendUploadFile(res, filePath) {
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  const mime = sniffImageMime(filePath);
  if (mime) res.type(mime);
  return res.sendFile(filePath);
}

app.use('/uploads', (req, res, next) => {
  const rel = req.path.replace(/^\/+/, '');
  const primary = path.join(uploadsRoot, rel);
  if (fs.existsSync(primary)) {
    return sendUploadFile(res, primary);
  }
  // Back-compat: issue photos saved under status/ before upload path fix
  const legacy = rel.match(/^orders\/del\/report\/([^/]+)\/(.+)$/);
  if (legacy) {
    const alt = path.join(uploadsRoot, 'orders', 'del', 'status', legacy[1], legacy[2]);
    if (fs.existsSync(alt)) {
      return sendUploadFile(res, alt);
    }
  }
  next();
});

// Mount route modules
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/trucks', require('./routes/trucks'));
app.use('/api/zones', require('./routes/zones'));
app.use('/api/truck-zones', require('./routes/truck-zones'));
app.use('/api/buildings', require('./routes/buildings'));
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/time-slots', require('./routes/time-slots'));
app.use('/api/lorry-trips', require('./routes/lorry-trips'));
app.use('/api/order-products', require('./routes/order-products'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/order-issues', require('./routes/order-issues'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/scheduler', require('./routes/scheduler'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/installers', require('./routes/installers'));
app.use('/api/outlets', require('./routes/outlets'));
app.use('/api/webhooks',      require('./routes/webhooks'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/driver',        require('./routes/driver'));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({ ok: true, time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  // Log the error stack for debugging purposes
  console.error(err.stack);

  // Send a standardized, generic error response to the client
  // Avoids leaking implementation details
  res.status(500).json({
    success: false,
    message: 'An internal server error occurred. Please try again later.'
  });
});

// Start server
const port = process.env.PORT || 4000;
app.listen(port, async () => {
  console.log(`\nServer listening on http://localhost:${port}`);
  // console.log('\nMounted routes:');
  // console.log('  /api/auth');
  // console.log('  /api/employees');
  // console.log('  /api/roles');
  // console.log('  /api/teams');
  // console.log('  /api/assignments');
  // console.log('  /api/trucks');
  // console.log('  /api/zones');
  // console.log('  /api/truck-zones');
  // console.log('  /api/buildings');
  // console.log('  /api/products');
  // console.log('  /api/customers');
  // console.log('  /api/orders');
  // console.log('  /api/time-slots');
  // console.log('  /api/lorry-trips');
  // console.log('  /api/order-products');
  // console.log('  /api/reports');
  // console.log('  /api/scheduler');
  // console.log('  /api/health\n');

  // Seed default WhatsApp notification settings
  try {
    const { seedWhatsAppSettings } = require('./services/whatsappService');
    await seedWhatsAppSettings();
  } catch (e) {
    console.warn('[Startup] seedWhatsAppSettings skipped — DB unreachable:', e.message);
  }

  // Seed notification message templates (idempotent — never overwrites existing)
  try {
    const { seedA3Templates } = require('./seedNotificationTemplates');
    await seedA3Templates();
  } catch (e) {
    console.warn('[Startup] seedA3Templates skipped — DB unreachable:', e.message);
  }

  // Initialize scheduler cron job
  try {
    const { initializeSchedulerCron } = require('./schedulerCron');
    await initializeSchedulerCron();
  } catch (e) {
    console.warn('[Startup] initializeSchedulerCron skipped — DB unreachable:', e.message);
  }

  // A1.4 — Odoo polling fallback (daily at 5PM MYT — catches any orders missed by manual push)
  if (process.env.ODOO_URL) {
    const cron = require('node-cron');
    const { syncOrdersFromOdoo } = require('./services/odooSyncService');
    cron.schedule('0 17 * * *', () => {
      console.log('[OdooSync] Running daily 5PM sync check...');
      syncOrdersFromOdoo();
    }, { timezone: 'Asia/Kuala_Lumpur' });
    console.log('[OdooSync] Polling cron registered — daily at 5PM MYT.');
  }

  // A.3.2a: Integration outbox worker — flushes pending outbox rows every minute
  {
    const cron = require('node-cron');
    const { runOutboxWorker } = require('./integrationOutboxCron');
    cron.schedule('* * * * *', () => { runOutboxWorker(); }, { timezone: 'Asia/Kuala_Lumpur' });
    console.log('[OutboxWorker] Cron registered — every minute.');
  }

  // A.3.3: D-1 delivery reminder — nightly at 07:00 MYT (configurable via D1_REMINDER_CRON)
  {
    const cron = require('node-cron');
    const { runD1ReminderCron } = require('./d1ReminderCron');
    const reminderSchedule = process.env.D1_REMINDER_CRON || '0 19 * * *';
    cron.schedule(reminderSchedule, () => { runD1ReminderCron(); }, { timezone: 'Asia/Kuala_Lumpur' });
    console.log(`[D1Reminder] Cron registered — ${reminderSchedule} MYT.`);
  }
});

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
