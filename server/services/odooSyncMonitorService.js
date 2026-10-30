const prisma = require('../prismaClient');
// Fixed SQL with bound values only. Include failed DOs that never reached orders.
const BASE = `WITH events AS (
  SELECT r.id, r.source, r.status AS run_status, r.created_at, r.updated_at,
    r.next_retry_at, r.report->>'request_id' AS request_id,
    e->>'do_ref' AS do_ref, e->>'outcome' AS outcome, e->>'code' AS code,
    COALESCE(e->>'message', e->>'reason') AS reason,
    COALESCE(e->>'retryable', 'false') = 'true' AS retryable,
    r.report->>'endpoint' AS endpoint, r.report->>'action' AS action
  FROM odoo_sync_runs r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.report->'outcomes', '[]'::jsonb)) e
  WHERE NULLIF(e->>'do_ref', '') IS NOT NULL
), refs AS (
  SELECT odoo_order_ref AS do_ref FROM orders WHERE NULLIF(odoo_order_ref, '') IS NOT NULL
  UNION SELECT do_ref FROM events
), latest AS (
  SELECT DISTINCT ON (do_ref) * FROM events ORDER BY do_ref, updated_at DESC, created_at DESC, id DESC
), origin AS (
  SELECT DISTINCT ON (do_ref) do_ref, source FROM events
  WHERE outcome IN ('synced', 'created') ORDER BY do_ref, created_at ASC, id ASC
), rows AS (
  SELECT refs.do_ref, o.id AS order_id, c.full_name AS customer_name, o.order_status AS ce_hub_status,
    COALESCE(origin.source, latest.source, 'unknown') AS source, origin.source AS import_source, latest.source AS latest_source,
    latest.code, latest.reason, latest.next_retry_at, latest.endpoint, latest.run_status,
    latest.request_id, latest.updated_at AS last_sync_at,
    COALESCE(latest.updated_at, o.updated_at, o.created_at) AS activity_at,
    CASE WHEN latest.outcome = 'failed' AND latest.retryable AND latest.run_status IN ('retry_wait','running') THEN 'retrying'
      WHEN latest.outcome = 'failed' THEN 'failed'
      WHEN latest.outcome = 'pending_approval' AND cr.status = 'approved' THEN 'updated'
      WHEN latest.outcome = 'pending_approval' AND cr.status = 'rejected' THEN 'rejected'
      WHEN latest.outcome = 'pending_approval' THEN 'pending_approval'
      WHEN latest.outcome IN ('created','synced') THEN 'imported'
      WHEN latest.outcome = 'updated' THEN 'updated'
      WHEN latest.outcome IS NULL THEN 'not_recorded'
      ELSE latest.outcome END AS sync_status,
    CASE WHEN latest.source = 'fallback_5pm' AND latest.outcome = 'failed' AND latest.run_status IN ('needs_correction', 'retry_exhausted') THEN 'Correct Odoo data/configuration, then use Run history → Retry failed. The original date and recovery deadline are retained.'
      WHEN latest.run_status = 'needs_correction' AND latest.outcome = 'failed' THEN 'Correct the data in Odoo and resend the full snapshot.'
      WHEN latest.outcome = 'failed' AND latest.retryable AND latest.run_status = 'retry_wait' THEN 'Automatic retry scheduled for the original date.'
      WHEN latest.outcome = 'failed' THEN 'Investigate the error, then ask GCA to resend the appropriate webhook.'
      WHEN cr.status = 'rejected' THEN 'Review the rejection reason and correct the Odoo snapshot.'
      ELSE NULL END AS next_action,
    cr.review_note,
    EXISTS (SELECT 1 FROM odoo_change_requests p WHERE p.do_ref = refs.do_ref AND p.status = 'pending') AS needs_approval,
    refs.do_ref LIKE 'SYNC-DEMO-%' AS preview_only
  FROM refs LEFT JOIN orders o ON o.odoo_order_ref = refs.do_ref LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN latest ON latest.do_ref = refs.do_ref LEFT JOIN origin ON origin.do_ref = refs.do_ref
  LEFT JOIN odoo_change_requests cr ON cr.id::text = latest.request_id
) `;
function validateFilters(query) {
  const offset = Number(query.offset || 0), search = String(query.search || '').trim();
  const source = query.source || '', status = query.status || '';
  if (!Number.isInteger(offset) || offset < 0 || search.length > 200 || !['', 'odoo_webhook', 'fallback_5pm', 'unknown'].includes(source)
    || !['', 'attention', 'imported', 'updated', 'failed', 'retrying', 'pending_approval', 'rejected', 'skipped', 'unchanged', 'accepted', 'previously_reviewed', 'not_recorded'].includes(status)) throw Object.assign(new Error('Invalid monitor filter.'), { status: 400 });
  return { offset, search, source, status };
}
async function incomingOrders(query) {
  const { offset, search, source, status } = validateFilters(query);
  const where = `WHERE ($1 = '' OR source = $1) AND ($2 = '' OR sync_status = $2 OR ($2 = 'attention' AND sync_status IN ('failed','retrying','rejected')))
    AND ($3 = '' OR do_ref ILIKE '%' || $3 || '%' OR customer_name ILIKE '%' || $3 || '%')`;
  const [rows, count, summary] = await Promise.all([
    prisma.$queryRawUnsafe(BASE + `SELECT * FROM rows ${where} ORDER BY activity_at DESC NULLS LAST, do_ref LIMIT 25 OFFSET $4`, source, status, search, offset),
    prisma.$queryRawUnsafe(BASE + `SELECT COUNT(*)::int AS total FROM rows ${where}`, source, status, search),
    prisma.$queryRawUnsafe(BASE + `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE sync_status IN ('failed','retrying','rejected'))::int AS attention,
      COUNT(*) FILTER (WHERE source = 'odoo_webhook')::int AS webhook, COUNT(*) FILTER (WHERE source = 'fallback_5pm')::int AS fallback FROM rows`),
  ]);
  return { rows, total: count[0].total, summary: summary[0] };
}
async function outgoingJobs(query) {
  const status = query.status || '', offset = Number(query.offset || 0);
  if (!['', 'pending', 'processed', 'dead'].includes(status) || !Number.isInteger(offset) || offset < 0) throw Object.assign(new Error('Invalid outgoing filter.'), { status: 400 });
  const where = { target: 'odoo', ...(status ? { status } : {}) };
  const [rows, total, pending, dead, processed, approvals, runIssues] = await Promise.all([
    prisma.integration_outbox.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: offset, take: 25 }),
    prisma.integration_outbox.count({ where }), prisma.integration_outbox.count({ where: { target: 'odoo', status: 'pending' } }),
    prisma.integration_outbox.count({ where: { target: 'odoo', status: 'dead' } }), prisma.integration_outbox.count({ where: { target: 'odoo', status: 'processed' } }),
    prisma.odoo_change_requests.count({ where: { status: 'pending' } }),
    prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM odoo_sync_runs r
      WHERE r.status IN ('retry_wait','retry_exhausted','needs_correction','sender_retry_required')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(r.report->'outcomes', '[]'::jsonb)) e WHERE NULLIF(e->>'do_ref', '') IS NOT NULL)`),
  ]);
  return { rows, total, summary: { pending, dead, processed, approvals, run_issues: runIssues[0].count } };
}
module.exports = { incomingOrders, outgoingJobs };
