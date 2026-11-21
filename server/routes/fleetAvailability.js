// server/routes/fleetAvailability.js
//
// B.4 Fleet Availability (FR-10-001..007), mounted at /api/fleet-availability.
// Reads are open like the other Information APIs; every write needs the admin
// session (requireReviewAdmin), as for scheduler settings.

const crypto = require('crypto');
const router = require('express').Router();
const prisma = require('../prismaClient');
const { requireReviewAdmin } = require('../middleware/odooApprovalAuth');
const spec = require('../services/fleetAvailabilitySpec');
const svc = require('../services/fleetAvailabilityService');

const MAX_BOOKING_DAYS = 62;

const invalid = (res, errors) =>
  res.status(400).json({ success: false, error: 'Invalid block-off', code: 'INVALID_BLOCKOFF', errors });

const fail = (res, where, error, message) => {
  console.error(`${where} error`, error);
  res.status(500).json({ success: false, error: message, details: error.message });
};

/** Validate the body and check every named truck, team and tonnage exists. */
async function validated(body, today) {
  const { value, errors } = spec.validateBlockoffGroup(body ?? {}, today);
  if (Object.keys(errors).length) return { errors };
  const missing = await svc.checkTargets(prisma, value);
  if (Object.keys(missing).length) return { errors: missing };
  return { value };
}

/**
 * GET /api/fleet-availability/resources
 * Trucks (with tonnage key) and teams (delivery/installer, with staff and truck).
 */
router.get('/resources', async (req, res) => {
  try {
    const [trucks, teams] = await Promise.all([svc.loadTrucks(), svc.loadTeams()]);
    res.json({ success: true, today: spec.klToday(), sessions: spec.SESSIONS, reasons: spec.BLOCKOFF_REASONS, trucks, teams });
  } catch (error) {
    fail(res, 'GET /api/fleet-availability/resources', error, 'Failed to load trucks and teams');
  }
});

/**
 * GET /api/fleet-availability/blockoffs?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Block-offs overlapping the range, one entry per group. Default: from today on.
 */
router.get('/blockoffs', async (req, res) => {
  try {
    const today = spec.klToday();
    const from = spec.isDateKey(req.query.from) ? req.query.from : today;
    const to = spec.isDateKey(req.query.to) ? req.query.to : undefined;
    const rows = await svc.loadRows(prisma, { from, to });
    res.json({ success: true, today, rows: rows.map(spec.rowToApi), groups: spec.groupRows(rows, today) });
  } catch (error) {
    fail(res, 'GET /api/fleet-availability/blockoffs', error, 'Failed to load block-offs');
  }
});

/**
 * GET /api/fleet-availability/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Open deliveries and installations per date and session (at most 62 days).
 */
router.get('/bookings', async (req, res) => {
  const { from, to } = req.query;
  if (!spec.isDateKey(from) || !spec.isDateKey(to) || to < from) {
    return res.status(400).json({ success: false, error: 'from and to must be dates (YYYY-MM-DD), to on or after from' });
  }
  if (spec.dayCount(from, to) > MAX_BOOKING_DAYS) {
    return res.status(400).json({ success: false, error: `at most ${MAX_BOOKING_DAYS} days at a time` });
  }
  try {
    res.json({ success: true, bookings: await svc.loadBookings(prisma, { from, to }) });
  } catch (error) {
    fail(res, 'GET /api/fleet-availability/bookings', error, 'Failed to load bookings');
  }
});

/**
 * POST /api/fleet-availability/blockoffs/preview
 * The open bookings a block-off would affect. Saves nothing.
 */
router.post('/blockoffs/preview', requireReviewAdmin, async (req, res) => {
  try {
    const { value, errors } = await validated(req.body, spec.klToday());
    if (errors) return invalid(res, errors);
    const rows = spec.expandGroup(value, { groupId: 'preview' });
    const affected = await svc.previewAffected(prisma, rows, { from: value.start_date, to: value.end_date });
    res.json({ success: true, affected });
  } catch (error) {
    fail(res, 'POST /api/fleet-availability/blockoffs/preview', error, 'Failed to check the impact');
  }
});

/**
 * POST /api/fleet-availability/blockoffs
 * Create one block-off group: one row per target (one row for the whole fleet).
 */
router.post('/blockoffs', requireReviewAdmin, async (req, res) => {
  try {
    const today = spec.klToday();
    const { value, errors } = await validated(req.body, today);
    if (errors) return invalid(res, errors);
    const groupId = crypto.randomUUID();
    const data = spec.expandGroup(value, { groupId, createdBy: req.reviewAdmin?.id ?? null });
    await prisma.resource_blockoffs.createMany({ data });
    const rows = await prisma.resource_blockoffs.findMany({ where: { group_id: groupId } });
    const affected = await svc.previewAffected(prisma, rows, { from: value.start_date, to: value.end_date });
    res.status(201).json({ success: true, group: spec.groupRows(rows, today)[0], affected_count: affected.length });
  } catch (error) {
    fail(res, 'POST /api/fleet-availability/blockoffs', error, 'Failed to save the block-off');
  }
});

/**
 * DELETE /api/fleet-availability/blockoffs/groups/:groupId
 * Remove a whole block-off. Only before it starts; a running one is ended early.
 */
router.delete('/blockoffs/groups/:groupId', requireReviewAdmin, async (req, res) => {
  try {
    const today = spec.klToday();
    const rows = await prisma.resource_blockoffs.findMany({ where: { group_id: req.params.groupId } });
    if (!rows.length) return res.status(404).json({ success: false, error: 'Block-off not found' });
    if (rows.some(r => spec.toDateKey(r.start_date) <= today)) {
      return res.status(409).json({ success: false, error: 'This block-off has already started. End it early instead.' });
    }
    await prisma.resource_blockoffs.deleteMany({ where: { group_id: req.params.groupId } });
    res.json({ success: true, removed: rows.length });
  } catch (error) {
    fail(res, 'DELETE /api/fleet-availability/blockoffs/groups', error, 'Failed to delete the block-off');
  }
});

/**
 * POST /api/fleet-availability/blockoffs/groups/:groupId/end
 * End a running block-off: it now ends yesterday, so everything is free from
 * today. A block-off that started today has no past days left, so it is removed.
 */
router.post('/blockoffs/groups/:groupId/end', requireReviewAdmin, async (req, res) => {
  try {
    const today = spec.klToday();
    const yesterday = spec.addDays(today, -1);
    const rows = await prisma.resource_blockoffs.findMany({ where: { group_id: req.params.groupId } });
    if (!rows.length) return res.status(404).json({ success: false, error: 'Block-off not found' });
    if (rows.every(r => spec.toDateKey(r.end_date) < today)) {
      return res.status(409).json({ success: false, error: 'This block-off has already ended.' });
    }
    if (rows.every(r => spec.toDateKey(r.start_date) > today)) {
      return res.status(409).json({ success: false, error: 'This block-off has not started. Delete it instead.' });
    }
    const yesterdayDate = new Date(`${yesterday}T00:00:00Z`);
    await prisma.$transaction([
      prisma.resource_blockoffs.deleteMany({ where: { group_id: req.params.groupId, start_date: { gt: yesterdayDate } } }),
      prisma.resource_blockoffs.updateMany({
        where: { group_id: req.params.groupId, end_date: { gt: yesterdayDate } },
        data: { end_date: yesterdayDate },
      }),
    ]);
    res.json({ success: true, end_date: yesterday });
  } catch (error) {
    fail(res, 'POST /api/fleet-availability/blockoffs/groups/end', error, 'Failed to end the block-off');
  }
});

/**
 * DELETE /api/fleet-availability/blockoffs/:id
 * Remove one truck, team or truck type from a block-off that has not ended.
 */
router.delete('/blockoffs/:id', requireReviewAdmin, async (req, res) => {
  try {
    const row = await prisma.resource_blockoffs.findUnique({ where: { id: req.params.id } }).catch(() => null);
    if (!row) return res.status(404).json({ success: false, error: 'Block-off not found' });
    if (spec.toDateKey(row.end_date) < spec.klToday()) {
      return res.status(409).json({ success: false, error: 'This block-off has already ended.' });
    }
    await prisma.resource_blockoffs.delete({ where: { id: row.id } });
    res.json({ success: true });
  } catch (error) {
    fail(res, 'DELETE /api/fleet-availability/blockoffs/:id', error, 'Failed to remove it from the block-off');
  }
});

/**
 * GET /api/fleet-availability/affected
 * Open bookings from today on a blocked truck or team (Exceptions › Fleet Blocked).
 */
router.get('/affected', requireReviewAdmin, async (req, res) => {
  try {
    res.json({ success: true, affected: await svc.findAffected(prisma) });
  } catch (error) {
    fail(res, 'GET /api/fleet-availability/affected', error, 'Failed to load affected orders');
  }
});

module.exports = router;
