// server/seedDemoViva.js
//
// Seeds demo orders across 3 time slots on 20 June 2026 for the FYP viva demo.
// All 3 slots share one truck + delivery team + warehouse team.
//
//   09:00–12:00  → DEMO-001  Sofa (assigned_serial enforced) + Fridge (no serial)
//                  DEMO-002  Fridge only (single-item order)
//   13:00–17:00  → DEMO-003  Sofa only (single-item order)
//   19:00–21:00  → DEMO-004  Fridge only (single-item order)
//
// Truck      : HS0823 (1 tonne)
// Delivery   : HS Delivery Team
// Warehouse  : HS Warehouse/Storekeeper Team
//
// Safe to re-run — removes prior DEMO-* orders first.
//
// Usage:  node seedDemoViva.js
//         npm run seed:viva

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
const SALESPERSON_PHONE = '01156751977';
const CUSTOMER_PHONE    = '01156751977';

const TRUCK_PLATE         = 'HS0823';
const TRUCK_TONE          = 1;
const DELIVERY_TEAM_TYPE  = 'HS Delivery Team';
const WAREHOUSE_TEAM_TYPE = 'HS Warehouse/ Storekeeper Team';

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

// ── Truck / Team helpers (shared, not deleted on re-run) ───────────────────

async function upsertTruck({ plateNo, tone }) {
  let truck = await prisma.trucks.findFirst({ where: { plate_no: plateNo } });
  if (!truck) {
    truck = await prisma.trucks.create({ data: { plate_no: plateNo, tone, created_at: new Date() } });
  } else if (truck.tone !== tone) {
    truck = await prisma.trucks.update({ where: { id: truck.id }, data: { tone } });
  }
  return truck;
}

async function upsertTeam(teamType) {
  let team = await prisma.teams.findFirst({ where: { team_type: teamType } });
  if (!team) {
    team = await prisma.teams.create({ data: { team_type: teamType, available_flag: true } });
  }
  return team;
}

async function createSlot({ timeStart, timeEnd, deliveryTeamId, warehouseTeamId, truckId }) {
  const slot = await prisma.time_slots.create({
    data: {
      date:               SLOT_DATE,
      time_window_start:  timeStart,
      time_window_end:    timeEnd,
      delivery_team_id:   deliveryTeamId,
      warehouse_team_id:  warehouseTeamId,
      truck_id:           truckId,
      slot_status:        'scheduled',
      available_flag:     true,
      created_at:         new Date(),
    },
  });
  console.log(`[seed] Slot created: ${SLOT_DATE} ${timeStart}–${timeEnd} (id: ${slot.id})`);
  return slot;
}

async function main() {
  console.log('\n=== Viva Demo Seed (3 time slots, 4 orders) ===\n');

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

  // ── Truck + teams (shared across all 3 slots) ──────────────────────────────
  const truck        = await upsertTruck({ plateNo: TRUCK_PLATE, tone: TRUCK_TONE });
  const deliveryTeam  = await upsertTeam(DELIVERY_TEAM_TYPE);
  const warehouseTeam = await upsertTeam(WAREHOUSE_TEAM_TYPE);
  console.log(`[seed] Truck: ${truck.plate_no} (${truck.tone}T) | Delivery: ${DELIVERY_TEAM_TYPE} | Warehouse: ${WAREHOUSE_TEAM_TYPE}`);

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

  // ── Time slots: 09:00–12:00, 13:00–17:00, 19:00–21:00 — all on SLOT_DATE ───
  const slot9to12  = await createSlot({ timeStart: '09:00', timeEnd: '12:00', deliveryTeamId: deliveryTeam.id, warehouseTeamId: warehouseTeam.id, truckId: truck.id });
  const slot13to17 = await createSlot({ timeStart: '13:00', timeEnd: '17:00', deliveryTeamId: deliveryTeam.id, warehouseTeamId: warehouseTeam.id, truckId: truck.id });
  const slot19to21 = await createSlot({ timeStart: '19:00', timeEnd: '21:00', deliveryTeamId: deliveryTeam.id, warehouseTeamId: warehouseTeam.id, truckId: truck.id });

  // ── Order helper ─────────────────────────────────────────────────────────
  async function createOrder({ ref, slot, startTime, endTime, notes }) {
    const order = await prisma.orders.create({
      data: {
        odoo_order_ref:            ref,
        order_status:              'Scheduled',
        employee_id:               driver.id,
        customer_id:               customer.id,
        time_slot_id:              slot.id,
        scheduled_start_date_time: new Date(`${SLOT_DATE}T${startTime}:00+08:00`),
        scheduled_end_date_time:   new Date(`${SLOT_DATE}T${endTime}:00+08:00`),
        delivery_address:          customer.address,
        delivery_city:             customer.city,
        delivery_postcode:         customer.postcode,
        delivery_state:            customer.state,
        delivery_notes:            notes,
        assignment_status:         'approved',
        salesperson_name:          SALESPERSON_NAME,
        salesperson_phone:         SALESPERSON_PHONE,
        created_at:                new Date(),
        updated_at:                new Date(),
      },
    });
    console.log(`[seed] Order created: ${order.odoo_order_ref} (id: ${order.id})`);
    return order;
  }

  async function addItem(orderId, product, assignedSerial) {
    return prisma.order_products.create({
      data: {
        order_id:        orderId,
        product_id:      product.id,
        quantity:        1,
        picking_status:  'pending',
        assigned_serial: assignedSerial,
        service_type:    'delivery_only',
      },
    });
  }

  // ── 09:00–12:00 — DEMO-001: Sofa (serial enforced) + Fridge (no serial) ────
  const order1 = await createOrder({
    ref: `${DEMO_PREFIX}-001`, slot: slot9to12, startTime: '09:00', endTime: '12:00',
    notes: '[DEMO] Sofa (serial enforced) + Fridge (any scan) — pick → load → unload → report failure',
  });
  const item1 = await addItem(order1.id, sofa,   'SN-LSOFA-001');
  const item2 = await addItem(order1.id, fridge, null);

  // ── 09:00–12:00 — DEMO-002: single-item order (Fridge only) ────────────────
  const order2 = await createOrder({
    ref: `${DEMO_PREFIX}-002`, slot: slot9to12, startTime: '09:00', endTime: '12:00',
    notes: '[DEMO] Single-item order — Fridge only',
  });
  const item3 = await addItem(order2.id, fridge, null);

  // ── 13:00–17:00 — DEMO-003: single-item order (Sofa only) ───────────────────
  const order3 = await createOrder({
    ref: `${DEMO_PREFIX}-003`, slot: slot13to17, startTime: '13:00', endTime: '17:00',
    notes: '[DEMO] Single-item order — Sofa only',
  });
  const item4 = await addItem(order3.id, sofa, null);

  // ── 19:00–21:00 — DEMO-004: single-item order (Fridge only) ─────────────────
  const order4 = await createOrder({
    ref: `${DEMO_PREFIX}-004`, slot: slot19to21, startTime: '19:00', endTime: '21:00',
    notes: '[DEMO] Single-item order — Fridge only',
  });
  const item5 = await addItem(order4.id, fridge, null);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n--- Demo details ---');
  console.log(`  Date        : ${SLOT_DATE}`);
  console.log(`  Truck       : ${truck.plate_no} (${truck.tone}T)`);
  console.log(`  Delivery    : ${DELIVERY_TEAM_TYPE}`);
  console.log(`  Warehouse   : ${WAREHOUSE_TEAM_TYPE}`);
  console.log(`  Storekeeper : ${WAREHOUSE_EMAIL} / Driver@123  (Scan Station → Picking)`);
  console.log(`  Driver      : ${DRIVER_EMAIL} / Driver@123  (Scan Station → Loading/Unloading, Leave Warehouse)`);
  console.log(`  Admin       : ${ADMIN_EMAIL} / Admin@123  (Cases → Order Issues)`);
  console.log(`  Customer    : ${customer.full_name} / ${customer.phone}`);
  console.log(`  Salesperson : ${SALESPERSON_NAME} / ${SALESPERSON_PHONE}`);
  console.log('');
  console.log('  09:00–12:00');
  console.log(`    ${order1.odoo_order_ref}  Sofa (assigned_serial = SN-LSOFA-001, must scan exactly) + Fridge (any scan)`);
  console.log(`    ${order2.odoo_order_ref}  Fridge only (any scan)`);
  console.log('  13:00–17:00');
  console.log(`    ${order3.odoo_order_ref}  Sofa only (any scan)`);
  console.log('  19:00–21:00');
  console.log(`    ${order4.odoo_order_ref}  Fridge only (any scan)`);

  console.log('\n--- Browser console: trigger delivery failure (FR-06-001..004) ---');
  console.log(`fetch('http://localhost:4000/api/orders/${order1.id}/issue', {`);
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
