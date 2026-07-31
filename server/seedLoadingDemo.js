// server/seedLoadingDemo.js
//
// Seeds a single loading-demo order for 28 July 2026, slot 09:00–12:00.
// Represents an order that has arrived at the warehouse and is READY FOR
// DRIVER LOADING — picking_status is 'pending' for all items.
//
// Two items:
//   1. LG Fridge   — assigned_serial = 'FRIDGE-SN-001'
//                    Driver MUST scan exactly this serial to load
//   2. IKEA Sofa   — assigned_serial = null
//                    Any scanned serial is accepted and recorded
//
// Reuses the driver / admin accounts from seedDriverTestData.js.
// Safe to re-run — cleans up previous DEMO-LOAD rows first.
//
// Usage:
//   node seedLoadingDemo.js
//   npm run seed:loading

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const prisma = require('./prismaClient');

const DEMO_PREFIX  = 'DEMO-LOAD';
const SLOT_DATE    = '2026-07-28';
const DRIVER_EMAIL = 'driver.test@cehub.local';
const ADMIN_EMAIL  = 'admin.test@cehub.local';

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanup() {
  const orders = await prisma.orders.findMany({
    where:  { odoo_order_ref: { startsWith: DEMO_PREFIX } },
    select: { id: true, time_slot_id: true },
  });

  const orderIds = orders.map(o => o.id);
  const slotIds  = [...new Set(orders.map(o => o.time_slot_id).filter(Boolean))];

  if (orderIds.length) {
    await prisma.order_products.deleteMany({ where: { order_id: { in: orderIds } } });
    await prisma.orders.deleteMany({ where: { id: { in: orderIds } } });
  }

  for (const sid of slotIds) {
    await prisma.lorry_trips.deleteMany({ where: { time_slot_id: sid } }).catch(() => {});
    await prisma.time_slots.deleteMany({ where: { id: sid } }).catch(() => {});
  }

  console.log(`[seed] Cleaned ${orderIds.length} prior DEMO-LOAD order(s)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Loading Demo Seed ===\n');

  await cleanup();

  // ── Resolve existing accounts from driver seed ────────────────────────────
  const driver = await prisma.employees.findFirst({ where: { email: DRIVER_EMAIL } });
  if (!driver) {
    throw new Error(
      `Driver account not found (${DRIVER_EMAIL}).\n` +
      `Run seedDriverTestData.js first:  npm run seed:driver`
    );
  }

  const admin = await prisma.employees.findFirst({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    throw new Error(
      `Admin account not found (${ADMIN_EMAIL}).\n` +
      `Run seedDriverTestData.js first:  npm run seed:driver`
    );
  }

  // ── Pick any available delivery team ─────────────────────────────────────
  const team = await prisma.teams.findFirst({ where: { available_flag: true } });
  if (!team) throw new Error('No active team found — run seedDriverTestData.js first');

  // ── Pick any truck (or null — slot still works without one) ──────────────
  const truck = await prisma.trucks.findFirst();

  // ── Products ──────────────────────────────────────────────────────────────
  const fridge = await prisma.products.findFirst({
    where: { product_name: 'LG GT-B372SLCN 372L Top Freezer Fridge' },
  }) ?? await prisma.products.create({
    data: {
      product_name:                 'LG GT-B372SLCN 372L Top Freezer Fridge',
      installer_team_required_flag: false,
      fragile_flag:                 false,
      available_flag:               true,
      package_length_cm:            70,
      package_width_cm:             70,
      package_height_cm:            170,
    },
  });

  const sofa = await prisma.products.findFirst({
    where: { product_name: 'IKEA EKTORP 3-Seat Sofa' },
  }) ?? await prisma.products.create({
    data: {
      product_name:                 'IKEA EKTORP 3-Seat Sofa',
      installer_team_required_flag: false,
      fragile_flag:                 false,
      available_flag:               true,
      package_length_cm:            220,
      package_width_cm:             95,
      package_height_cm:            85,
    },
  });

  // ── Customer ──────────────────────────────────────────────────────────────
  const customer = await prisma.customers.findFirst({ where: { phone: '601156751977' } })
    ?? await prisma.customers.create({
      data: {
        full_name: 'Ben Tan',
        phone:     '601156751977',
        email:     'ben.tan@demo.local',
        address:   '12 Jalan SS2/24, Petaling Jaya',
        city:      'Petaling Jaya',
        postcode:  '47300',
        state:     'Selangor',
      },
    });

  // ── Time slot: 28 July 2026, 09:00–12:00 ─────────────────────────────────
  const slot = await prisma.time_slots.create({
    data: {
      date:               SLOT_DATE,
      time_window_start:  '09:00',
      time_window_end:    '12:00',
      delivery_team_id:   team.id,
      truck_id:           truck?.id ?? null,
      slot_status:        'scheduled',
      available_flag:     true,
      created_at:         new Date(),
    },
  });
  console.log(`[seed] Slot: ${SLOT_DATE} 09:00–12:00  (id: ${slot.id})`);
  if (truck) console.log(`[seed] Truck assigned: ${truck.plate_no}`);

  // ── Order ─────────────────────────────────────────────────────────────────
  const order = await prisma.orders.create({
    data: {
      odoo_order_ref:            `${DEMO_PREFIX}-001`,
      odoo_sales_ref:            'SO-DEMO-LOAD-001',
      order_status:              'Scheduled',
      employee_id:               driver.id,
      customer_id:               customer.id,
      time_slot_id:              slot.id,
      scheduled_start_date_time: new Date(`${SLOT_DATE}T09:00:00+08:00`),
      scheduled_end_date_time:   new Date(`${SLOT_DATE}T12:00:00+08:00`),
      delivery_address:          customer.address,
      delivery_city:             customer.city,
      delivery_postcode:         customer.postcode,
      delivery_state:            customer.state,
      delivery_notes:            '[LOAD DEMO] Fridge (serial enforced) + Sofa (any scan)',
      assignment_status:         'approved',
      salesperson_name:          'Ahmad bin Sales',
      salesperson_phone:         '601156751977',
      created_at:                new Date(),
      updated_at:                new Date(),
    },
  });
  console.log(`[seed] Order: ${order.odoo_order_ref}  (id: ${order.id})`);

  // ── Item 1: Fridge — assigned_serial enforced ─────────────────────────────
  await prisma.order_products.create({
    data: {
      order_id:        order.id,
      product_id:      fridge.id,
      quantity:        1,
      picking_status:  'pending',
      assigned_serial: 'FRIDGE-SN-010',
      service_type:    'delivery_only',
    },
  });
  console.log(`[seed] Item 1: ${fridge.product_name}  assigned_serial=FRIDGE-SN-001`);

  // ── Item 2: Sofa — no assigned_serial (any scan accepted) ─────────────────
  await prisma.order_products.create({
    data: {
      order_id:        order.id,
      product_id:      sofa.id,
      quantity:        1,
      picking_status:  'pending',
      assigned_serial: null,
      service_type:    'delivery_only',
    },
  });
  console.log(`[seed] Item 2: ${sofa.product_name}  assigned_serial=(none — any serial accepted)`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log('  Order ref   :  DEMO-LOAD-001');
  console.log(`  Date / slot :  ${SLOT_DATE}  09:00–12:00`);
  console.log(`  Status      :  Scheduled  (ready for driver loading)`);
  console.log(`  Driver      :  ${DRIVER_EMAIL}  /  Driver@123`);
  console.log(`  Customer    :  ${customer.full_name}  (${customer.phone})`);
  console.log('');
  console.log('  Item 1  LG GT-B372SLCN Fridge');
  console.log('          assigned_serial = FRIDGE-SN-001');
  console.log('          → Scan Station (Loading) must receive exactly "FRIDGE-SN-001"');
  console.log('          → Wrong serial → red mismatch error, status stays Pending');
  console.log('');
  console.log('  Item 2  IKEA EKTORP Sofa');
  console.log('          assigned_serial = (none)');
  console.log('          → Scan any barcode/QR or type a serial — it is recorded as loaded_serial');
  console.log('');
  console.log('  Flow to test:');
  console.log('  1. Log in as driver  →  Scan Station  →  Loading tab  →  date 28 Jul');
  console.log('  2. Scan "FRIDGE-SN-001" for the fridge, any serial for the sofa');
  console.log('  3. Driver Dashboard  →  28 Jul slot  →  Leave warehouse (depart)');
  console.log('  4. Scan Station  →  Unloading tab  →  scan each item\'s loaded serial');
  console.log('─────────────────────────────────────────\n');
}

main()
  .catch(err => { console.error('\nSeed failed:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
