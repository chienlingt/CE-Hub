// server/backfillIncentivePoints.js
//
// FR-10: write point snapshots for orders that were completed before the
// incentive module existed (or whose award failed). Idempotent: orders that
// already have awards are skipped, existing snapshots are never rewritten.
//
// NOTE: past orders are valued with the rule in force at their completion time.
// With only the seeded default rule, that is today's rate, not what was paid.
//
//   node backfillIncentivePoints.js            dry run (default): counts only
//   node backfillIncentivePoints.js --apply    write the awards
//   node backfillIncentivePoints.js --apply --since 2026-10-01

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const prisma = require('./prismaClient');
const { awardOrder, COMPLETED_STATUSES } = require('./services/incentiveService');

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const sinceIndex = args.indexOf('--since');
  const since = sinceIndex >= 0 ? new Date(`${args[sinceIndex + 1]}T00:00:00+08:00`) : null;
  if (sinceIndex >= 0 && !Number.isFinite(since?.getTime())) throw new Error('--since needs a YYYY-MM-DD date.');

  const orders = await prisma.orders.findMany({
    where: {
      order_status: { in: COMPLETED_STATUSES.flatMap(s => [s, s[0].toUpperCase() + s.slice(1)]) },
      order_point_awards: { none: {} },
      ...(since && { delivery_end_date_time: { gte: since } }),
    },
    select: { id: true, odoo_order_ref: true },
    orderBy: { delivery_end_date_time: 'asc' },
  });
  console.log(`${orders.length} completed order(s) without points${since ? ` since ${args[sinceIndex + 1]}` : ''}.`);
  if (!apply) {
    console.log('Dry run: nothing written. Re-run with --apply to award points.');
    return;
  }

  const tally = {};
  let awarded = 0;
  for (const order of orders) {
    try {
      const result = await awardOrder(order.id);
      awarded += result.awarded;
      const key = result.awarded ? 'awarded' : result.reason;
      tally[key] = (tally[key] || 0) + 1;
    } catch (error) {
      tally.error = (tally.error || 0) + 1;
      console.error('Failed:', order.odoo_order_ref || order.id, '-', error.message);
    }
  }
  console.log('Done. Award rows written:', awarded, 'Orders by outcome:', tally);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
