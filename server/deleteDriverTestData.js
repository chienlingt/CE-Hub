// server/deleteDriverTestData.js
//
// Removes all data created by seedDriverTestData.js.
// Safe to re-run — only touches TEST-DRV-* / known test accounts.
//
// Usage:
//   node deleteDriverTestData.js
//   npm run seed:driver:delete

const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const prisma = require('./prismaClient');

const TEST_PREFIX      = 'TEST-DRV';
const DRIVER_EMAIL     = 'driver.test@cehub.local';
const ADMIN_EMAIL      = 'admin.test@cehub.local';
const FALLBACK_TEAM_TYPE = 'Delivery Team Alpha';
const TEST_PHONES      = ['60123456789', '60198765432', '60112233445'];
const TEST_PRODUCTS    = [
  `${TEST_PREFIX} Standard Sofa`,
  `${TEST_PREFIX} Wardrobe (Install)`,
];

async function deleteTestOrders() {
  const testOrders = await prisma.orders.findMany({
    where: { odoo_order_ref: { startsWith: TEST_PREFIX } },
    select: { id: true, time_slot_id: true, odoo_order_ref: true },
  });

  const orderIds = testOrders.map(o => o.id);
  const slotIds  = [...new Set(testOrders.map(o => o.time_slot_id).filter(Boolean))];

  if (!orderIds.length) {
    console.log('[delete] No TEST-DRV orders found');
    return { orderIds, slotIds, count: 0 };
  }

  // Outbox rows tied to these orders or slots
  await prisma.integration_outbox.deleteMany({
    where: {
      OR: [
        ...orderIds.map(id => ({ idempotency_key: { startsWith: `order:${id}:` } })),
        ...slotIds.map(id => ({ idempotency_key: { startsWith: `slot:${id}:` } })),
      ],
    },
  });

  // Notifications referencing these orders
  await prisma.notifications.deleteMany({
    where: { order_id: { in: orderIds } },
  }).catch(() => {});

  await prisma.order_products.deleteMany({ where: { order_id: { in: orderIds } } });
  await prisma.orders.deleteMany({ where: { id: { in: orderIds } } });

  for (const slotId of slotIds) {
    await prisma.lorry_trips.deleteMany({ where: { time_slot_id: slotId } });
    await prisma.time_slots.deleteMany({ where: { id: slotId } });
  }

  // Remove uploaded POD files for deleted orders
  for (const id of orderIds) {
    for (const sub of ['status', 'report']) {
      const dir = path.join(__dirname, 'uploads', 'orders', 'del', sub, id);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }

  console.log(`[delete] Removed ${orderIds.length} orders, ${slotIds.length} slots`);
  for (const o of testOrders) {
    console.log(`         - ${o.odoo_order_ref}`);
  }

  return { orderIds, slotIds, count: orderIds.length };
}

async function deleteTestEmployees() {
  const emails = [DRIVER_EMAIL, ADMIN_EMAIL];
  const employees = await prisma.employees.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });

  const ids = [];
  for (const emp of employees) {
    await prisma.employee_team_assignments.deleteMany({ where: { employee_id: emp.id } });
    await prisma.employees.delete({ where: { id: emp.id } });
    console.log(`[delete] Removed employee ${emp.email}`);
    ids.push(emp.id);
  }

  return ids;
}

async function deleteTestRoles() {
  console.log('[delete] Kept "admin" role (system role — not removed)');
  console.log('[delete] Kept "Delivery Team" role (system role — not removed)');
}

async function deleteTestTeam() {
  const team = await prisma.teams.findFirst({ where: { team_type: FALLBACK_TEAM_TYPE } });
  if (!team) return;

  const slotCount = await prisma.time_slots.count({ where: { delivery_team_id: team.id } });
  const assignCount = await prisma.employee_team_assignments.count({ where: { team_id: team.id } });

  if (slotCount === 0 && assignCount === 0) {
    await prisma.teams.delete({ where: { id: team.id } });
    console.log(`[delete] Removed team "${FALLBACK_TEAM_TYPE}"`);
  } else {
    console.log(`[delete] Kept team "${FALLBACK_TEAM_TYPE}" (still referenced by ${slotCount} slot(s), ${assignCount} assignment(s))`);
  }
}

async function deleteTestProducts() {
  for (const productName of TEST_PRODUCTS) {
    const product = await prisma.products.findFirst({ where: { product_name: productName } });
    if (!product) continue;

    const inUse = await prisma.order_products.count({ where: { product_id: product.id } });
    if (inUse === 0) {
      await prisma.products.delete({ where: { id: product.id } });
      console.log(`[delete] Removed product "${productName}"`);
    } else {
      console.log(`[delete] Kept product "${productName}" (${inUse} order line(s) still reference it)`);
    }
  }
}

async function deleteTestCustomers() {
  for (const phone of TEST_PHONES) {
    const customer = await prisma.customers.findFirst({ where: { phone } });
    if (!customer) continue;

    const orderCount = await prisma.orders.count({ where: { customer_id: customer.id } });
    const notifCount = await prisma.notifications.count({ where: { user_id: customer.id } });

    if (orderCount === 0) {
      if (notifCount) {
        await prisma.notifications.deleteMany({ where: { user_id: customer.id } });
      }
      await prisma.customers.delete({ where: { id: customer.id } });
      console.log(`[delete] Removed customer ${customer.full_name} (${phone})`);
    } else {
      console.log(`[delete] Kept customer ${customer.full_name} (${orderCount} order(s) remain)`);
    }
  }
}

async function main() {
  console.log('\n=== Delete driver test data ===\n');

  await deleteTestOrders();
  await deleteTestEmployees();
  await deleteTestRoles();
  await deleteTestTeam();
  await deleteTestProducts();
  await deleteTestCustomers();

  console.log('\nDone. Run `npm run seed:driver` to recreate test data.\n');
}

main()
  .catch(err => {
    console.error('Delete failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
