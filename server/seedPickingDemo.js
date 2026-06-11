// server/seedPickingDemo.js
//
// Seeds a single picking-demo order for 9 June 2026, slot 09:00–12:00.
//
// Two items:
//   1. LG Fridge  — assigned_serial = 'FRIDGE-SN-001'  (storekeeper MUST scan exact match)
//   2. L-Shape Sofa — assigned_serial = null             (any scan accepted)
//
// Usage:  node seedPickingDemo.js
//         npm run seed:picking

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const prisma = require('./prismaClient');

const DEMO_PREFIX  = 'DEMO-PICK';
const SLOT_DATE    = '2026-06-09';
const DRIVER_EMAIL = 'driver.test@cehub.local';
const ADMIN_EMAIL  = 'admin.test@cehub.local';

async function cleanup() {
  const orders = await prisma.orders.findMany({
    where: { odoo_order_ref: { startsWith: DEMO_PREFIX } },
    select: { id: true, time_slot_id: true },
  });
  const ids    = orders.map(o => o.id);
  const slotIds = [...new Set(orders.map(o => o.time_slot_id).filter(Boolean))];

  if (ids.length) {
    await prisma.order_products.deleteMany({ where: { order_id: { in: ids } } });
    await prisma.orders.deleteMany({ where: { id: { in: ids } } });
  }
  for (const sid of slotIds) {
    await prisma.lorry_trips.deleteMany({ where: { time_slot_id: sid } }).catch(() => {});
    await prisma.time_slots.deleteMany({ where: { id: sid } }).catch(() => {});
  }
  console.log(`[seed] Cleaned ${ids.length} prior DEMO-PICK orders`);
}

async function main() {
  console.log('\n=== Picking Demo Seed ===\n');

  await cleanup();

  // ── Resolve existing accounts from driver seed ────────────────────────────
  const driver = await prisma.employees.findFirst({ where: { email: DRIVER_EMAIL } });
  if (!driver) throw new Error(`Driver account not found — run seedDriverTestData.js first`);

  let admin = await prisma.employees.findFirst({ where: { email: ADMIN_EMAIL } });
  if (!admin) throw new Error(`Admin account not found — run seedDriverTestData.js first`);
  await prisma.employees.update({ where: { id: admin.id }, data: { contact_number: '01172293772' } });

  // Pick any available delivery team
  const team = await prisma.teams.findFirst({ where: { available_flag: true } });
  if (!team) throw new Error('No team found — run seedDriverTestData.js first');

  // ── Products ──────────────────────────────────────────────────────────────
  const fridge = await prisma.products.findFirst({ where: { product_name: 'LG GT-B372SLCN 372L Top Freezer Fridge' } })
    ?? await prisma.products.create({ data: {
      product_name:                 'LG GT-B372SLCN 372L Top Freezer Fridge',
      installer_team_required_flag: false,
      fragile_flag:                 false,
      available_flag:               true,
      package_length_cm:            70,
      package_width_cm:             70,
      package_height_cm:            170,
    }});

  const sofa = await prisma.products.findFirst({ where: { product_name: 'NOVA L-Shape Sofa 3+2 Seater' } })
    ?? await prisma.products.create({ data: {
      product_name:                 'NOVA L-Shape Sofa 3+2 Seater',
      installer_team_required_flag: false,
      fragile_flag:                 false,
      available_flag:               true,
      package_length_cm:            280,
      package_width_cm:             90,
      package_height_cm:            85,
    }});

  // ── Customer ──────────────────────────────────────────────────────────────
  const customer = await prisma.customers.findFirst({ where: { phone: '01162607838' } })
    ?? await prisma.customers.create({ data: {
      full_name: 'Demo Customer',
      phone:     '01162607838',
      email:     'demo.customer@demo.local',
      address:   '10 Jalan Demo, Taman Demo',
      city:      'Petaling Jaya',
      postcode:  '47500',
      state:     'Selangor',
    }});

  // ── Time slot: 9 June 2026, 09:00–12:00 ──────────────────────────────────
  const slot = await prisma.time_slots.create({
    data: {
      date:               SLOT_DATE,
      time_window_start:  '09:00',
      time_window_end:    '12:00',
      delivery_team_id:   team.id,
      slot_status:        'scheduled',
      available_flag:     true,
      created_at:         new Date(),
    },
  });
  console.log(`[seed] Slot created: ${SLOT_DATE} 09:00–12:00 (id: ${slot.id})`);

  // ── Order ─────────────────────────────────────────────────────────────────
  const scheduledAt = new Date('2026-06-09T09:00:00+08:00');
  const order = await prisma.orders.create({
    data: {
      odoo_order_ref:            `${DEMO_PREFIX}-001`,
      order_status:              'Scheduled',
      employee_id:               driver.id,
      customer_id:               customer.id,
      time_slot_id:              slot.id,
      scheduled_start_date_time: scheduledAt,
      scheduled_end_date_time:   new Date('2026-06-09T12:00:00+08:00'),
      delivery_address:          customer.address,
      delivery_city:             customer.city,
      delivery_postcode:         customer.postcode,
      delivery_state:            customer.state,
      delivery_notes:            '[PICK DEMO] Fridge (serial enforced) + L-Shape Sofa (any scan)',
      assignment_status:         'approved',
      salesperson_name:          'Ben',
      salesperson_phone:         '01172293772',
      created_at:                new Date(),
      updated_at:                new Date(),
    },
  });
  console.log(`[seed] Order created: ${order.odoo_order_ref} (id: ${order.id})`);

  // ── Item 1: Fridge — assigned_serial enforced ─────────────────────────────
  await prisma.order_products.create({
    data: {
      order_id:        order.id,
      product_id:      fridge.id,
      quantity:        1,
      picking_status:  'pending',
      assigned_serial: 'FRIDGE-SN-001',   // storekeeper MUST scan this exact serial
      service_type:    'delivery_only',
    },
  });
  console.log(`[seed] Item 1: ${fridge.product_name} — assigned_serial: FRIDGE-SN-001`);

  // ── Item 2: L-Shape Sofa — no assigned_serial (any scan accepted) ─────────
  await prisma.order_products.create({
    data: {
      order_id:        order.id,
      product_id:      sofa.id,
      quantity:        1,
      picking_status:  'pending',
      assigned_serial: null,              // no restriction — accept whatever is scanned
      service_type:    'delivery_only',
    },
  });
  console.log(`[seed] Item 2: ${sofa.product_name} — assigned_serial: (none — any scan accepted)`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n--- Demo details ---');
  console.log(`  Order ref   : ${DEMO_PREFIX}-001`);
  console.log(`  Date / slot : ${SLOT_DATE}  09:00–12:00`);
  console.log(`  Driver      : ${DRIVER_EMAIL} / Driver@123`);
  console.log(`  Customer    : ${customer.full_name} / ${customer.phone}`);
  console.log('');
  console.log('  Item 1  LG Fridge');
  console.log('          assigned_serial = FRIDGE-SN-001');
  console.log('          → Storekeeper must scan exactly "FRIDGE-SN-001" to pick');
  console.log('');
  console.log('  Item 2  NOVA L-Shape Sofa');
  console.log('          assigned_serial = (none)');
  console.log('          → Any QR/barcode scan is accepted');
  console.log('\nDone.\n');
}

main()
  .catch(err => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
