/**
 * diagnoseSyncDate.js
 * Shows ALL stock.picking records for a given MYT date, regardless of state,
 * so you can see why some were skipped by the sync filter.
 *
 * Usage:
 *   node diagnoseSyncDate.js 2026-07-10
 */
require('dotenv').config();
const { callModel } = require('./services/odooService');
const prisma = require('./prismaClient');

async function main() {
  const dateStr = process.argv[2];
  if (!dateStr) {
    console.error('Usage: node diagnoseSyncDate.js YYYY-MM-DD');
    process.exit(1);
  }

  const utcStart = new Date(`${dateStr}T00:00:00+08:00`).toISOString().replace('T', ' ').slice(0, 19);
  const utcEnd   = new Date(`${dateStr}T23:59:59+08:00`).toISOString().replace('T', ' ').slice(0, 19);

  console.log(`\nQuerying Odoo for MYT date: ${dateStr}`);
  console.log(`UTC window: ${utcStart} → ${utcEnd}\n`);

  // Query ALL outgoing pickings for the date — no state filter
  const all = await callModel('stock.picking', 'search_read',
    [[
      ['picking_type_code', '=', 'outgoing'],
      ['scheduled_date', '>=', utcStart],
      ['scheduled_date', '<=', utcEnd],
    ]],
    { fields: ['id', 'name', 'state', 'scheduled_date', 'sale_id'], limit: 200 }
  );

  if (!all?.length) {
    console.log('No outgoing pickings found for this date at all.');
    console.log('→ Check the date or try a different one in Odoo.');
    process.exit(0);
  }

  console.log(`Found ${all.length} outgoing picking(s) total:\n`);

  // Check which are already in CE Hub
  const refs = all.map(p => p.name).filter(Boolean);
  const existing = await prisma.orders.findMany({
    where: { odoo_order_ref: { in: refs } },
    select: { odoo_order_ref: true, order_status: true },
  });
  const existingMap = new Map(existing.map(o => [o.odoo_order_ref, o.order_status]));

  const SYNC_STATES = ['assigned', 'confirmed'];

  const rows = all.map(p => ({
    name:           p.name,
    state:          p.state,
    scheduled_date: p.scheduled_date,
    in_ce_hub:      existingMap.has(p.name) ? `YES (${existingMap.get(p.name)})` : 'NO',
    sync_eligible:  SYNC_STATES.includes(p.state) ? '✔' : '✘ filtered out',
  }));

  // Print table
  const col = (s, n) => String(s ?? '').padEnd(n);
  console.log(
    col('DO Reference', 22) +
    col('State', 12) +
    col('Scheduled (UTC)', 22) +
    col('In CE Hub', 24) +
    'Sync eligible?'
  );
  console.log('─'.repeat(100));
  rows.forEach(r => {
    console.log(
      col(r.name, 22) +
      col(r.state, 12) +
      col(r.scheduled_date, 22) +
      col(r.in_ce_hub, 24) +
      r.sync_eligible
    );
  });

  const skipped = rows.filter(r => r.sync_eligible !== '✔');
  if (skipped.length) {
    console.log(`\n${skipped.length} picking(s) skipped by sync filter:`);
    const byState = {};
    skipped.forEach(r => { byState[r.state] = (byState[r.state] || 0) + 1; });
    Object.entries(byState).forEach(([state, count]) => {
      const reason =
        state === 'done'   ? 'already delivered in Odoo' :
        state === 'cancel' ? 'cancelled in Odoo' :
        state === 'draft'  ? 'not yet confirmed' :
        state === 'waiting'? 'waiting for another operation' :
        'unknown state';
      console.log(`  ${count}x state="${state}" — ${reason}`);
    });
  }

  console.log('');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
