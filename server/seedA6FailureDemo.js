// server/seedA6FailureDemo.js
//
// Seeds one order on 21 June 2026 purely to demo the A6 delivery-failure
// notification flow (FR-06-001..004): in-app + WhatsApp to admins, WhatsApp
// to salesperson, WhatsApp to customer, Odoo chatter post.
//
// Salesperson : Salesperson Tan / 01172293772
// Customer    : Customer Tan    / 01172293772   (same phone — see all 3
//               WhatsApp message types land on one test phone)
//
// Safe to re-run — removes prior A6FAIL-* orders first, then recreates with
// a fresh order_products id (printed below — use it in the trigger snippet).
//
// Usage:  node seedA6FailureDemo.js
//         npm run seed:a6

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const prisma = require('./prismaClient');

const DEMO_PREFIX  = 'A6FAIL';
const SLOT_DATE     = '2026-06-21';
const DRIVER_EMAIL  = 'drivertan@gmail.com';

const SALESPERSON_NAME  = 'Salesperson Tan';
const SALESPERSON_PHONE = '01172293772';
const CUSTOMER_NAME     = 'Customer Tan';
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
  console.log('\n=== A6 Delivery-Failure Notification Demo Seed ===\n');

  await cleanup();

  // ── Driver — gives the notification's "driverName" a real account ─────────
  const driver = await prisma.employees.findFirst({ where: { email: DRIVER_EMAIL } });
  if (!driver) throw new Error(`Driver account not found (${DRIVER_EMAIL}) — create it first`);

  // ── Salesperson — lookup is by contact_number + name in notificationService ─
  let salesperson = await prisma.employees.findFirst({ where: { contact_number: SALESPERSON_PHONE } });
  if (!salesperson) {
    const bcrypt = require('bcryptjs');
    salesperson = await prisma.employees.create({
      data: {
        email:          'salesperson.tan@cehub.local',
        name:           SALESPERSON_NAME,
        display_name:   SALESPERSON_NAME,
        password:       await bcrypt.hash('Sales@123', 10),
        role_id:        driver.role_id,
        active_flag:    true,
        contact_number: SALESPERSON_PHONE,
      },
    });
  }

  // ── Customer — upsert by phone, always set full_name to "Customer Tan" ─────
  let customer = await prisma.customers.findFirst({ where: { phone: CUSTOMER_PHONE } });
  const customerData = {
    full_name: CUSTOMER_NAME,
    phone:     CUSTOMER_PHONE,
    email:     'customer.tan@demo.local',
    address:   '21 Jalan Tan, Taman Demo',
    city:      'Petaling Jaya',
    postcode:  '47500',
    state:     'Selangor',
  };
  customer = customer
    ? await prisma.customers.update({ where: { id: customer.id }, data: customerData })
    : await prisma.customers.create({ data: customerData });

  // ── Product — any item works; failure is reported at the item level ───────
  const product = await prisma.products.findFirst({ where: { product_name: 'NOVA L-Shape Sofa 3+2 Seater' } })
    ?? await prisma.products.create({ data: {
      product_name:                 'NOVA L-Shape Sofa 3+2 Seater',
      installer_team_required_flag: false,
      fragile_flag:                 false,
      available_flag:               true,
      package_length_cm:            280,
      package_width_cm:             90,
      package_height_cm:            85,
    }});

  // ── Time slot — 21 June, no truck/team needed for this notification-only demo
  const slot = await prisma.time_slots.create({
    data: {
      date:               SLOT_DATE,
      time_window_start:  '10:00',
      time_window_end:    '12:00',
      slot_status:        'scheduled',
      available_flag:     true,
      created_at:         new Date(),
    },
  });

  // ── Order ────────────────────────────────────────────────────────────────
  const order = await prisma.orders.create({
    data: {
      odoo_order_ref:            `${DEMO_PREFIX}-001`,
      order_status:              'Delivering',
      employee_id:               driver.id,
      customer_id:               customer.id,
      time_slot_id:              slot.id,
      scheduled_start_date_time: new Date(`${SLOT_DATE}T10:00:00+08:00`),
      scheduled_end_date_time:   new Date(`${SLOT_DATE}T12:00:00+08:00`),
      delivery_address:          customer.address,
      delivery_city:             customer.city,
      delivery_postcode:         customer.postcode,
      delivery_state:            customer.state,
      delivery_notes:            '[A6 DEMO] Trigger delivery failure notification (in-app + WhatsApp + Odoo chatter)',
      assignment_status:         'approved',
      salesperson_name:          SALESPERSON_NAME,
      salesperson_phone:         SALESPERSON_PHONE,
      created_at:                new Date(),
      updated_at:                new Date(),
    },
  });

  const item = await prisma.order_products.create({
    data: {
      order_id:             order.id,
      product_id:           product.id,
      quantity:              1,
      picking_status:        'unloaded',
      item_delivery_status:  'pending',
      service_type:          'delivery_only',
    },
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('--- Demo details ---');
  console.log(`  Order ref     : ${order.odoo_order_ref}`);
  console.log(`  Order id      : ${order.id}`);
  console.log(`  Date / slot   : ${SLOT_DATE}  10:00–12:00`);
  console.log(`  Driver        : ${DRIVER_EMAIL}`);
  console.log(`  Salesperson   : ${SALESPERSON_NAME} / ${SALESPERSON_PHONE}`);
  console.log(`  Customer      : ${customer.full_name} / ${customer.phone}`);
  console.log('');
  console.log(`  Item          : ${product.product_name}`);
  console.log(`  products.id        = ${product.id}`);
  console.log(`  order_products.id  = ${item.id}   ← use this in order_products_status below`);

  console.log('\n--- Browser console: trigger A6 delivery failure notification ---');
  console.log(`fetch('http://localhost:4000/api/orders/${order.id}/issue', {`);
  console.log(`  method: 'PATCH',`);
  console.log(`  headers: { 'Content-Type': 'application/json' },`);
  console.log(`  body: JSON.stringify({`);
  console.log(`    issue_reason: "Customer Unreachable",`);
  console.log(`    issue_desc: "Driver called 3 times, no answer.",`);
  console.log(`    issue_status: "open",`);
  console.log(`    order_products_status: [`);
  console.log(`      { id: ${item.id}, item_delivery_status: "failed" }`);
  console.log(`    ]`);
  console.log(`  })`);
  console.log(`}).then(r => r.json()).then(console.log)`);
  console.log('\nDone.\n');
}

main()
  .catch(err => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
