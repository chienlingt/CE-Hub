// server/schedulerCron.js
const cron = require('node-cron');
const { scheduleOrders } = require('./services/scheduler');
const { getSchedulerSettings } = require('./services/schedulerSettings');

let cronJob = null;

/**
 * (Re)start the cron job from the stored settings. The schedule is derived from
 * planning_cutoff + planning_run_offset_minutes (default 17:00 + 60 = 18:00 KL),
 * so it runs after the Odoo INT-12 5 PM fallback sync. Safe to call repeatedly:
 * any existing job is stopped first, so disabling really stops it.
 */
async function initializeSchedulerCron() {
  try {
    console.log('\n🕐 Initializing scheduler cron job...');

    if (cronJob) {
      cronJob.stop();
      cronJob = null;
      console.log('🛑 Stopped existing cron job');
    }

    const settings = await getSchedulerSettings();

    if (!settings.enabled) {
      console.log('⏸️  Scheduler is disabled in configuration. Cron job will not run.');
      return;
    }

    const cronExpression = settings.cron_expression;
    if (!cron.validate(cronExpression)) {
      console.error(`❌ Invalid cron expression: ${cronExpression}`);
      return;
    }

    cronJob = cron.schedule(cronExpression, async () => {
      console.log(`\n⏰ Cron job triggered at ${new Date().toISOString()}`);

      try {
        const results = await scheduleOrders();
        console.log(`✅ Cron job completed successfully. Scheduled ${results.scheduled.length} orders.`);
      } catch (error) {
        console.error('❌ Cron job failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Kuala_Lumpur' // Malaysia timezone
    });

    console.log(`✅ Scheduler cron job initialized: daily at ${settings.planning_run_at} (${cronExpression}, Asia/Kuala_Lumpur)`);
  } catch (error) {
    console.error('❌ Failed to initialize scheduler cron job:', error);
  }
}

/**
 * Restart the cron job after a settings change (cutoff, run offset or enabled).
 */
async function updateSchedulerCron() {
  await initializeSchedulerCron();
}

/**
 * Stop the cron job
 */
function stopSchedulerCron() {
  if (cronJob) {
    cronJob.stop();
    console.log('🛑 Scheduler cron job stopped');
  } else {
    console.log('ℹ️  No cron job to stop');
  }
}

/**
 * Start the cron job
 */
function startSchedulerCron() {
  if (cronJob) {
    cronJob.start();
    console.log('▶️  Scheduler cron job started');
  } else {
    console.log('⚠️  Cron job not initialized. Call initializeSchedulerCron() first.');
  }
}

/**
 * Get cron job status
 */
function getCronStatus() {
  if (!cronJob) {
    return {
      initialized: false,
      running: false
    };
  }

  return {
    initialized: true,
    running: cronJob.running || false
  };
}

/**
 * Run scheduler immediately (bypass cron schedule)
 */
async function runSchedulerNow() {
  console.log('\n🚀 Running scheduler immediately (manual trigger)...');

  try {
    const results = await scheduleOrders();
    console.log(`✅ Scheduler completed successfully. Scheduled ${results.scheduled.length} orders.`);
    return results;
  } catch (error) {
    console.error('❌ Scheduler failed:', error);
    throw error;
  }
}

module.exports = {
  initializeSchedulerCron,
  updateSchedulerCron,
  stopSchedulerCron,
  startSchedulerCron,
  getCronStatus,
  runSchedulerNow
};
