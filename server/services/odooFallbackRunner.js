const prisma = require('../prismaClient');
const { validateDate, tomorrowMalaysia } = require('./odooFallbackPolicy');
const { error, latestSchedule, assertDeadline, DAY } = require('./odooFallbackSafety');
const { flushRunAlerts } = require('./odooFallbackAlerts');
const DELAYS = [5, 15, 30], LEASE = 5 * 60000;
let working = false;
const copy = value => JSON.parse(JSON.stringify(value || {}));
function merge(report, result) {
  const map = new Map((report.outcomes || []).map(item => [item.do_ref || 'id:' + item.picking_id, item]));
  const canonical = item => {
    if (item.picking_id != null) for (const [key, previous] of map) {
      if (previous.picking_id === item.picking_id && key !== (item.do_ref || 'id:' + item.picking_id)) map.delete(key);
    }
  };
  for (const item of result.synced_records || []) { canonical(item); map.set(item.do_ref, { ...item, outcome: 'synced' }); }
  for (const name of result.synced_dos || []) if (!map.has(name) || map.get(name).outcome !== 'synced') map.set(name, { do_ref: name, outcome: 'synced' });
  for (const item of result.skips || []) { canonical(item); if (map.get(item.do_ref)?.outcome !== 'synced') map.set(item.do_ref || 'id:' + item.picking_id, { ...item, outcome: 'skipped' }); }
  for (const item of result.failures || []) { canonical(item); if (map.get(item.do_ref)?.outcome !== 'synced') map.set(item.do_ref || 'id:' + item.picking_id, { ...item, outcome: 'failed' }); }
  report.outcomes = [...map.values()];
  report.counts = { candidates: map.size, synced: report.outcomes.filter(o => o.outcome === 'synced').length,
    skipped: report.outcomes.filter(o => o.outcome === 'skipped').length, failed: report.outcomes.filter(o => o.outcome === 'failed').length };
}
async function lock(tx, id) { await tx.$queryRaw`SELECT id FROM odoo_sync_runs WHERE id = ${id}::uuid FOR UPDATE`; }
async function executeRun(input) {
  const row = await prisma.$transaction(async tx => {
    await lock(tx, input.id);
    const current = await tx.odoo_sync_runs.findUnique({ where: { id: input.id } });
    if (!current || current.run_key.startsWith('sync_preview:') || current.report?.preview_only) return null;
    const now = new Date();
    if (!(current.status === 'queued' || (current.status === 'retry_wait' && current.next_retry_at <= now) || (current.status === 'running' && current.lease_until <= now))) return null;
    const report = copy(current.report);
    report.history ||= []; report.outcomes ||= [];
    report.deadline_at ||= new Date(new Date(current.created_at).getTime() + DAY).toISOString();
    const cycleAttempts = current.attempts - (report.cycle_start_attempt || 0);
    try { assertDeadline({ ...current, report }, now); if (cycleAttempts >= 4) throw error('RETRY_LIMIT', 'Four automatic attempts exhausted.'); }
    catch (e) {
      report.error = e.message; report.pending_alert = 'retry_exhausted';
      await tx.odoo_sync_runs.update({ where: { id: current.id }, data: { status: 'retry_exhausted', report, lease_until: null, next_retry_at: null } }); return null;
    }
    return tx.odoo_sync_runs.update({ where: { id: current.id }, data: { status: 'running', attempts: { increment: 1 }, report, next_retry_at: null, lease_until: new Date(Date.now() + LEASE), updated_at: now } });
  });
  if (!row) return;
  const attempt = row.attempts, report = copy(row.report), cycleAttempt = attempt - (report.cycle_start_attempt || 0);
  let lost = false;
  const save = data => prisma.odoo_sync_runs.updateMany({ where: { id: row.id, attempts: attempt, status: 'running', lease_until: { gt: new Date() } }, data: { ...data, updated_at: new Date() } });
  function check(current) {
    if (lost || !current || current.status !== 'running' || current.attempts !== attempt || !current.lease_until || new Date(current.lease_until) <= new Date()) throw error('RUN_LEASE_LOST', 'Run ownership lost; stale worker stopped.');
    assertDeadline(current);
  }
  const assertActive = async () => { check(await prisma.odoo_sync_runs.findUnique({ where: { id: row.id } })); };
  const heartbeat = setInterval(() => {
    save({ lease_until: new Date(Date.now() + LEASE) }).then(r => { if (!r.count) lost = true; }).catch(() => { lost = true; });
  }, 60000);
  let result;
  try {
    const manual = report.manual_pending === true;
    const retryOrders = report.discovery_complete ? report.outcomes.filter(o => o.outcome === 'failed' && (manual || o.retryable)).map(o => ({ id: o.picking_id, name: o.do_ref })) : null;
    result = await require('./odooSyncService').runFallbackAttempt(row.target_date, {
      assertActive, retryOrders,
      excludeIds: report.outcomes.filter(o => ['synced', 'skipped'].includes(o.outcome) || (o.outcome === 'failed' && !o.retryable && !manual)).map(o => o.picking_id),
      commitCandidate: async (order, work) => {
        const answer = await prisma.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(19761019)`;
          await lock(tx, row.id);
          const fresh = await tx.odoo_sync_runs.findUnique({ where: { id: row.id } });
          check(fresh);
          const imported = await work(tx);
          check({ ...fresh, lease_until: fresh.lease_until }); // Deadline/lease also checked after DB work, before commit.
          const durable = copy(fresh.report);
          if (imported.success && imported.action === 'created') {
            merge(durable, { synced_records: [{ picking_id: order.id, do_ref: order.name, order_id: imported.order_id }] });
            await tx.odoo_sync_runs.update({ where: { id: row.id }, data: { report: durable, updated_at: new Date() } });
          }
          return imported;
        }, { timeout: 20000 });
        return answer;
      },
      onProgress: async partial => {
        const durable = await prisma.$transaction(async tx => {
          await lock(tx, row.id);
          const fresh = await tx.odoo_sync_runs.findUnique({ where: { id: row.id } });
          check(fresh);
          const latest = copy(fresh.report);
          merge(latest, partial); // Preserve committed successes after an uncertain commit response.
          await tx.odoo_sync_runs.update({ where: { id: row.id }, data: { report: latest, lease_until: new Date(Date.now() + LEASE), updated_at: new Date() } });
          return latest;
        });
        Object.assign(report, durable);
      },
    });
  } catch (e) {
    if (e.code === 'RUN_LEASE_LOST') { lost = true; return; }
    const failure = require('./odooSyncRunService').classifyFailure(e);
    result = { complete: false, discovery_error: failure, error: failure.message, failures: [], skips: [], synced_dos: [] };
  } finally { clearInterval(heartbeat); }
  if (lost) return;
  if (result.discovery_error?.code === 'RUN_LEASE_LOST') return;
  if (result.status === 'busy') {
    report.cycle_start_attempt = (report.cycle_start_attempt || 0) + 1;
    await save({ status: 'retry_wait', report, next_retry_at: new Date(Date.now() + 60000), lease_until: null }); return;
  }
  merge(report, result);
  report.manual_pending = false;
  report.discovery_complete = report.discovery_complete || result.complete;
  report.mechanism = 'Odoo polling API';
  report.error = result.error || null; report.discovery_error = result.discovery_error || null;
  report.policy = result.policy || report.policy || null;
  const temporary = report.outcomes.some(o => o.outcome === 'failed' && o.retryable) || result.discovery_error?.retryable;
  const permanent = report.outcomes.some(o => o.outcome === 'failed' && !o.retryable) || (result.discovery_error && !result.discovery_error.retryable);
  let expired = false;
  try { assertDeadline(row); } catch { expired = true; }
  const next = temporary && !expired && cycleAttempt <= DELAYS.length ? new Date(Date.now() + DELAYS[cycleAttempt - 1] * 60000) : null;
  const withinDeadline = next && next < new Date(report.deadline_at);
  const configBlocked = result.discovery_error && !result.discovery_error.retryable;
  const status = expired ? 'retry_exhausted' : withinDeadline && !configBlocked ? 'retry_wait' : configBlocked ? 'needs_correction' : temporary ? 'retry_exhausted' : permanent ? 'needs_correction' : 'completed';
  report.history.push({ attempt, cycle_attempt: cycleAttempt, at: new Date().toISOString(), status, result });
  if (['needs_correction', 'retry_exhausted'].includes(status)) report.pending_alert = status;
  await save({ status, report, next_retry_at: status === 'retry_wait' ? next : null, lease_until: null });
}
async function createRun(date, scheduled, missed = false, expiredWindow = false) {
  return prisma.odoo_sync_runs.upsert({ where: { run_key: 'fallback_5pm:' + date }, update: {}, create: {
    run_key: 'fallback_5pm:' + date, source: 'fallback_5pm', target_date: date,
    status: expiredWindow ? 'needs_correction' : 'queued',
    report: { outcomes: [], history: [], scheduled_at: scheduled.toISOString(), deadline_at: new Date(scheduled.getTime() + DAY).toISOString(),
      ...(missed && { missed_start: true, pending_alert: 'missed_start' }),
      ...(expiredWindow && { error: 'Scheduled run was missed; automatic catch-up window has closed. Admin review is required.' }) } } });
}
async function syncOrdersFromOdoo(targetDate = null) {
  const date = validateDate(targetDate || tomorrowMalaysia());
  const scheduled = new Date(new Date(date + 'T17:00:00+08:00').getTime() - DAY);
  const row = await createRun(date, scheduled);
  return executeRun(row);
}
async function recoverMissedFallback(now = new Date()) {
  if (!process.env.ODOO_URL) return;
  const hours = Number(process.env.ODOO_FALLBACK_CATCHUP_HOURS || 6);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) throw error('INVALID_CATCHUP_WINDOW', 'Catch-up hours must be 0–24.', 400);
  const { scheduled, date } = latestSchedule(now);
  const existing = await prisma.odoo_sync_runs.findUnique({ where: { run_key: 'fallback_5pm:' + date } });
  if (existing) return;
  const age = now - scheduled;
  // Allow the normal cron a short startup grace; check again every minute.
  if (age < 60000) return;
  return createRun(date, scheduled, true, age > hours * 3600000);
}
async function retryFailedRun(id, actor, note) {
  if (typeof note !== 'string' || note.trim().length < 3 || note.length > 2000) throw error('RETRY_REASON_REQUIRED', 'Enter a correction/retry reason (3–2000 characters).', 400);
  return prisma.$transaction(async tx => {
    await lock(tx, id);
    const row = await tx.odoo_sync_runs.findUnique({ where: { id } });
    if (!row || row.source !== 'fallback_5pm') throw error('RUN_NOT_FOUND', 'Fallback run not found.', 404);
    if (row.run_key.startsWith('sync_preview:') || row.report?.preview_only) throw error('PREVIEW_RUN', 'Demo runs cannot be retried.');
    if (!['needs_correction', 'retry_exhausted'].includes(row.status)) throw error('RUN_NOT_RETRYABLE', 'Only a stopped run needing intervention can be retried.');
    assertDeadline(row);
    const report = copy(row.report);
    const manual = report.manual_retries || [];
    if (manual.length >= 3) throw error('MANUAL_RETRY_LIMIT', 'Three manual recovery cycles already requested; investigate before further recovery.');
    if (report.discovery_complete && !(report.outcomes || []).some(o => o.outcome === 'failed')) throw error('NO_FAILED_RECORDS', 'No failed records to retry.');
    manual.push({ employee_id: actor.id, employee_name: actor.name, at: new Date().toISOString(), reason: note.trim(), original_target_date: row.target_date });
    report.manual_retries = manual; report.manual_pending = true; report.cycle_start_attempt = row.attempts;
    report.error = null; report.pending_alert = null;
    return tx.odoo_sync_runs.update({ where: { id }, data: { status: 'queued', next_retry_at: new Date(), lease_until: null, report, updated_at: new Date() } });
  });
}
async function retryDueSyncRuns() {
  if (working) return;
  working = true;
  try {
    try { await recoverMissedFallback(); } catch { console.error('[OdooSync] Missed-run check failed; existing durable runs can still recover.'); }
    try { await flushRunAlerts(); } catch { console.error('[OdooSync] Admin alerts remain pending.'); }
    const now = new Date();
    const rows = await prisma.odoo_sync_runs.findMany({ where: { source: 'fallback_5pm', NOT: { run_key: { startsWith: 'sync_preview:' } }, OR: [
      { status: 'queued' }, { status: 'retry_wait', next_retry_at: { lte: now } }, { status: 'running', lease_until: { lte: now } } ] }, orderBy: { created_at: 'asc' }, take: 5 });
    for (const row of rows) { try { await executeRun(row); } catch { console.error('[OdooSync] Run recovery interrupted; other runs continue.'); } }
    try { await flushRunAlerts(); } catch { console.error('[OdooSync] Admin alerts remain pending.'); }
  } finally { working = false; }
}
module.exports = { syncOrdersFromOdoo, retryDueSyncRuns, executeRun, recoverMissedFallback, retryFailedRun };
