// server/index.js
// Main Express server - mounts all route modules
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const prisma = require('./prismaClient');

const app = express();

app.use(helmet());
// CORS configuration - allows frontend to access API
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

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
app.use('/api/scheduler', require('./routes/scheduler'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/installers', require('./routes/installers'));
app.use('/api/outlets', require('./routes/outlets'));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({ ok: true, time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
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

  // Initialize scheduler cron job
  const { initializeSchedulerCron } = require('./schedulerCron');
  await initializeSchedulerCron();
});

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
