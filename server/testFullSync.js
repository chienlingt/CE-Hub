const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { getOrdersForDeliveryDate, getOrderDetail } = require('./services/odooService');
const { pushOrder } = require('./services/odooOrderIngestService');
const prisma = require('./prismaClient');

async function run() {
  const date = '2024-05-04';

  console.log(`\n── Fetching pickings for ${date} ──`);
  const orders = await getOrdersForDeliveryDate(date);
  console.log(`Found ${orders?.length ?? 0} picking(s)\n`);

  for (const oo of orders) {
    const existing = await prisma.orders.findFirst({ where: { odoo_order_ref: oo.name } });
    if (existing) {
      console.log(`SKIP (already in CE Hub): ${oo.name}`);
      continue;
    }

    console.log(`── Resolving detail for ${oo.name} ──`);
    const detail = await getOrderDetail(oo.id);
    console.log(JSON.stringify(detail, null, 2));

    console.log(`── Pushing ${oo.name} into CE Hub ──`);
    const result = await pushOrder(detail);
    console.log('Result:', JSON.stringify(result, null, 2));
  }

  await prisma.$disconnect();
  console.log('\nDone.');
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
