// server/schedulerCron.js
const cron = require('node-cron');
const prisma = require('./prismaClient');
const { scheduleOrders, loadConfiguration } = require('./services/scheduler');

let cronJob = null;

/**
 * Initialize the cron job on server startup
 */
async function initializeSchedulerCron() {
  try {
    console.log('\n🕐 Initializing scheduler cron job...');

    const config = await loadConfiguration();

    if (!config.enabled) {
      console.log('⏸️  Scheduler is disabled in configuration. Cron job will not run.');
      return;
    }

    const cronExpression = config.cron_expression || '0 0 * * *'; // Default: daily at midnight

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      console.error(`❌ Invalid cron expression: ${cronExpression}`);
      return;
    }

    // Stop existing job if any
    if (cronJob) {
      cronJob.stop();
      console.log('🛑 Stopped existing cron job');
    }

    // Create new cron job
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

    console.log(`✅ Scheduler cron job initialized with expression: ${cronExpression}`);
    console.log(`   (Timezone: Asia/Kuala_Lumpur)`);
    console.log(`   Example: "0 0 * * *" = Daily at 12:00 AM`);
    console.log(`   Example: "0 0 */2 * *" = Every 2 days at 12:00 AM`);
    console.log(`   Current time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })}`);

  } catch (error) {
    console.error('❌ Failed to initialize scheduler cron job:', error);
  }
}

/**
 * Update cron job with new schedule
 * @param {string} cronExpression - New cron expression
 */
async function updateSchedulerCron(cronExpression) {
  try {
    console.log(`\n🔄 Updating cron job with new expression: ${cronExpression}`);

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Reinitialize cron job
    await initializeSchedulerCron();

    console.log('✅ Cron job updated successfully');
  } catch (error) {
    console.error('❌ Failed to update cron job:', error);
    throw error;
  }
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
