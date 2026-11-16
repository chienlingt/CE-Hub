// server/seedPerformanceDemo.js
//
// Demo data for Dashboard > Employee Performance, with numbers small enough to
// check by hand: two delivery teams (a driver and an assistant each), delivered
// orders with item lines, and an item list with points per item.
//
//   node seedPerformanceDemo.js                  dry run (default): prints the plan only
//   node seedPerformanceDemo.js --apply          create the demo data
//   node seedPerformanceDemo.js --apply --award  also save the points (so "Add points" works)
//   node seedPerformanceDemo.js --remove         delete everything this script created
//
// Everything is tagged PERF-DEMO (order refs PERF-DEMO-nnn, staff emails
// perf.demo.*@example.invalid, truck plates PERFDEMO-*), so it is easy to spot
// and remove. Re-running --apply does nothing if the demo orders already exist.
//
// It does NOT change your incentive rules and does NOT overwrite item points you
// already set: it only adds items that are missing. Without --award the orders
// show as "Estimated" (priced live), so changing an item's points changes the
// page straight away, which is the easiest way to test the calculation.
//
// Uses DATABASE_URL from server/.env (the sandbox) like the other seed scripts.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const prisma = require('./prismaClient');
const { awardOrder, itemKey } = require('./services/incentiveService');

const TAG = 'PERF-DEMO';
const EMAIL = key => `perf.demo.${key}@example.invalid`;

// Default points for items that are not on the Item list yet (existing rates are kept).
const ITEM_RATES = {
  'NOVA 3-Seater L-Shape Sofa': 8,
  'Samsung 380L Top Freezer Fridge': 6,
  'Restonic Comfort Queen Mattress': 4,
  'LG 9kg Front Load Washer': 6,
  'Daikin 1.5HP Inverter Aircond': 10,
};
const UNLISTED = `${TAG} Unlisted Cabinet`; // deliberately not on the Item list: earns 0

const STAFF = [
  { key: 'ali', name: 'Demo Driver Ali', role: 'driver' },
  { key: 'budi', name: 'Demo Assistant Budi', role: 'assistant' },
  { key: 'chong', name: 'Demo Driver Chong', role: 'driver' },
  { key: 'dewi', name: 'Demo Assistant Dewi', role: 'assistant' },
];
const TEAMS = [
  { key: 'A', driver: 'ali', assistant: 'budi', plate: 'PERFDEMO-A' },
  { key: 'B', driver: 'chong', assistant: 'dewi', plate: 'PERFDEMO-B' },
];

// lines: [item, ordered, delivered]; daysAgo is counted back from today (kept inside this month).
const ORDERS = [
  { n: 1, team: 'A', daysAgo: 0, status: 'Delivered', customer: 'Siti', note: 'full delivery',
    lines: [['NOVA 3-Seater L-Shape Sofa', 1, 1], ['Samsung 380L Top Freezer Fridge', 1, 1]] },
  { n: 2, team: 'A', daysAgo: 1, status: 'Delivered', customer: 'Tan', note: 'quantity 2 on a line',
    lines: [['Restonic Comfort Queen Mattress', 2, 2], ['LG 9kg Front Load Washer', 1, 1]] },
  { n: 3, team: 'A', daysAgo: 2, status: 'Delivered', customer: 'Wong', note: 'partial: 2 of 3 fridges',
    lines: [['Daikin 1.5HP Inverter Aircond', 1, 1], ['Samsung 380L Top Freezer Fridge', 3, 2]] },
  { n: 4, team: 'A', daysAgo: 1, status: 'Failed', customer: 'Lim', note: 'failed order: earns nothing',
    lines: [['NOVA 3-Seater L-Shape Sofa', 1, 0]] },
  { n: 5, team: 'B', daysAgo: 0, status: 'Delivered', customer: 'Siti', note: 'quantity 2 on a line',
    lines: [['NOVA 3-Seater L-Shape Sofa', 2, 2]] },
  { n: 6, team: 'B', daysAgo: 3, status: 'Delivered', customer: 'Tan', note: 'includes an item not on the Item list (0 points)',
    lines: [['LG 9kg Front Load Washer', 1, 1], ['Restonic Comfort Queen Mattress', 1, 1], [UNLISTED, 1, 1]] },
  { n: 7, team: 'B', daysAgo: 4, status: 'Delivered', customer: 'Wong', note: 'one line not delivered',
    lines: [['Samsung 380L Top Freezer Fridge', 1, 0], ['NOVA 3-Seater L-Shape Sofa', 1, 1]] },
];

const myDate = (offsetDays = 0) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - offsetDays * 86400000));
  return parts; // YYYY-MM-DD in Malaysia time
};

// ── Remove ────────────────────────────────────────────────────────────────────
async function remove() {
  const orders = await prisma.orders.findMany({ where: { odoo_order_ref: { startsWith: `${TAG}-` } }, select: { id: true, time_slot_id: true, customer_id: true } });
  const trucks = await prisma.trucks.findMany({ where: { plate_no: { startsWith: 'PERFDEMO-' } }, select: { id: true } });
  const truckIds = trucks.map(t => t.id);
  const slots = truckIds.length ? await prisma.time_slots.findMany({ where: { truck_id: { in: truckIds } }, select: { id: true } }) : [];
  const staff = await prisma.employees.findMany({ where: { email: { startsWith: 'perf.demo.', endsWith: '@example.invalid' } }, select: { id: true } });
  const staffIds = staff.map(s => s.id);
  const slotIds = [...new Set([...slots.map(s => s.id), ...orders.map(o => o.time_slot_id).filter(Boolean)])];
  await prisma.$transaction(async tx => {
    await tx.orders.deleteMany({ where: { id: { in: orders.map(o => o.id) } } }); // lines, awards, adjustments cascade
    await tx.lorry_trips.deleteMany({ where: { time_slot_id: { in: slotIds } } });
    await tx.time_slots.deleteMany({ where: { id: { in: slotIds } } });
    // Order matters: assignments -> teams -> trucks -> staff (each points at the next).
    await tx.employee_team_assignments.deleteMany({ where: { team: { team_type: { contains: TAG } } } });
    await tx.teams.deleteMany({ where: { team_type: { contains: TAG } } });
    await tx.trucks.deleteMany({ where: { id: { in: truckIds } } });
    await tx.customers.deleteMany({ where: { email: { startsWith: 'perf.demo.', endsWith: '@example.invalid' } } });
    await tx.employees.deleteMany({ where: { id: { in: staffIds } } });
  }, { timeout: 30000 });
  console.log(`Removed: ${orders.length} order(s), ${slotIds.length} slot(s), ${truckIds.length} truck(s), ${staffIds.length} staff. Item points were left as they are.`);
}

// ── Create ────────────────────────────────────────────────────────────────────
async function create({ award }) {
  const existing = await prisma.orders.count({ where: { odoo_order_ref: { startsWith: `${TAG}-` } } });
  if (existing) {
    console.log(`${existing} demo order(s) already exist. Nothing created. Run with --remove first to start over.`);
    return false;
  }
  const roles = await prisma.roles.findMany({ select: { id: true, name: true } });
  const roleId = kind => roles.find(r => r.name.toLowerCase().includes(kind))?.id ?? null;

  await prisma.$transaction(async tx => {
    // Staff, trucks, delivery teams
    const people = {};
    for (const person of STAFF) {
      people[person.key] = await tx.employees.create({ data: { name: person.name, email: EMAIL(person.key), role_id: roleId(person.role), active_flag: true } });
    }
    const teams = {};
    for (const team of TEAMS) {
      const truck = await tx.trucks.create({ data: { plate_no: team.plate, driver_id: people[team.driver].id, assistant_id: people[team.assistant].id } });
      const row = await tx.teams.create({ data: { team_type: `Delivery Team ${TAG} ${team.key}`, available_flag: true, primary_driver_id: people[team.driver].id, assistant_driver_id: people[team.assistant].id, truck_id: truck.id } });
      for (const key of [team.driver, team.assistant]) await tx.employee_team_assignments.create({ data: { employee_id: people[key].id, team_id: row.id, assigned_at: new Date() } });
      teams[team.key] = { team: row, truck, driver: people[team.driver], assistant: people[team.assistant] };
    }
    // Item points: add what is missing, never overwrite
    for (const [name, rate] of Object.entries(ITEM_RATES)) {
      const key = itemKey(name);
      if (!await tx.item_point_rates.findUnique({ where: { item_key: key } })) await tx.item_point_rates.create({ data: { item_key: key, item_name: name, points_per_item: rate, needs_review: false } });
    }
    // Customers
    const customers = {};
    for (const name of new Set(ORDERS.map(o => o.customer))) {
      customers[name] = await tx.customers.create({ data: { full_name: `${TAG} ${name}`, email: EMAIL(`customer.${name.toLowerCase()}`), phone: '0123456789', address: `${TAG} Jalan Demo 1`, city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50000', created_at: new Date() } });
    }
    // Orders: slot + trip (the crew) + delivered order with its lines
    const dom = Number(myDate(0).slice(8));
    for (const spec of ORDERS) {
      const group = teams[spec.team];
      const date = myDate(Math.min(spec.daysAgo, dom - 1)); // stay inside the current month when possible
      const done = new Date(`${date}T11:00:00+08:00`);
      const slot = await tx.time_slots.create({ data: { date, time_window_start: '10:00', time_window_end: '13:00', available_flag: false, created_at: done, delivery_team_id: group.team.id, truck_id: group.truck.id, slot_status: 'completed' } });
      await tx.lorry_trips.create({ data: { time_slot_id: slot.id, truck_id: group.truck.id, delivery_team_id: group.team.id, driver_id: group.driver.id, assistant_id: group.assistant.id, status: 'completed', started_at: new Date(done.getTime() - 3600000), ended_at: done } });
      await tx.orders.create({ data: {
        odoo_order_ref: `${TAG}-${String(spec.n).padStart(3, '0')}`, odoo_sales_ref: `${TAG}-SO-${spec.n}`,
        customer_id: customers[spec.customer].id, employee_id: group.driver.id, delivered_by: spec.status === 'Delivered' ? group.driver.id : null,
        order_status: spec.status, time_slot_id: slot.id, assignment_status: 'assigned',
        delivery_address: `${TAG} Jalan Demo 1, Kuala Lumpur`, created_at: done, updated_at: done,
        delivery_end_date_time: done, actual_arrival_date_time: done,
        order_products: { create: spec.lines.map(([name, ordered, delivered]) => ({
          odoo_product_name: name, quantity: ordered, delivered_quantity: delivered, service_type: 'delivery', handling_status: 'unloaded',
          item_delivery_status: delivered >= ordered ? 'delivered' : delivered === 0 ? 'failed' : 'delivered',
        })) },
      } });
    }
  }, { timeout: 60000 });

  if (award) {
    const orders = await prisma.orders.findMany({ where: { odoo_order_ref: { startsWith: `${TAG}-` } }, select: { id: true, odoo_order_ref: true }, orderBy: { odoo_order_ref: 'asc' } });
    for (const order of orders) { const r = await awardOrder(order.id); console.log(`  saved points ${order.odoo_order_ref}: ${r.awarded ? r.awarded + ' crew award(s)' : r.reason}`); }
  }
  return true;
}

// ── Expected numbers, worked out independently of the service ────────────────
async function printExpected() {
  const rates = new Map((await prisma.item_point_rates.findMany()).map(r => [r.item_key, r.points_per_item]));
  const rule = (await prisma.incentive_rules.findMany({ where: { active: true, effective_from: { lte: new Date() } }, orderBy: { effective_from: 'desc' }, take: 1 }))[0];
  const rm = rule?.rm_per_point ?? 0;
  console.log(`\nRM ${rm} per point. Points per item come from the Item list. Extra points are added on the page, per order.`);
  const totals = { A: { orders: 0, points: 0 }, B: { orders: 0, points: 0 } };
  console.log('\nExpected, per order (each crew member gets the full order points):');
  for (const spec of ORDERS) {
    const detail = spec.lines.map(([name, , delivered]) => ({ name, delivered, rate: rates.get(itemKey(name)) ?? 0 }));
    const points = detail.reduce((sum, d) => sum + d.delivered * d.rate, 0);
    const counts = spec.status === 'Delivered' && points > 0;
    console.log(`  ${TAG}-${String(spec.n).padStart(3, '0')}  Team ${spec.team}  ${spec.status.padEnd(9)} ${spec.note}`);
    detail.forEach(d => console.log(`      ${d.delivered} x ${d.rate} pt  ${d.name}`));
    console.log(`      => ${counts ? points : 0} pts${spec.status === 'Delivered' ? '' : '  (not delivered: excluded)'}`);
    if (counts) { totals[spec.team].orders += 1; totals[spec.team].points += points; }
  }
  console.log('\nExpected on the Employee Performance page (before any extra points):');
  for (const team of TEAMS) {
    const t = totals[team.key];
    for (const key of [team.driver, team.assistant]) {
      console.log(`  ${STAFF.find(s => s.key === key).name.padEnd(22)} orders ${t.orders}  total ${t.points} pts  incentive RM ${(t.points * rm).toFixed(2)}`);
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const host = (() => { try { const url = new URL(process.env.DATABASE_URL); return `${url.hostname}${url.pathname}`; } catch { return 'unknown database'; } })();
  console.log(`Target: ${host}${args.has('--apply') || args.has('--remove') ? '' : '  (dry run)'}`);

  if (args.has('--remove')) return remove();
  if (!args.has('--apply')) {
    console.log(`\nWould create: ${STAFF.length} staff in ${TEAMS.length} delivery teams, ${ORDERS.length} orders (${ORDERS.filter(o => o.status === 'Delivered').length} delivered), customers, trucks, and any missing item points.`);
    await printExpected();
    console.log('\nDry run: nothing written. Re-run with --apply.');
    return;
  }
  const created = await create({ award: args.has('--award') });
  if (created) {
    console.log(`\nCreated the ${TAG} demo data${args.has('--award') ? ' with saved points' : ' (points shown as Estimated until saved)'}.`);
    await printExpected();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
