const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const prisma = require('./prismaClient');

async function run() {
  const order = await prisma.orders.findFirst({
    where: { odoo_order_ref: 'DEMO-PICK-001' },
    include: { order_products: { include: { products: { select: { product_name: true } } } } },
  });
  if (!order) { console.log('Not found'); return; }
  console.log('order id:', order.id);
  order.order_products.forEach(p =>
    console.log(`  product id: ${p.id}  — ${p.products?.product_name}`)
  );
}

run().catch(console.error).finally(() => prisma.$disconnect());
