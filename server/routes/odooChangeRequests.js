const router = require('express').Router();
const prisma = require('../prismaClient');
const { requireReviewAdmin } = require('../middleware/odooApprovalAuth');
const { requestDetail, decideRequest } = require('../services/odooChangeReviewService');

router.use(requireReviewAdmin);
const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
const monitor = require('../services/odooSyncMonitorService');
for (const [path, handler] of [['/monitor/orders', monitor.incomingOrders], ['/monitor/outgoing', monitor.outgoingJobs]]) {
  router.get(path, async (req, res) => {
    try { res.json(await handler(req.query)); }
    catch (error) { res.status(error.status || 503).json({ error: error.status === 400 ? error.message : 'Unable to load sync monitoring data.' }); }
  });
}
router.get('/sync-runs', async (req, res) => {
  const { source, status } = req.query;
  const offset = Number(req.query.offset || 0);
  if (!Number.isInteger(offset) || offset < 0 || (source && !['fallback_5pm', 'odoo_webhook'].includes(source)) ||
      (status && !['queued', 'running', 'retry_wait', 'retry_exhausted', 'needs_correction', 'completed', 'pending_approval', 'sender_retry_required'].includes(status))) return res.status(400).json({ error: 'Invalid run filter.' });
  const where = { ...(source ? { source } : {}), ...(status ? { status } : {}) };
  try {
    const [rows, total] = await Promise.all([prisma.odoo_sync_runs.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: offset, take: 25 }), prisma.odoo_sync_runs.count({ where })]);
    res.json({ rows, total });
  } catch { res.status(503).json({ error: 'Unable to load sync run history. Check database migration and connection.' }); }
});
router.get('/', async (req, res) => {
  const status = req.query.status || 'pending';
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const offset = Number(req.query.offset || 0);
  if (!Number.isInteger(offset) || offset < 0) return res.status(400).json({ error: 'Invalid offset.' });
  try {
    const where = status === 'all' ? {} : { status };
    const [rows, total, pending] = await Promise.all([
      prisma.odoo_change_requests.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: offset, take: 50,
        select: { id: true, order_id: true, do_ref: true, request_kind: true, changes: true, status: true, created_at: true, reviewed_by_name: true, reviewed_at: true, review_note: true } }),
      prisma.odoo_change_requests.count({ where }), prisma.odoo_change_requests.count({ where: { status: 'pending' } }),
    ]);
    res.json({ rows, total, pending });
  } catch { res.status(500).json({ error: 'Unable to load Odoo change requests.' }); }
});
router.get('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid request ID.' });
  try { res.json(await requestDetail(req.params.id)); }
  catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Unable to load this request.' }); }
});
router.post('/:id/decision', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid request ID.' });
  try {
    const result = await decideRequest(req.params.id, req.body?.decision, req.body?.note ?? '', req.reviewAdmin);
    res.json({ success: true, request: result });
  } catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Unable to save the decision.', code: error.code }); }
});
module.exports = router;
