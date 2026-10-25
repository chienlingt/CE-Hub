// Additive UI preview data, strictly LOCAL Docker. No truncate, no external calls.
const { PrismaClient } = require('@prisma/client');
const Module = require('module'), fs = require('fs'), path = require('path');
const previewUrl = process.env.SYNC_PREVIEW_DATABASE_URL || 'postgresql://tbm_demo:tbm_demo@localhost:5433/tbm_demo?schema=public';
const previewTarget = new URL(previewUrl);
if (!['localhost', '127.0.0.1'].includes(previewTarget.hostname) || previewTarget.port !== '5433' || !/^\/(tbm_demo|tbm_demo_tbm_stage_\d+)$/.test(previewTarget.pathname)) throw new Error('Preview seed accepts local demo/staging databases only.');
const db = new PrismaClient({ datasources: { db: { url: previewUrl } } });
function reviewService() {
  const filename = path.join(__dirname, 'services/odooChangeReviewService.js');
  const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod); mod.require = name => name === '../prismaClient' ? db : normal(name);
  mod._compile(fs.readFileSync(filename, 'utf8'), filename); return mod.exports;
}
const ago = minutes => new Date(Date.now() - minutes * 60000);
async function main() {
  const identity = await db.$queryRawUnsafe('SELECT current_database() AS name');
  if (identity[0].name !== previewTarget.pathname.slice(1)) throw new Error('Unexpected database. Aborting.');
  const before = await db.orders.count();
  let customer = await db.customers.findFirst({ where: { email: 'sync.preview@example.invalid' } });
  if (!customer) customer = await db.customers.create({ data: { full_name: 'Sync Monitor Preview', email: 'sync.preview@example.invalid', phone: null, created_at: new Date() } });
  const scenarios = [
    ['101', 'Scheduled', 'odoo_webhook'], ['102', 'Delivering', 'fallback_5pm'],
    ['103', 'Delivered', 'odoo_webhook'], ['104', 'Failed', 'fallback_5pm'],
    ['105', 'Scheduled', 'odoo_webhook'], ['106', 'Loaded', 'fallback_5pm'],
  ];
  const orders = [];
  for (const [i, [suffix, status, source]] of scenarios.entries()) {
    const ref = 'SYNC-DEMO-' + suffix;
    const order = await db.orders.upsert({ where: { odoo_order_ref: ref }, update: {}, create: {
      customer_id: customer.id, odoo_order_ref: ref, odoo_picking_id: 9800100 + i, order_status: status,
      doo_ready: false, delivery_remarks: 'Layout preview only — do not dispatch.', delivery_address: 'Shah Alam (preview)',
      created_at: ago(100 - i * 5), updated_at: ago(100 - i * 5),
      order_products: { create: { quantity: 1, prepared_quantity: 0, serial_tracking: 'serial', odoo_product_name: 'Preview television',
        odoo_line_id: 9801100 + i, odoo_line_model: 'stock.move', assigned_serials: [], unit_scans: [{ handling_status: 'pending', assigned_serial: null }], service_type: 'delivery' } },
    } });
    orders.push(order);
    const outcome = { picking_id: order.odoo_picking_id, do_ref: ref, outcome: source === 'odoo_webhook' ? 'created' : 'synced' };
    await db.odoo_sync_runs.upsert({ where: { run_key: 'sync_preview:import:' + ref }, update: {}, create: {
      run_key: 'sync_preview:import:' + ref, source, target_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }),
      status: 'completed', attempts: 1, created_at: ago(95 - i * 5), updated_at: ago(95 - i * 5),
      report: { preview_only: true, mechanism: source === 'odoo_webhook' ? 'Odoo webhook' : 'Odoo polling API', endpoint: source === 'odoo_webhook' ? '/odoo/order' : null,
        counts: { candidates: 1, synced: 1, skipped: 0, failed: 0 }, outcomes: [outcome] },
    } });
  }
  // Two rejected DOs that never became CE Hub orders, plus one temporary failure.
  for (const [suffix, source, temporary, reason] of [
    ['201', 'odoo_webhook', false, 'Line 1: prepared quantity exceeds required quantity.'],
    ['202', 'fallback_5pm', false, 'Missing confirmed appointment mapping. Correct Odoo data and resend.'],
    ['203', 'fallback_5pm', true, 'Temporary Odoo timeout. Retry keeps the original delivery date.'],
  ]) {
    const ref = 'SYNC-DEMO-' + suffix;
    await db.odoo_sync_runs.upsert({ where: { run_key: 'sync_preview:failed:' + ref }, update: {}, create: {
      run_key: 'sync_preview:failed:' + ref, source, status: temporary ? 'retry_wait' : 'needs_correction', attempts: 1,
      target_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }), next_retry_at: temporary ? new Date(Date.now() + 15 * 60000) : null,
      created_at: ago(10), updated_at: ago(10), report: { preview_only: true, endpoint: source === 'odoo_webhook' ? '/odoo/order' : null,
        counts: { candidates: 1, synced: 0, skipped: 0, failed: 1 }, outcomes: [{ picking_id: 9800200 + Number(suffix), do_ref: ref,
          outcome: 'failed', retryable: temporary, code: temporary ? 'ETIMEDOUT' : 'INVALID_PREPARATION', message: reason }] },
    } });
  }
  const review = reviewService();
  const order = orders[4];
  const item = await db.order_products.findFirst({ where: { order_id: order.id } });
  const request = await review.saveChangeRequest({ id: order.odoo_picking_id, name: order.odoo_order_ref, order_line_model: 'stock.move', doo_ready: false,
    delivery_remarks: 'Customer requests lift access confirmation (preview).', order_lines: [{ order_line_id: item.odoo_line_id, product_name: item.odoo_product_name,
      product_uom_qty: 1, prepared_quantity: 0, tracking: 'serial', serial_numbers: [] }] }, 'order');
  if (request.request_id) await db.odoo_sync_runs.upsert({ where: { run_key: 'sync_preview:approval:' + order.odoo_order_ref }, update: {}, create: {
    run_key: 'sync_preview:approval:' + order.odoo_order_ref, source: 'odoo_webhook', status: 'pending_approval', attempts: 1,
    created_at: ago(5), updated_at: ago(5), report: { preview_only: true, request_id: request.request_id, endpoint: '/odoo/order',
      counts: { candidates: 1, synced: 0, skipped: 0, failed: 0, pending: 1 }, outcomes: [{ do_ref: order.odoo_order_ref, outcome: 'pending_approval' }] },
  } });
  for (const [i, [status, attempts, progress]] of [['pending', 0, 'Scheduled'], ['pending', 2, 'Delivering'], ['processed', 1, 'Delivered'], ['dead', 8, 'Failed']].entries()) {
    const order = orders[i];
    const job = {
      idempotency_key: 'sync_preview:job:' + order.odoo_order_ref, target: 'odoo', event_type: 'SLOT_STATUS_CHANGED', status, attempts,
      payload: { preview_only: true, do_ref: order.odoo_order_ref, status: progress, ce_hub_order_ref: order.id },
      next_retry_at: status === 'pending' ? new Date(Date.now() + 10 * 60000) : null, processed_at: status === 'processed' ? ago(8) : null,
      last_error: status === 'dead' ? 'Preview: Odoo rejected the status field mapping. Investigate before retry.' : attempts > 1 ? 'Preview: Odoo connection timed out.' : null,
      created_at: ago(12 - i),
    };
    if (progress === 'Scheduled') job.event_type = 'ORDER_SCHEDULED';
    await db.integration_outbox.upsert({ where: { idempotency_key: job.idempotency_key }, update: job, create: job });
  }
  console.log('Local Docker preview seeded:', await db.orders.count() - before, 'new orders. Existing orders preserved.');
  console.log('6 imported orders, 3 failed imports, 1 approval case, 4 outgoing jobs. All external workers exclude preview data.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
