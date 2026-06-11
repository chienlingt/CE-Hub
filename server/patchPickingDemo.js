const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const prisma = require('./prismaClient');

async function patch() {
  const order = await prisma.orders.findFirst({ where: { odoo_order_ref: 'DEMO-PICK-001' } });
  if (!order) { console.log('Order DEMO-PICK-001 not found'); return; }

  // Rewind order to Delivering (in transit)
  await prisma.orders.update({
    where: { id: order.id },
    data: {
      order_status:           'Delivering',
      salesperson_name:       'Ben',
      salesperson_phone:      '01172293772',
      delivered_by:           null,
      delivery_end_date_time: null,
      delivery_evidence:      [],
      proof_of_delivery_url:  null,
      updated_at:             new Date(),
    },
  });
  console.log('Order → Delivering (in transit), salesperson → Ben / 01172293772');

  // Reset items to loaded (on truck, not yet unloaded)
  await prisma.order_products.updateMany({
    where: { order_id: order.id },
    data:  { picking_status: 'loaded', unloaded_by: null, unloaded_at: null, unloaded_serial: null },
  });
  console.log('Items → loaded (on truck)');

  await prisma.customers.update({
    where: { id: order.customer_id },
    data:  { phone: '01162607838' },
  });
  console.log('Customer phone → 01162607838');

  const admin = await prisma.employees.findFirst({ where: { email: 'admin.test@cehub.local' } });
  if (admin) {
    await prisma.employees.update({ where: { id: admin.id }, data: { contact_number: '01172293772' } });
    console.log('Admin contact_number → 01172293772');
  }
  console.log('Done.');
}

patch().catch(console.error).finally(() => prisma.$disconnect());
