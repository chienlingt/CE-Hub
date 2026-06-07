// server/seedDriverTestData.js
//
// Idempotent seed for Driver Dashboard + A.4 testing.
// Safe to re-run — removes prior TEST-DRV-* rows first.
//
// Usage:
//   node seedDriverTestData.js
//   npm run seed:driver

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const bcrypt = require('bcryptjs');
const dayjs  = require('dayjs');
const prisma = require('./prismaClient');

const TEST_PREFIX   = 'TEST-DRV';
const DRIVER_EMAIL  = 'driver.test@cehub.local';
const DRIVER_PASS   = 'Driver@123';
const ADMIN_EMAIL   = 'admin.test@cehub.local';
const ADMIN_PASS    = 'Admin@123';

// Original Delivery Team access-control permissions (Access Control panel nav keys)
const ORIGINAL_DELIVERY_TEAM_PERMISSIONS = ['delivery', 'scanning'];
const DELIVERY_TEAM_ROLE_NAME = 'Delivery Team';
const FALLBACK_TEAM_TYPE      = 'Delivery Team Alpha';

function todayAt(hour, minute = 0) {
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0).toDate();
}

function todayStr() {
  return dayjs().format('YYYY-MM-DD');
}

async function cleanup() {
  const testOrders = await prisma.orders.findMany({
    where: { odoo_order_ref: { startsWith: TEST_PREFIX } },
    select: { id: true, time_slot_id: true },
  });

  const orderIds = testOrders.map(o => o.id);
  const slotIds  = [...new Set(testOrders.map(o => o.time_slot_id).filter(Boolean))];

  if (orderIds.length) {
    await prisma.notifications.deleteMany({ where: { order_id: { in: orderIds } } }).catch(() => {});
    await prisma.order_products.deleteMany({ where: { order_id: { in: orderIds } } });
    await prisma.orders.deleteMany({ where: { id: { in: orderIds } } });
  }

  for (const slotId of slotIds) {
    await prisma.lorry_trips.deleteMany({ where: { time_slot_id: slotId } }).catch(() => {});
    await prisma.time_slots.deleteMany({ where: { id: slotId } }).catch(() => {});
  }

  console.log(`[seed] Cleaned ${orderIds.length} prior test orders`);
}

async function upsertRole(name, permissions) {
  let role = await prisma.roles.findFirst({ where: { name } });
  if (role) {
    role = await prisma.roles.update({
      where: { id: role.id },
      data:  { permissions },
    });
  } else {
    role = await prisma.roles.create({ data: { name, permissions } });
  }
  return role;
}

/** Use the existing admin role; never overwrite its permissions. */
async function resolveAdminRole() {
  let role = await prisma.roles.findFirst({
    where: { name: { equals: 'admin', mode: 'insensitive' } },
  });

  if (role) {
    console.log(`[seed] Using existing "${role.name}" role — permissions: [${role.permissions.join(', ')}]`);
    return role;
  }

  role = await prisma.roles.create({
    data: {
      name:        'admin',
      permissions: ['cases', 'dashboard', 'delivery', 'scanning'],
    },
  });
  console.log(`[seed] Created "admin" role with permissions: [${role.permissions.join(', ')}]`);
  return role;
}

/** Use the existing Delivery Team role + permissions; never replace with driver-only. */
async function resolveDeliveryTeamRole() {
  let role = await prisma.roles.findFirst({
    where: { name: { equals: DELIVERY_TEAM_ROLE_NAME, mode: 'insensitive' } },
  });

  if (role) {
    console.log(`[seed] Using existing "${role.name}" role — permissions: [${role.permissions.join(', ')}]`);
    // Merge driver permission if missing so /driver dashboard works during UAT
    if (!role.permissions.includes('driver')) {
      role = await prisma.roles.update({
        where: { id: role.id },
        data:  { permissions: [...role.permissions, 'driver'] },
      });
      console.log('[seed] Merged "driver" into Delivery Team role (original permissions kept)');
    }
    return role;
  }

  role = await prisma.roles.create({
    data: {
      name:        DELIVERY_TEAM_ROLE_NAME,
      permissions: [...ORIGINAL_DELIVERY_TEAM_PERMISSIONS, 'driver'],
    },
  });
  console.log(`[seed] Created "${DELIVERY_TEAM_ROLE_NAME}" with permissions: [${role.permissions.join(', ')}]`);
  return role;
}

/** Prefer an existing delivery ops team from the database. */
async function resolveDeliveryOpsTeam() {
  const teams = await prisma.teams.findMany({ where: { available_flag: true } });
  const existing = teams.find(t => (t.team_type || '').toLowerCase().includes('delivery'));
  if (existing) {
    console.log(`[seed] Using existing ops team: "${existing.team_type}"`);
    return existing;
  }

  const team = await upsertTeam(FALLBACK_TEAM_TYPE);
  console.log(`[seed] No delivery ops team found — created "${FALLBACK_TEAM_TYPE}"`);
  return team;
}

async function upsertEmployee({ email, name, password, roleId }) {
  const hash = await bcrypt.hash(password, 10);
  let emp = await prisma.employees.findFirst({ where: { email } });
  if (emp) {
    emp = await prisma.employees.update({
      where: { id: emp.id },
      data:  { name, display_name: name, password: hash, role_id: roleId, active_flag: true },
    });
  } else {
    emp = await prisma.employees.create({
      data: { email, name, display_name: name, password: hash, role_id: roleId, active_flag: true },
    });
  }
  return emp;
}

async function upsertTeam(teamType) {
  let team = await prisma.teams.findFirst({ where: { team_type: teamType } });
  if (!team) {
    team = await prisma.teams.create({ data: { team_type: teamType, available_flag: true } });
  }
  return team;
}

async function assignTeam(employeeId, teamId) {
  const existing = await prisma.employee_team_assignments.findFirst({
    where: { employee_id: employeeId, team_id: teamId },
  });
  if (!existing) {
    await prisma.employee_team_assignments.create({
      data: { employee_id: employeeId, team_id: teamId, assigned_at: new Date() },
    });
  }
}

async function createProduct(name, installRequired) {
  let product = await prisma.products.findFirst({ where: { product_name: name } });
  if (!product) {
    product = await prisma.products.create({
      data: {
        product_name:                 name,
        installer_team_required_flag: installRequired,
        available_flag:               true,
        package_length_cm:            100,
        package_width_cm:             50,
        package_height_cm:            30,
      },
    });
  }
  return product;
}

async function createCustomer(name, phone) {
  let customer = await prisma.customers.findFirst({ where: { phone } });
  if (!customer) {
    customer = await prisma.customers.create({
      data: {
        full_name: name,
        phone,
        email:     `${name.toLowerCase().replace(/\s+/g, '.')}@test.local`,
        address:   '12 Jalan Test, Taman Sample',
        city:      'Petaling Jaya',
        postcode:  '47400',
        state:     'Selangor',
      },
    });
  }
  return customer;
}

async function createSlot({ date, deliveryTeamId, slotStatus = 'scheduled' }) {
  return prisma.time_slots.create({
    data: {
      date,
      time_window_start: '09:00',
      time_window_end:   '12:00',
      delivery_team_id:  deliveryTeamId,
      slot_status:       slotStatus,
      available_flag:    true,
      created_at:        new Date(),
      ...(slotStatus === 'out_for_delivery' ? { departed_at: new Date() } : {}),
    },
  });
}

async function createOrder({
  odooRef,
  label,
  status,
  driverId,
  customerId,
  slotId,
  scheduledAt,
  product,
  pickingStatus,
  extra = {},
}) {
  const order = await prisma.orders.create({
    data: {
      odoo_order_ref:            odooRef,
      order_status:              status,
      employee_id:               driverId ?? null,
      customer_id:               customerId,
      time_slot_id:              slotId,
      scheduled_start_date_time: scheduledAt,
      scheduled_end_date_time:   dayjs(scheduledAt).add(2, 'hour').toDate(),
      delivery_address:          '12 Jalan Test, Taman Sample, 47400 Petaling Jaya',
      delivery_city:             'Petaling Jaya',
      delivery_postcode:         '47400',
      delivery_state:            'Selangor',
      delivery_notes:            label,
      assignment_status:         'approved',
      created_at:                new Date(),
      updated_at:                new Date(),
      ...extra,
    },
  });

  await prisma.order_products.create({
    data: {
      order_id:       order.id,
      product_id:     product.id,
      quantity:       1,
      picking_status: pickingStatus,
      ...(pickingStatus === 'unloaded' ? { unloaded_at: new Date() } : {}),
      ...(pickingStatus === 'loaded'   ? { loaded_at:   new Date() } : {}),
    },
  });

  return order;
}

const SEED_EVIDENCE = ['/uploads/orders/del/report/seed/placeholder.jpg'];

async function seedAdminNotifications(adminId, items) {
  for (const { orderId, message, type = 'error' } of items) {
    await prisma.notifications.create({
      data: {
        user_id:  adminId,
        order_id: orderId,
        message,
        type,
        is_read:  false,
      },
    });
  }
}

async function main() {
  console.log('\n=== Driver test data seed ===\n');

  await cleanup();

  const driverRole = await resolveDeliveryTeamRole();
  const adminRole  = await resolveAdminRole();

  const driver = await upsertEmployee({
    email:    DRIVER_EMAIL,
    name:     'Test Driver',
    password: DRIVER_PASS,
    roleId:   driverRole.id,
  });

  const admin = await upsertEmployee({
    email:    ADMIN_EMAIL,
    name:     'Admin',
    password: ADMIN_PASS,
    roleId:   adminRole.id,
  });

  const deliveryTeam = await resolveDeliveryOpsTeam();
  await assignTeam(driver.id, deliveryTeam.id);

  const productStd    = await createProduct(`${TEST_PREFIX} Standard Sofa`, false);
  const productInstall = await createProduct(`${TEST_PREFIX} Wardrobe (Install)`, true);

  const cust1 = await createCustomer('Ahmad Test', '601156751977');
  const cust2 = await createCustomer('Siti Test',  '601156751977');
  const cust3 = await createCustomer('Lee Test',   '601156751977');

  const date = todayStr();

  // Slot A — still "scheduled" (never departed) → auto-depart + auto-close test
  const slotScheduled = await createSlot({ date, deliveryTeamId: deliveryTeam.id, slotStatus: 'scheduled' });

  // Slot B — out_for_delivery, 2 orders (partial → full close test)
  const slotActive = await createSlot({ date, deliveryTeamId: deliveryTeam.id, slotStatus: 'out_for_delivery' });
  await prisma.lorry_trips.create({
    data: {
      time_slot_id:     slotActive.id,
      delivery_team_id: deliveryTeam.id,
      status:           'active',
      started_at:       new Date(),
    },
  });

  const scenarios = [
    {
      odooRef:       `${TEST_PREFIX}-SCHED`,
      label:         '[TEST 1] Scheduled → Delivering (no POD)',
      status:        'Scheduled',
      driverId:      driver.id,
      customerId:    cust1.id,
      slotId:        null,
      hour:          9,
      product:       productStd,
      pickingStatus: 'unloaded',
    },
    {
      odooRef:       `${TEST_PREFIX}-COMPLETE`,
      label:         '[TEST 2] Delivering → Completed (POD, no install)',
      status:        'Delivering',
      driverId:      driver.id,
      customerId:    cust1.id,
      slotId:        null,
      hour:          10,
      product:       productStd,
      pickingStatus: 'unloaded',
    },
    {
      odooRef:       `${TEST_PREFIX}-INSTALL`,
      label:         '[TEST 3] Delivering → Delivered (install required product)',
      status:        'Delivering',
      driverId:      driver.id,
      customerId:    cust2.id,
      slotId:        null,
      hour:          11,
      product:       productInstall,
      pickingStatus: 'unloaded',
    },
    {
      odooRef:       `${TEST_PREFIX}-BLOCKED`,
      label:         '[TEST 4] Scan gate blocked (items still loaded, not unloaded)',
      status:        'Delivering',
      driverId:      driver.id,
      customerId:    cust2.id,
      slotId:        null,
      hour:          12,
      product:       productStd,
      pickingStatus: 'loaded',
    },
    {
      odooRef:       `${TEST_PREFIX}-TEAM`,
      label:         '[TEST 5] Team-assigned (employee_id null, visible via delivery team)',
      status:        'Delivering',
      driverId:      null,
      customerId:    cust3.id,
      slotId:        slotActive.id,
      hour:          13,
      product:       productStd,
      pickingStatus: 'unloaded',
    },
    {
      odooRef:       `${TEST_PREFIX}-ISSUE`,
      label:         '[TEST 6] Update→Issue → Cases → Delivery Issues',
      status:        'Issue',
      driverId:      driver.id,
      customerId:    cust3.id,
      slotId:        null,
      hour:          14,
      product:       productStd,
      pickingStatus: 'unloaded',
      extra: {
        is_complaint_submitted: true,
        issue_reason:         'Traffic Delay',
        issue_desc:           'Stuck on highway — Update modal issue flow',
        issue_priority_level: 'medium',
        issue_evidence:       SEED_EVIDENCE,
      },
    },
    {
      odooRef:       `${TEST_PREFIX}-DONE`,
      label:         '[TEST 7] Already completed (Completed tab + admin view)',
      status:        'Completed',
      driverId:      driver.id,
      customerId:    cust1.id,
      slotId:        null,
      hour:          8,
      product:       productStd,
      pickingStatus: 'unloaded',
      extra: {
        delivered_by:           driver.id,
        delivery_end_date_time: todayAt(8, 30),
        delivery_evidence:      ['/uploads/orders/del/status/seed/placeholder.jpg'],
        proof_of_delivery_url:  null,
      },
    },
    {
      odooRef:       `${TEST_PREFIX}-AUTOCLOSE`,
      label:         '[TEST 8] Auto-depart + auto-close slot (last order on scheduled slot)',
      status:        'Delivering',
      driverId:      driver.id,
      customerId:    cust2.id,
      slotId:        slotScheduled.id,
      hour:          15,
      product:       productStd,
      pickingStatus: 'unloaded',
    },
    {
      odooRef:       `${TEST_PREFIX}-PARTIAL-A`,
      label:         '[TEST 9a] Slot partial close — already Completed',
      status:        'Completed',
      driverId:      driver.id,
      customerId:    cust1.id,
      slotId:        slotActive.id,
      hour:          16,
      product:       productStd,
      pickingStatus: 'unloaded',
      extra: {
        delivered_by:           driver.id,
        delivery_end_date_time: todayAt(16, 0),
      },
    },
    {
      odooRef:       `${TEST_PREFIX}-PARTIAL-B`,
      label:         '[TEST 9b] Slot partial close — complete this to auto-close slot',
      status:        'Delivering',
      driverId:      driver.id,
      customerId:    cust3.id,
      slotId:        slotActive.id,
      hour:          17,
      product:       productStd,
      pickingStatus: 'unloaded',
    },
    {
      odooRef:       `${TEST_PREFIX}-REPORT`,
      label:         '[TEST 10] Full driver Report → Cases → Delivery Issues (open)',
      status:        'Issue',
      driverId:      driver.id,
      customerId:    cust1.id,
      slotId:        null,
      hour:          18,
      product:       productStd,
      pickingStatus: 'unloaded',
      extra: {
        is_complaint_submitted: true,
        issue_priority_level:   'high',
        issue_reason:           'Customer Absent',
        issue_desc:             'Knocked three times, no answer. Neighbour confirmed customer is away.',
        issue_evidence:         SEED_EVIDENCE,
        salesperson_name:       'Seed Salesperson',
        salesperson_phone:      '60199887766',
      },
    },
    {
      odooRef:       `${TEST_PREFIX}-REPORT-OK`,
      label:         '[TEST 11] Resolved driver Report → Delivery Issues (resolved filter)',
      status:        'Issue',
      driverId:      driver.id,
      customerId:    cust2.id,
      slotId:        null,
      hour:          19,
      product:       productStd,
      pickingStatus: 'unloaded',
      extra: {
        is_complaint_submitted: true,
        issue_priority_level:   'medium',
        issue_reason:           'Wrong Address',
        issue_desc:             'GPS pin was wrong; customer confirmed correct unit via phone.',
        issue_evidence:         SEED_EVIDENCE,
        issue_status:           'resolved',
      },
    },
    {
      odooRef:       `${TEST_PREFIX}-ESCALATE`,
      label:         '[TEST 12] Pre-escalated order → Cases → Delivery Issues (Escalations section)',
      status:        'Delivering',
      driverId:      driver.id,
      customerId:    cust2.id,
      slotId:        null,
      hour:          20,
      product:       productStd,
      pickingStatus: 'unloaded',
      extra: {
        is_complaint_submitted:     true,
        is_escalation_acknowledged: false,
        issue_reason:               'Driver Escalation',
        issue_desc:                 'Pre-seeded escalation: gate access denied by security.',
        salesperson_phone:          '60188776655',
      },
    },
    {
      odooRef:       `${TEST_PREFIX}-A6FAIL`,
      label:         '[TEST 13] A6 ops failure (issue_reason only → Order Issues only)',
      status:        'Delivering',
      driverId:      driver.id,
      customerId:    cust3.id,
      slotId:        null,
      hour:          21,
      product:       productStd,
      pickingStatus: 'unloaded',
      extra: {
        issue_reason: 'Access Denied',
        issue_desc:   null,
      },
    },
  ];

  const created = [];
  for (const s of scenarios) {
    const order = await createOrder({
      odooRef:       s.odooRef,
      label:         s.label,
      status:        s.status,
      driverId:      s.driverId,
      customerId:    s.customerId,
      slotId:        s.slotId,
      scheduledAt:   todayAt(s.hour),
      product:       s.product,
      pickingStatus: s.pickingStatus,
      extra:         s.extra || {},
    });
    created.push({ odooRef: s.odooRef, id: order.id, label: s.label });
  }

  // Enqueue a processed Odoo sync row for the already-completed order (admin badge test)
  const doneOrder = created.find(o => o.odooRef === `${TEST_PREFIX}-DONE`);
  if (doneOrder) {
    await prisma.integration_outbox.upsert({
      where:  { idempotency_key: `order:${doneOrder.id}:odoo:Completed` },
      create: {
        event_type:      'SLOT_STATUS_CHANGED',
        target:          'odoo',
        payload:         { orderId: doneOrder.id, odooRef: `${TEST_PREFIX}-DONE`, status: 'Completed' },
        idempotency_key: `order:${doneOrder.id}:odoo:Completed`,
        status:          'processed',
        attempts:        1,
        processed_at:    new Date(),
        next_retry_at:     new Date(),
      },
      update: { status: 'processed', processed_at: new Date() },
    });
  }

  const reportOrder  = created.find(o => o.odooRef === `${TEST_PREFIX}-REPORT`);
  const a6Order      = created.find(o => o.odooRef === `${TEST_PREFIX}-A6FAIL`);
  if (reportOrder || a6Order) {
    await seedAdminNotifications(admin.id, [
      ...(reportOrder ? [{
        orderId: reportOrder.id,
        message: `Driver report submitted for order #${reportOrder.odooRef.replace(`${TEST_PREFIX}-`, '')}`,
        type:    'error',
      }] : []),
      ...(a6Order ? [{
        orderId: a6Order.id,
        message: `Delivery failure on order #${a6Order.odooRef.replace(`${TEST_PREFIX}-`, '')}: Access Denied`,
        type:    'error',
      }] : []),
    ]);
    console.log('[seed] Created admin notifications for Delivery Issues + Order Issues routing test');
  }

  console.log('\n--- Login credentials ---');
  console.log(`Driver : ${DRIVER_EMAIL} / ${DRIVER_PASS}`);
  console.log(`Admin  : ${ADMIN_EMAIL} / ${ADMIN_PASS}`);
  console.log(`Driver employee_id: ${driver.id}`);
  console.log(`Date filter (today): ${date}`);

  console.log('\n--- Test orders (look for delivery_notes label in dashboard) ---');
  for (const o of created) {
    console.log(`  ${o.odooRef}  ${o.id.slice(0, 8)}…  ${o.label}`);
  }

  console.log('\n--- What to test ---');
  console.log('  TEST 1   Update → Delivering (no POD)');
  console.log('  TEST 2   Update → Completed with photo/signature → status Completed');
  console.log('  TEST 3   Update → Completed → status Delivered (install product)');
  console.log('  TEST 4   Completion blocked — items not unloaded');
  console.log('  TEST 5   Visible without employee_id (team slot match)');
  console.log('  TEST 6   Driver Issue tab (Update→Issue) → Cases → Delivery Issues');
  console.log('  TEST 7   Completed tab + Cases → Completed Deliveries (synced badge)');
  console.log('  TEST 8   Complete → slot auto-depart [auto] + auto-close');
  console.log('  TEST 9   Complete PARTIAL-B → slot B auto-closes (PARTIAL-A already done)');
  console.log('  TEST 10  Cases → Delivery Issues (open report, high priority)');
  console.log('  TEST 11  Cases → Delivery Issues (resolved filter)');
  console.log('  TEST 12  Admin escalation only — Report btn disabled, not in Cases tabs');
  console.log('  TEST 13  Cases → Order Issues (A6-style failure, no driver report)');
  console.log('  Notify   Bell: TEST 10 → Delivery Issues; TEST 13 → Order Issues');
  console.log('\nDone.\n');
}

main()
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
