// server/seedA5Demo.js
//
// Seeds one demo order for the Pick → Load → Unload → Delivery-Failure demo
// (UC-04, UC-05, UC-14, UC-15 / FR-06-001..004).
//
// Order: DEMO-A5-001, scheduled 16 June 2026, 08:00-12:00
//   Item 1 — NOVA L-Shape Sofa 3+2 Seater   assigned_serial = 'SN-LSOFA-001'
//            (storekeeper MUST scan this exact serial to pick)
//   Item 2 — LG GT-B372SLCN 372L Fridge     assigned_serial = (none)
//            (any scanned serial is accepted)
//
// Safe to re-run — removes prior DEMO-A5-* orders first.
//
// Usage:  node seedA5Demo.js
//         npm run seed:a5

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const bcrypt = require('bcryptjs');
const prisma = require('./prismaClient');

const DEMO_PREFIX     = 'DEMO';
const SLOT_DATE       = '2026-06-20';
const DRIVER_EMAIL    = 'drivertan@gmail.com';
const WAREHOUSE_EMAIL = 'warehousetan@gmail.com';
const ADMIN_EMAIL     = 'testerAdmin@gmail.com';

const SALESPERSON_NAME  = 'Salesperson Tan';
const SALESPERSON_PHONE = '01172293772';
const CUSTOMER_PHONE    = '01172293772';

async function cleanup() {
  const orders = await prisma.orders.findMany({
    where: { odoo_order_ref: { startsWith: DEMO_PREFIX } },
    select: { id: true, time_slot_id: true },
  });
  const ids     = orders.map(o => o.id);
  const slotIds = [...new Set(orders.map(o => o.time_slot_id).filter(Boolean))];

  for (const id of ids) {
    await prisma.notifications.deleteMany({ where: { order_id: id } }).catch(() => {});
    await prisma.integration_outbox.deleteMany({ where: { idempotency_key: { contains: `order:${id}:` } } }).catch(() => {});
  }
  if (ids.length) {
    await prisma.order_products.deleteMany({ where: { order_id: { in: ids } } });
    await prisma.orders.deleteMany({ where: { id: { in: ids } } });
  }
  for (const sid of slotIds) {
    await prisma.lorry_trips.deleteMany({ where: { time_slot_id: sid } }).catch(() => {});
    await prisma.time_slots.deleteMany({ where: { id: sid } }).catch(() => {});
  }
  console.log(`[seed] Cleaned ${ids.length} prior ${DEMO_PREFIX} order(s)`);
}

async function main() {
  console.log('\n=== A5 Demo Seed (Pick → Load → Unload → Delivery Failure) ===\n');

  await cleanup();

  // ── Resolve existing accounts (run seedDriverTestData.js first) ────────────
  const driver = await prisma.employees.findFirst({ where: { email: DRIVER_EMAIL } });
  if (!driver) throw new Error('Driver account not found — run seedDriverTestData.js first');

  const warehouse = await prisma.employees.findFirst({ where: { email: WAREHOUSE_EMAIL } });
  if (!warehouse) throw new Error('Warehouse account not found — run seedDriverTestData.js first');

  const admin = await prisma.employees.findFirst({ where: { email: ADMIN_EMAIL } });
  if (!admin) throw new Error('Admin account not found — run seedDriverTestData.js first');

  // ── Salesperson employee — gives UC-14's in-app salesperson notification a
  //    matching account (lookup is by contact_number + name) ─────────────────
  let salesperson = await prisma.employees.findFirst({ where: { contact_number: SALESPERSON_PHONE } });
  if (!salesperson) {
    salesperson = await prisma.employees.create({
      data: {
        email:          'salesperson.test@cehub.local',
        name:           SALESPERSON_NAME,
        display_name:   SALESPERSON_NAME,
        password:       await bcrypt.hash('Sales@123', 10),
        role_id:        driver.role_id, // non-admin role, so this account only gets the salesperson notification (not a duplicate admin one)
        active_flag:    true,
        contact_number: SALESPERSON_PHONE,
      },
    });
  }

  // Pick any available delivery team
  const team = await prisma.teams.findFirst({ where: { available_flag: true } });
  if (!team) throw new Error('No delivery team found — run seedDriverTestData.js first');

  // ── Products ──────────────────────────────────────────────────────────────
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

  // ── Customer ──────────────────────────────────────────────────────────────
  const customer = await prisma.customers.findFirst({ where: { phone: CUSTOMER_PHONE } })
    ?? await prisma.customers.create({ data: {
      full_name: 'Demo Customer',
      phone:     CUSTOMER_PHONE,
      email:     'demo.customer.a5@demo.local',
      address:   '88 Jalan Demo A5, Taman Demo',
      city:      'Petaling Jaya',
      postcode:  '47500',
      state:     'Selangor',
    }});

  // ── Time slot: 16 June 2026, 08:00–12:00 ──────────────────────────────────
  const slot = await prisma.time_slots.create({
    data: {
      date:               SLOT_DATE,
      time_window_start:  '08:00',
      time_window_end:    '12:00',
      delivery_team_id:   team.id,
      slot_status:        'scheduled',
      available_flag:     true,
      created_at:         new Date(),
    },
  });
  console.log(`[seed] Slot created: ${SLOT_DATE} 08:00–12:00 (id: ${slot.id})`);

  // ── Order ─────────────────────────────────────────────────────────────────
  const order = await prisma.orders.create({
    data: {
      odoo_order_ref:            `${DEMO_PREFIX}-001`,
      order_status:              'Scheduled',
      employee_id:               driver.id,
      customer_id:               customer.id,
      time_slot_id:              slot.id,
      scheduled_start_date_time: new Date(`${SLOT_DATE}T08:00:00+08:00`),
      scheduled_end_date_time:   new Date(`${SLOT_DATE}T12:00:00+08:00`),
      delivery_address:          customer.address,
      delivery_city:             customer.city,
      delivery_postcode:         customer.postcode,
      delivery_state:            customer.state,
      delivery_notes:            '[DEMO] Sofa (serial enforced) + Fridge (any scan) — pick → load → unload → report failure',
      assignment_status:         'approved',
      salesperson_name:          SALESPERSON_NAME,
      salesperson_phone:         SALESPERSON_PHONE,
      created_at:                new Date(),
      updated_at:                new Date(),
    },
  });
  console.log(`[seed] Order created: ${order.odoo_order_ref} (id: ${order.id})`);

  // ── Item 1: Sofa — assigned_serial enforced ───────────────────────────────
  const item1 = await prisma.order_products.create({
    data: {
      order_id:        order.id,
      product_id:      sofa.id,
      quantity:        1,
      picking_status:  'pending',
      assigned_serial: 'SN-LSOFA-001',   // storekeeper MUST scan this exact serial
      service_type:    'delivery_only',
    },
  });

  // ── Item 2: Fridge — no assigned_serial (any scan accepted) ───────────────
  const item2 = await prisma.order_products.create({
    data: {
      order_id:        order.id,
      product_id:      fridge.id,
      quantity:        1,
      picking_status:  'pending',
      assigned_serial: null,             // no restriction — accept whatever is scanned
      service_type:    'delivery_only',
    },
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n--- Demo details ---');
  console.log(`  Order ref   : ${order.odoo_order_ref}`);
  console.log(`  Order id    : ${order.id}`);
  console.log(`  Date / slot : ${SLOT_DATE}  08:00–12:00`);
  console.log(`  Storekeeper : ${WAREHOUSE_EMAIL} / Driver@123  (Scan Station → Picking)`);
  console.log(`  Driver      : ${DRIVER_EMAIL} / Driver@123  (Scan Station → Loading/Unloading, Leave Warehouse)`);
  console.log(`  Admin       : ${ADMIN_EMAIL} / Admin@123  (Cases → Order Issues)`);
  console.log(`  Customer    : ${customer.full_name} / ${customer.phone}`);
  console.log(`  Salesperson : ${SALESPERSON_NAME} / ${SALESPERSON_PHONE}`);
  console.log('');
  console.log(`  Item 1  ${sofa.product_name}`);
  console.log(`          order_products.id = ${item1.id}`);
  console.log('          assigned_serial = SN-LSOFA-001');
  console.log('          → Storekeeper must scan exactly "SN-LSOFA-001" to pick');
  console.log('');
  console.log(`  Item 2  ${fridge.product_name}`);
  console.log(`          order_products.id = ${item2.id}`);
  console.log('          assigned_serial = (none)');
  console.log('          → Any QR/barcode scan is accepted');

  console.log('\n--- Browser console: trigger delivery failure (FR-06-001..004) ---');
  console.log(`fetch('http://localhost:4000/api/orders/${order.id}/issue', {`);
  console.log(`  method: 'PATCH',`);
  console.log(`  headers: { 'Content-Type': 'application/json' },`);
  console.log(`  body: JSON.stringify({`);
  console.log(`    issue_reason: "Customer Unreachable",`);
  console.log(`    issue_desc: "Driver called 3 times, no answer.",`);
  console.log(`    issue_status: "open",`);
  console.log(`    order_products_status: [`);
  console.log(`      { id: ${item1.id}, item_delivery_status: "failed" }`);
  console.log(`    ]`);
  console.log(`  })`);
  console.log(`}).then(r => r.json()).then(console.log)`);
  console.log('\nDone.\n');
}

main()
  .catch(err => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
