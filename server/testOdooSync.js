const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { getOrdersForDeliveryDate, getOrderDetail } = require('./services/odooService');

async function test() {
  // Sandbox has data for this MYT date (scheduled_date "2024-02-28 16:00:00" UTC = 2024-02-29 MYT)
  const date = '2024-05-04';

  console.log(`\n── Step 1: getOrdersForDeliveryDate('${date}') ──`);
  const orders = await getOrdersForDeliveryDate(date);
  console.log(`Found ${orders?.length ?? 0} picking(s):`);
  console.log(JSON.stringify(orders, null, 2));

  if (!orders?.length) return;

  console.log(`\n── Step 2: getOrderDetail(${orders[0].id}) ──`);
  const detail = await getOrderDetail(orders[0].id);
  console.log(JSON.stringify(detail, null, 2));
}

test()
  .catch(err => console.error('Test failed:', err))
  .finally(() => process.exit(0));
