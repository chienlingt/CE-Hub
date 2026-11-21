// server/routes/scheduler.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { scheduleOrders } = require('../services/scheduler');
const { getSchedulerSettings, getSettingsView, updateSchedulerSettings, SettingsValidationError } = require('../services/schedulerSettings');
const { rowToApi, klDateSession, teamBlock } = require('../services/fleetAvailabilitySpec');
const { loadTeams } = require('../services/fleetAvailabilityService');
const { geocodeAddress } = require('../services/googleRoutingService');
const { requireReviewAdmin } = require('../middleware/odooApprovalAuth');
const { updateSchedulerCron } = require('../schedulerCron');
const { validateRequest: validateRecommendRequest } = require('../services/slotRecommendSpec');
const { recommendSlots } = require('../services/slotRecommendService');
const { suggestAddresses, geocodeCandidates } = require('../services/addressLookupService');


/**
 * POST /api/scheduler/run
 * Manually trigger the scheduler
 */
router.post('/run', async (req, res) => {
  try {
    console.log('Manual scheduler run triggered via API');

    const results = await scheduleOrders();

    res.json({
      success: true,
      results: {
        scheduled: results.scheduled.length,
        unscheduled: results.unscheduled.length,
        installationSchedulesCreated: results.installationSchedulesCreated,
        timeslotsCreated: results.timeslotsCreated,
        locationGroups: results.postalCodeGroups,
        warnings: results.warnings || []
      },
      details: {
        scheduledOrders: results.scheduled,
        unscheduledOrders: results.unscheduled
      },
      message: `Successfully scheduled ${results.scheduled.length} orders. ${results.unscheduled.length} orders could not be scheduled.`
    });
  } catch (error) {
    console.error('POST /api/scheduler/run error', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run scheduler',
      details: error.message
    });
  }
});

/**
 * GET /api/scheduler/config
 * Every B.1 setting, plus the read-only delivery windows, the valid ranges
 * (so the client does not hardcode them) and the live fleet count by tonnage.
 */
router.get('/config', async (req, res) => {
  try {
    const view = await getSettingsView();
    res.json({ success: true, ...view });
  } catch (error) {
    console.error('GET /api/scheduler/config error', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scheduler configuration',
      details: error.message
    });
  }
});

/**
 * PUT /api/scheduler/config
 * Partial update. Admin session required. 400 carries per-field `errors`.
 * Changes apply to the next run and new bookings; nothing existing is moved.
 */
router.put('/config', requireReviewAdmin, async (req, res) => {
  try {
    const { config, warnings } = await updateSchedulerSettings(req.body ?? {}, {
      employeeId: req.reviewAdmin?.id,
      geocode: geocodeAddress,
      onScheduleChange: () => updateSchedulerCron(),
    });
    res.json({ success: true, config, warnings, message: 'Scheduler configuration updated successfully' });
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return res.status(400).json({ success: false, error: 'Invalid scheduler settings', code: 'INVALID_SETTINGS', errors: error.errors });
    }
    console.error('PUT /api/scheduler/config error', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update scheduler configuration',
      details: error.message
    });
  }
});

/**
 * POST /api/scheduler/recommend
 * B.1 Part 1: which date + session could take a new DO. Advisory; books nothing.
 * Body: { address, items: [{ name, quantity, dismantle? }], not_before?, days? }
 * Admin session only (it calls Google per request).
 */
/**
 * GET /api/scheduler/recommend/items
 * Product names on Information > Item, for the Find a slot picker. Read-only
 * (unlike /api/performance/items, which also picks up new order lines).
 */
router.get('/recommend/items', requireReviewAdmin, async (req, res) => {
  try {
    const rows = await prisma.item_point_rates.findMany({
      orderBy: { item_name: 'asc' },
      select: { item_name: true, item_type: { select: { name: true, requires_installer: true } } },
    });
    res.json({
      success: true,
      items: rows.map(r => ({
        name: r.item_name,
        item_type: r.item_type?.name ?? null,
        requires_installer: Boolean(r.item_type?.requires_installer),
      })),
    });
  } catch (error) {
    console.error('GET /api/scheduler/recommend/items error', error);
    res.status(500).json({ success: false, error: 'Could not load items', details: error.message });
  }
});

/**
 * GET /api/scheduler/recommend/addresses?q=happy
 * Type-ahead for the Find a slot address box from CE Hub's own data: buildings,
 * then past delivery addresses. No Google call.
 */
router.get('/recommend/addresses', requireReviewAdmin, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2 || q.length > 200) {
    return res.status(400).json({ success: false, error: 'q must be 2 to 200 characters', code: 'INVALID_REQUEST' });
  }
  try {
    res.json({ success: true, suggestions: await suggestAddresses(q) });
  } catch (error) {
    console.error('GET /api/scheduler/recommend/addresses error', error);
    res.status(500).json({ success: false, error: 'Could not load address suggestions', details: error.message });
  }
});

/**
 * POST /api/scheduler/recommend/check-address  { address }
 * "Check address": Google Geocoding matches (up to 3), each flagged precise,
 * for the user to confirm. Writes nothing.
 */
router.post('/recommend/check-address', requireReviewAdmin, async (req, res) => {
  const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
  if (address.length < 3 || address.length > 300) {
    return res.status(400).json({ success: false, error: 'address must be 3 to 300 characters', code: 'INVALID_REQUEST' });
  }
  try {
    res.json({ success: true, candidates: await geocodeCandidates(address) });
  } catch (error) {
    if (error.code !== 'NO_KEY') console.error('POST /api/scheduler/recommend/check-address error', error.message);
    res.status(502).json({ success: false, error: error.message, code: error.code ?? 'GOOGLE_ERROR' });
  }
});

router.post('/recommend', requireReviewAdmin, async (req, res) => {
  // Step 1. Validate the request; steps 2-9 are in slotRecommendService.recommendSlots.
  const { value, errors } = validateRecommendRequest(req.body ?? {});
  if (!value) {
    return res.status(400).json({ success: false, error: 'Invalid recommendation request', code: 'INVALID_REQUEST', errors });
  }
  try {
    const result = await recommendSlots(value);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('POST /api/scheduler/recommend error', error);
    res.status(500).json({ success: false, error: 'Could not recommend a slot', details: error.message });
  }
});

/**
 * GET /api/scheduler/blockoffs?from=YYYY-MM-DD&to=YYYY-MM-DD&resource_type=fleet|truck_type|truck|team|employee
 * Block-off rows overlapping the range (all when no range given), for the
 * schedule board. They are created and removed under /api/fleet-availability.
 */
router.get('/blockoffs', async (req, res) => {
  try {
    const { from, to, resource_type } = req.query;
    const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));
    const where = {};
    if (resource_type) where.resource_type = String(resource_type);
    if (isDate(to)) where.start_date = { lte: new Date(`${to}T00:00:00Z`) };
    if (isDate(from)) where.end_date = { gte: new Date(`${from}T00:00:00Z`) };
    const rows = await prisma.resource_blockoffs.findMany({ where, orderBy: [{ start_date: 'asc' }] });
    res.json({ success: true, blockoffs: rows.map(rowToApi) });
  } catch (error) {
    console.error('GET /api/scheduler/blockoffs error', error);
    res.status(500).json({ success: false, error: 'Failed to fetch block-offs', details: error.message });
  }
});

/**
 * GET /api/scheduler/status
 * Get scheduler status and next run time
 */
router.get('/status', async (req, res) => {
  try {
    const config = await getSchedulerSettings();

    res.json({
      success: true,
      status: {
        enabled: config.enabled,
        last_run_at: config.last_run_at,
        next_run_at: null, // TODO: compute from cron_expression
        planning_run_at: config.planning_run_at,
        cron_expression: config.cron_expression
      }
    });
  } catch (error) {
    console.error('GET /api/scheduler/status error', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scheduler status',
      details: error.message
    });
  }
});

/**
 * PUT /api/orders/:id/reschedule
 * Move an order to a different timeslot
 */
router.put('/orders/:id/reschedule', async (req, res) => {
  try {
    const { id } = req.params;
    const { time_slot_id } = req.body;

    if (!time_slot_id) {
      return res.status(400).json({
        success: false,
        error: 'time_slot_id is required'
      });
    }

    // Verify timeslot exists
    const timeslot = await prisma.time_slots.findUnique({
      where: { id: time_slot_id }
    });

    if (!timeslot) {
      return res.status(404).json({
        success: false,
        error: 'Timeslot not found'
      });
    }

    // Update order
    const order = await prisma.orders.update({
      where: { id },
      data: {
        time_slot_id,
        updated_at: new Date()
      },
      include: {
        buildings: true,
        customers: true,
        order_products: { include: { products: true } }
      }
    });

    console.log(`✅ Order ${id} rescheduled to timeslot ${time_slot_id}`);

    res.json({
      success: true,
      order,
      message: 'Order rescheduled successfully'
    });
  } catch (error) {
    console.error('PUT /api/orders/:id/reschedule error', error);
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to reschedule order',
      details: error.message
    });
  }
});

/**
 * GET /api/installation-schedules
 * Get all installation schedules
 */
router.get('/installation-schedules', async (req, res) => {
  try {
    const schedules = await prisma.installation_schedules.findMany({
      include: {
        orders: {
          include: {
            customers: true,
            buildings: true,
            order_products: { include: { products: true } }
          }
        },
        team: {
          include: {
            assignments: { include: { employee: true } }
          }
        }
      },
      orderBy: {
        estimated_arrival_time: 'asc'
      }
    });

    res.json({
      success: true,
      schedules,
      count: schedules.length
    });
  } catch (error) {
    console.error('GET /api/installation-schedules error', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch installation schedules',
      details: error.message
    });
  }
});

/**
 * PUT /api/installation-schedules/:id
 * Update installation schedule status
 */
router.put('/installation-schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, estimated_arrival_time, installation_team_id } = req.body;

    // B.4: an installer team blocked for that date and session cannot be assigned.
    if (installation_team_id) {
      const current = await prisma.installation_schedules.findUnique({ where: { id }, select: { estimated_arrival_time: true } });
      const when = klDateSession(estimated_arrival_time || current?.estimated_arrival_time);
      if (when) {
        const rows = await prisma.resource_blockoffs.findMany({
          where: { start_date: { lte: new Date(`${when.date}T00:00:00Z`) }, end_date: { gte: new Date(`${when.date}T00:00:00Z`) } },
        });
        const team = rows.length ? (await loadTeams()).find(t => t.id === installation_team_id) : null;
        const block = teamBlock(team ?? installation_team_id, when.date, when.session, rows);
        if (block) {
          const who = block.staff ? ` (${block.staff.name})` : '';
          return res.status(400).json({
            success: false, code: 'TEAM_BLOCKED',
            error: `This team is blocked on ${when.date} (${when.session}): ${block.reason}${who}${block.note ? ` - ${block.note}` : ''}.`,
          });
        }
      }
    }

    const updateData = { updated_at: new Date() };

    if (status) updateData.status = status;
    if (estimated_arrival_time) updateData.estimated_arrival_time = new Date(estimated_arrival_time);
    if (installation_team_id) updateData.installation_team_id = installation_team_id;

    const schedule = await prisma.installation_schedules.update({
      where: { id },
      data: updateData,
      include: {
        orders: true,
        teams: true
      }
    });

    console.log(`✅ Installation schedule ${id} updated`);

    res.json({
      success: true,
      schedule,
      message: 'Installation schedule updated successfully'
    });
  } catch (error) {
    console.error('PUT /api/installation-schedules/:id error', error);
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Installation schedule not found'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to update installation schedule',
      details: error.message
    });
  }
});

module.exports = router;
