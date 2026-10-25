const prisma = require('../prismaClient');
const { validateDate, tomorrowMalaysia } = require('./odooFallbackPolicy');
const DELAYS = [5, 15, 30];
const LEASE = 5 * 60000, MAX_AGE = 86400000;
let working = false;
async function executeRun(row) {
  if (row.run_key?.startsWith('sync_preview:') || row.report?.preview_only) return;
  const now = new Date();
  const claim = await prisma.odoo_sync_runs.updateMany({ where: { id: row.id, attempts: row.attempts, OR: [
    { status: 'queued' }, { status: 'retry_wait', next_retry_at: { lte: now } }, { status: 'running', lease_until: { lte: now } } ] },
    data: { status: 'running', attempts: { increment: 1 }, next_retry_at: null, lease_until: new Date(Date.now() + LEASE), updated_at: now } });
  if (!claim.count) return;
  const attempt = row.attempts + 1;
  const report = JSON.parse(JSON.stringify(row.report));
  report.history ||= []; report.outcomes ||= [];
  function mergeOutcomes(result) {
    const map = new Map(report.outcomes.map(o => [o.do_ref || `id:${o.picking_id}`, o]));
    for (const name of result.synced_dos || []) map.set(name, { do_ref: name, outcome: 'synced' });
    for (const item of result.skips || []) if (map.get(item.do_ref)?.outcome !== 'synced') map.set(item.do_ref || `id:${item.picking_id}`, { ...item, outcome: 'skipped' });
    for (const item of result.failures || []) map.set(item.do_ref || `id:${item.picking_id}`, { ...item, outcome: 'failed' });
    report.outcomes = [...map.values()];
    report.counts = { candidates: map.size, synced: report.outcomes.filter(o => o.outcome === 'synced').length,
      skipped: report.outcomes.filter(o => o.outcome === 'skipped').length, failed: report.outcomes.filter(o => o.outcome === 'failed').length };
    return map;
  }
  const save = data => prisma.odoo_sync_runs.updateMany({ where: { id: row.id, attempts: attempt, status: 'running' }, data: { ...data, updated_at: new Date() } });
  if (attempt > 4 || Date.now() - new Date(row.created_at).getTime() > MAX_AGE) {
    report.error = 'Retry budget expired. Original target date was not changed.';
    await save({ status: 'retry_exhausted', report, lease_until: null }); return;
  }
  // Renew lease while Odoo pages/individual calls are being processed.
  let leaseLost = false;
  const heartbeat = setInterval(() => { save({ lease_until: new Date(Date.now() + LEASE) }).then(r => { if (!r.count) leaseLost = true; }).catch(() => { leaseLost = true; }); }, 60000);
  let result;
  try {
    const previous = report.outcomes;
    const retryOrders = report.discovery_complete ? previous.filter(o => o.outcome === 'failed' && o.retryable).map(o => ({ id: o.picking_id, name: o.do_ref })) : null;
    result = await require('./odooSyncService').runFallbackAttempt(row.target_date, {
      retryOrders, excludeIds: previous.filter(o => o.outcome === 'failed' && !o.retryable).map(o => o.picking_id),
      onProgress: async partial => {
        mergeOutcomes(partial);
        const saved = await save({ report: JSON.parse(JSON.stringify(report)), lease_until: new Date(Date.now() + LEASE) });
        if (!saved.count) throw Object.assign(new Error('Run lease replaced.'), { code: 'RUN_LEASE_LOST' });
      },
    });
  } catch (error) {
    const failure = require('./odooSyncRunService').classifyFailure(error);
    result = { status: 'discovery_failed', complete: false, discovery_error: failure, error: failure.message, failures: [], skips: [], synced_dos: [] };
  } finally { clearInterval(heartbeat); }
  if (leaseLost) return;
  if (result.status === 'busy') {
    await save({ status: 'retry_wait', attempts: row.attempts, next_retry_at: new Date(Date.now() + 60000), lease_until: null }); return;
  }
  // Keep latest result per DO, but retain each attempt in history for diagnosis.
  const outcomes = mergeOutcomes(result);
  report.outcomes = [...outcomes.values()]; report.mechanism = 'Odoo polling API';
  report.discovery_complete = report.discovery_complete || result.complete;
  report.error = result.error || null; report.discovery_error = result.discovery_error || null;
  report.policy = result.policy || report.policy || null;
  report.counts = { candidates: outcomes.size, synced: report.outcomes.filter(o => o.outcome === 'synced').length,
    skipped: report.outcomes.filter(o => o.outcome === 'skipped').length, failed: report.outcomes.filter(o => o.outcome === 'failed').length };
  const temporary = report.outcomes.some(o => o.outcome === 'failed' && o.retryable) || result.discovery_error?.retryable;
  const permanent = report.outcomes.some(o => o.outcome === 'failed' && !o.retryable) || (result.discovery_error && !result.discovery_error.retryable);
  const configurationBlocked = result.discovery_error && !result.discovery_error.retryable;
  const retry = temporary && !configurationBlocked && attempt <= DELAYS.length && Date.now() - new Date(row.created_at).getTime() < MAX_AGE;
  const status = retry ? 'retry_wait' : configurationBlocked ? 'needs_correction' : temporary ? 'retry_exhausted' : permanent ? 'needs_correction' : 'completed';
  report.history.push({ attempt, at: new Date().toISOString(), status, result });
  const next = retry ? new Date(Date.now() + DELAYS[attempt - 1] * 60000) : null;
  await save({ status, report: JSON.parse(JSON.stringify(report)), next_retry_at: next, lease_until: null });
  return { ...result, logical_run_id: row.id, status, next_retry_at: next };
}
async function syncOrdersFromOdoo(targetDate = null) {
  const date = validateDate(targetDate || tomorrowMalaysia());
  const row = await prisma.odoo_sync_runs.upsert({ where: { run_key: `fallback_5pm:${date}` }, update: {}, create: {
    run_key: `fallback_5pm:${date}`, source: 'fallback_5pm', target_date: date, report: { outcomes: [], history: [] } } });
  return executeRun(row);
}
async function retryDueSyncRuns() {
  if (working) return;
  working = true;
  try {
    const now = new Date();
    const rows = await prisma.odoo_sync_runs.findMany({ where: { source: 'fallback_5pm', NOT: { run_key: { startsWith: 'sync_preview:' } }, OR: [
      { status: 'queued' }, { status: 'retry_wait', next_retry_at: { lte: now } }, { status: 'running', lease_until: { lte: now } } ] }, orderBy: { created_at: 'asc' }, take: 5 });
    for (const row of rows) await executeRun(row);
  } finally { working = false; }
}
module.exports = { syncOrdersFromOdoo, retryDueSyncRuns, executeRun };
