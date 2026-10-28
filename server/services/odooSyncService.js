// 5 PM MYT recovery of missing, eligible outgoing DOOs only. No bookings,
// appointment edits or customer messages are triggered by this process.
const { randomUUID } = require('crypto');
const prisma = require('../prismaClient');
const { loadFallbackPolicy, validateDate, tomorrowMalaysia } = require('./odooFallbackPolicy');
const { classifyFailure } = require('./odooSyncRunService');

let activeRun = null;

async function runFallbackAttempt(targetDate, { excludeIds = [], retryOrders = null, onProgress = null, assertActive = async () => {}, commitCandidate = null } = {}) {
  if (activeRun) return { status: 'busy', run_id: activeRun, synced: 0, skipped: 0, failed: 0, synced_dos: [], skipped_dos: [], failed_dos: [], error: 'A fallback run is already in progress.' };
  const result = { run_id: randomUUID(), date: null, status: 'completed', complete: false, candidates: 0,
    synced: 0, skipped: 0, failed: 0, synced_dos: [], synced_records: [], skipped_dos: [], failed_dos: [], failures: [], skips: [] };
  activeRun = result.run_id;
  const skip = (order, reason) => {
    result.skipped_dos.push(order.name);
    result.skips.push({ picking_id: order.id, do_ref: order.name, reason });
  };
  const fail = (order, stage, code, message, retryable = false) => {
    result.failed_dos.push(order.name || 'picking:' + order.id);
    result.failures.push({ picking_id: order.id, do_ref: order.name || null, stage, code, message, retryable });
  };
  try {
    await assertActive();
    result.date = validateDate(targetDate || tomorrowMalaysia());
    if (!process.env.ODOO_URL) throw Object.assign(new Error('Odoo integration is not configured.'), { code: 'FALLBACK_POLICY_NOT_CONFIGURED' });
    const policy = loadFallbackPolicy();
    // Persist the actual agreed eligibility rule with each run for support/audit.
    result.policy = policy;
    const { iterateOrdersForDeliveryDate, getOrderDetail, isOrderEligibleForDeliveryDate } = require('./odooService');
    const { ingestOrder } = require('./odooOrderIngestService');
    const { appointmentMetadata } = require('./odooFallbackSafety');
    if (!commitCandidate) throw Object.assign(new Error('A fenced durable fallback run is required.'), { code: 'FALLBACK_POLICY_NOT_CONFIGURED' });
    const excluded = new Set(excludeIds);
    for await (const candidate of retryOrders || iterateOrdersForDeliveryDate(result.date, policy)) {
      const order = { ...candidate };
      await assertActive();
      if (excluded.has(order.id)) continue;
      result.candidates++;
      let stage = 'lookup';
      try {
        let detail;
        if (retryOrders) {
          stage = 'detail';
          detail = await getOrderDetail(order.id, { fallbackPolicy: policy });
          await assertActive();
          if (detail?.id === order.id && typeof detail.name === 'string' && detail.name.trim()) order.name = detail.name;
        }
        if (typeof order.name !== 'string' || !order.name.trim()) {
          fail(order, 'validation', 'MISSING_DO_REFERENCE', 'Odoo returned a DOO without a reference.');
          continue;
        }
        const existing = await prisma.orders.findFirst({ where: { odoo_order_ref: order.name } });
        if (existing) { skip(order, 'already_exists'); continue; }
        stage = 'detail';
        detail ||= await getOrderDetail(order.id, { fallbackPolicy: policy });
        await assertActive();
        if (!detail || detail.id !== order.id || detail.name !== order.name) {
          fail(order, stage, 'INVALID_DOO_DETAIL', 'DOO detail is unavailable or does not match the requested reference.');
          continue;
        }
        // Appointments can be cancelled/changed between page discovery and import.
        stage = 'eligibility';
        if (!await isOrderEligibleForDeliveryDate(order.id, result.date, policy)) {
          skip(order, 'no_longer_eligible');
          continue;
        }
        await assertActive();
        const metadata = appointmentMetadata(detail, result.date, policy);
        stage = 'import';
        // The importer rechecks existence under its transaction lock. A concurrent
        // push or another app instance must not turn fallback into an update.
        const imported = await commitCandidate(order, async tx => {
          await assertActive();
          // Check time again inside the transaction, immediately before import.
          appointmentMetadata(detail, result.date, policy);
          const imported = await ingestOrder(detail, tx, { createOnly: true });
          if (imported.success && imported.action === 'created') {
            await tx.orders.update({ where: { id: imported.order_id }, data: metadata });
            await require('./odooProgressService').recordPickedMilestone(tx, imported.order_id);
            appointmentMetadata(detail, result.date, policy);
          }
          return imported;
        });
        if (imported.success && imported.action === 'created') {
          result.synced_dos.push(order.name);
          result.synced_records.push({ picking_id: order.id, do_ref: order.name, order_id: imported.order_id });
        }
        else if (imported.success && imported.action === 'skipped') skip(order, 'already_exists');
        else fail(order, stage, imported.code || 'IMPORT_REJECTED', imported.error || 'DOO import was not accepted.');
      } catch (error) {
        if (['RUN_LEASE_LOST', 'RECOVERY_DEADLINE_EXPIRED', 'APPOINTMENT_DATE_EXPIRED'].includes(error.code)) throw error;
        const failure = classifyFailure(error);
        fail(order, stage, failure.code, failure.message, failure.retryable);
        console.warn('[OdooSync] DOO failed; continuing:', order.name || order.id, 'stage:', stage);
      } finally {
        if (onProgress) await onProgress(result);
      }
    }
    result.complete = true;
    if (result.failures.length) result.status = 'partial_failure';
  } catch (error) {
    result.discovery_error = classifyFailure(error);
    result.status = error.code === 'FALLBACK_POLICY_NOT_CONFIGURED' ? 'blocked' : 'discovery_failed';
    result.error = error.code === 'FALLBACK_POLICY_NOT_CONFIGURED' ? error.message
      : 'Unable to finish Odoo discovery. Previously imported DOOs are preserved; retry fallback.';
    console.warn('[OdooSync]', result.status, result.error);
  } finally {
    result.synced = result.synced_dos.length;
    result.skipped = result.skipped_dos.length;
    result.failed = result.failed_dos.length;
    try {
      await prisma.integration_outbox.create({ data: {
        event_type: 'FALLBACK_POLL_COMPLETE', target: 'internal', payload: result,
        idempotency_key: 'fallback_poll:' + (result.date || 'invalid-date') + ':' + result.run_id,
        status: 'pending', attempts: 0, next_retry_at: new Date(),
      } });
    } catch {
      result.audit_error = 'Unable to persist the fallback-run audit record.';
      console.error('[OdooSync]', result.audit_error, result.run_id);
    }
    activeRun = null;
  }
  console.log('[OdooSync] Run', result.run_id, result.status, 'synced:', result.synced, 'skipped:', result.skipped, 'failed:', result.failed);
  return result;
}

module.exports = {
  runFallbackAttempt,
  syncOrdersFromOdoo: (...args) => require('./odooFallbackRunner').syncOrdersFromOdoo(...args),
  retryDueSyncRuns: () => require('./odooFallbackRunner').retryDueSyncRuns(),
};
