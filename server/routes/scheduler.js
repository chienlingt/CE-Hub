// server/routes/scheduler.js
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { scheduleOrders, loadConfiguration } = require('../services/scheduler');

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
 * Get scheduler configuration
 */
router.get('/config', async (req, res) => {
  try {
    const config = await loadConfiguration();

    res.json({
      success: true,
      config: {
        id: config.id,
        warehouse_address: config.warehouse_address,
        warehouse_postal: config.warehouse_postal,
        cron_expression: config.cron_expression,
        enabled: config.enabled,
        last_run_at: config.last_run_at,
        created_at: config.created_at,
        updated_at: config.updated_at
      }
    });
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
 * Update scheduler configuration
 */
router.put('/config', async (req, res) => {
  try {
    const { warehouse_address, warehouse_postal, cron_expression, enabled } = req.body;

    // Find existing config
    let config = await prisma.scheduler_config.findFirst();

    if (!config) {
      // Create new config if none exists
      config = await prisma.scheduler_config.create({
        data: {
          warehouse_address: warehouse_address || 'University of Malaya, Kuala Lumpur',
          warehouse_postal: warehouse_postal || '50603',
          cron_expression: cron_expression || '0 0 * * *',
          enabled: enabled !== undefined ? enabled : true,
          created_at: new Date(),
          updated_at: new Date()
        }
      });
    } else {
      // Update existing config
      const updateData = { updated_at: new Date() };

      if (warehouse_address !== undefined) updateData.warehouse_address = warehouse_address;
      if (warehouse_postal !== undefined) updateData.warehouse_postal = warehouse_postal;
      if (cron_expression !== undefined) updateData.cron_expression = cron_expression;
      if (enabled !== undefined) updateData.enabled = enabled;

      config = await prisma.scheduler_config.update({
        where: { id: config.id },
        data: updateData
      });
    }

    // TODO: Restart cron job with new schedule if cron_expression changed
    console.log('✅ Scheduler configuration updated:', config);

    res.json({
      success: true,
      config: {
        id: config.id,
        warehouse_address: config.warehouse_address,
        warehouse_postal: config.warehouse_postal,
        cron_expression: config.cron_expression,
        enabled: config.enabled,
        last_run_at: config.last_run_at,
        created_at: config.created_at,
        updated_at: config.updated_at
      },
      message: 'Scheduler configuration updated successfully'
    });
  } catch (error) {
    console.error('PUT /api/scheduler/config error', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update scheduler configuration',
      details: error.message
    });
  }
});

/**
 * GET /api/scheduler/status
 * Get scheduler status and next run time
 */
router.get('/status', async (req, res) => {
  try {
    const config = await prisma.scheduler_config.findFirst();

    if (!config) {
      return res.json({
        success: true,
        status: {
          enabled: false,
          last_run_at: null,
          next_run_at: null,
          cron_expression: null
        }
      });
    }

    // TODO: Calculate next run time from cron expression
    const nextRunAt = null; // Placeholder

    res.json({
      success: true,
      status: {
        enabled: config.enabled,
        last_run_at: config.last_run_at,
        next_run_at: nextRunAt,
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
