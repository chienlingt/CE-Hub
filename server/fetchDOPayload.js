/**
 * fetchDOPayload.js
 * Looks up a stock.picking by name in Odoo and prints the exact
 * webhook payload + ready-to-run curl command for CE Hub testing.
 *
 * Usage:
 *   node fetchDOPayload.js "091/DOO/35914"
 */
require('dotenv').config();
const { getOrderDetail, callModel } = require('./services/odooService');

async function main() {
  const doName = process.argv[2];
  if (!doName) {
    console.error('Usage: node fetchDOPayload.js "DO_NAME"');
    process.exit(1);
  }

  console.log(`\nLooking up "${doName}" in Odoo…\n`);

  // 1. Find the picking ID by name
  const pickings = await callModel(
    'stock.picking', 'search_read',
    [[['name', '=', doName]]],
    { fields: ['id', 'name'], limit: 1 }
  );

  if (!pickings?.length) {
    console.error(`❌  No stock.picking found with name "${doName}".`);
    console.error('    Check the exact spelling — Odoo names are case-sensitive.');
    process.exit(1);
  }

  const pickingId = pickings[0].id;
  console.log(`✔  Found picking id=${pickingId}\n`);

  // 2. Fully resolve the DO into webhook payload shape
  const detail = await getOrderDetail(pickingId);

  if (!detail) {
    console.error('❌  Could not resolve order detail. Check Odoo permissions.');
    process.exit(1);
  }

  // 3. Build the payload object
  const payload = {
    id:                  detail.id,
    name:                detail.name,
    sales_order_name:    detail.sales_order_name    || '',
    partner_name:        detail.partner_name         || '',
    partner_email:       detail.partner_email        || '',
    partner_phone:       detail.partner_phone        || '',
    delivery_address:    detail.delivery_address     || '',
    delivery_city:       detail.delivery_city        || '',
    delivery_state_name: detail.delivery_state_name  || '',
    delivery_zip:        detail.delivery_zip         || '',
    delivery_remarks:    detail.delivery_remarks      || '',
    salesperson_name:    detail.salesperson_name     || '',
    salesperson_phone:   detail.salesperson_phone    || '',
    order_lines:         detail.order_lines || [],
  };

  // 4. Print summary
  console.log('── Payload summary ──────────────────────────────────────');
  console.log(`DO ref       : ${payload.name}`);
  console.log(`SO ref       : ${payload.sales_order_name || '(none)'}`);
  console.log(`Customer     : ${payload.partner_name || '(none)'}`);
  console.log(`Email        : ${payload.partner_email || '(none)'}`);
  console.log(`Phone        : ${payload.partner_phone || '(none)'}`);
  console.log(`Address      : ${payload.delivery_address || '(none)'}`);
  console.log(`City         : ${payload.delivery_city || '(none)'}`);
  console.log(`State        : ${payload.delivery_state_name || '(none)'}`);
  console.log(`Zip          : ${payload.delivery_zip || '(none)'}`);
  console.log(`Remarks      : ${payload.delivery_remarks || '(none)'}`);
  console.log(`Salesperson  : ${payload.salesperson_name || '(none)'}`);
  console.log(`Lines (${String(payload.order_lines.length).padEnd(3)}): `);
  payload.order_lines.forEach((l, i) => {
    console.log(`  [${i + 1}] line_id=${l.order_line_id ?? 'null'}  qty=${l.product_uom_qty}  serial=${l.serial_number || '(none)'}  name="${l.product_name}"`);
  });

  console.log('\n── curl command ─────────────────────────────────────────\n');

  const port = process.env.PORT || 4000;
  const secret = process.env.ODOO_WEBHOOK_SECRET || 'tbm2u';

  const curlCmd = `curl -s -X POST http://localhost:${port}/api/webhooks/odoo/order \\
  -H "Content-Type: application/json" \\
  -H "x-odoo-secret: ${secret}" \\
  -d '${JSON.stringify(payload, null, 2).replace(/'/g, "'\\''")}' | jq .`;

  console.log(curlCmd);
  console.log('\n────────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
