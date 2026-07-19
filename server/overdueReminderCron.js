// server/overdueReminderCron.js
//
// Daily Overdue Delivery Cron
//
// Runs at 23:59 MYT every day (59 23 * * *).
// Logs all orders still in 'Delivering' status for today's slots.
// No auto-notification is sent — admin must manually trigger remind-driver per order.

const prisma = require('./prismaClient');
const dayjs = require('dayjs');

async function runOverdueReminderCron() {
  const today = dayjs().format('YYYY-MM-DD');
  console.log(`[OverdueCron] Checking for overdue deliveries on ${today}…`);

  try {
    const overdueOrders = await prisma.orders.findMany({
      where: {
        order_status: 'Delivering',
        time_slots: {
          date: { lte: today },
        },
      },
      select: {
        id:              true,
        odoo_order_ref:  true,
        delivery_address: true,
        overdue_reminder_sent_at: true,
        employees:  { select: { name: true, display_name: true } },
        time_slots: { select: { date: true } },
      },
    });

    if (overdueOrders.length === 0) {
      console.log('[OverdueCron] No overdue deliveries found.');
      return;
    }

    const unreminded = overdueOrders.filter(o => !o.overdue_reminder_sent_at);
    console.log(
      `[OverdueCron] ${overdueOrders.length} overdue order(s) on or before ${today}. ` +
      `${unreminded.length} not yet reminded.`
    );

    for (const order of overdueOrders) {
      const driverName = order.employees?.display_name || order.employees?.name || 'Unknown';
      const slotDate   = order.time_slots?.date || 'Unknown';
      const reminded   = order.overdue_reminder_sent_at
        ? `reminded at ${order.overdue_reminder_sent_at.toISOString()}`
        : 'NOT YET REMINDED';
      console.log(
        `[OverdueCron]  → Order ${order.odoo_order_ref || order.id.slice(0, 8)} | ` +
        `Slot: ${slotDate} | Driver: ${driverName} | ${reminded}`
      );
    }
  } catch (err) {
    console.error('[OverdueCron] Error:', err.message);
  }
}

module.exports = { runOverdueReminderCron };
