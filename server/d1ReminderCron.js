// server/d1ReminderCron.js
//
// D-1 Delivery Reminder Cron (A.3.3 / A.3.3)
//
// Runs nightly (configurable via D1_REMINDER_CRON, default: every day at 09:00).
// For each order scheduled for TOMORROW that has not yet been notified,
// enqueues a CUSTOMER_D1_REMINDER row in integration_outbox.
// The outbox worker (integrationOutboxCron) handles the actual send.

const prisma = require('./prismaClient');
const { enqueue } = require('./services/integrationOutboxService');
const dayjs = require('dayjs');

async function runD1ReminderCron() {
  console.log('[D1Reminder] Starting D-1 reminder run…');

  // Compute "tomorrow" as a date string matching the format stored in time_slots.date (YYYY-MM-DD)
  const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');

  try {
    // Find all active (Scheduled) orders in slots scheduled for tomorrow that haven't been notified
    const orders = await prisma.orders.findMany({
      where: {
        order_status:   { in: ['Scheduled', 'Pending'] },
        notified_d1_at: null,
        time_slots: {
          date: tomorrow,
        },
      },
      select: {
        id: true,
        odoo_order_ref: true,
        delivery_address: true,
        customers:  { select: { id: true, full_name: true, phone: true, email: true } },
        time_slots: { select: { id: true, date: true, time_window_start: true, time_window_end: true } },
      },
    });

    if (!orders.length) {
      console.log(`[D1Reminder] No orders to remind for ${tomorrow}`);
      return { reminded: 0 };
    }

    let enqueued = 0;
    for (const order of orders) {
      const customer = order.customers;
      if (!customer?.phone && !customer?.email) continue;

      await enqueue({
        eventType:      'CUSTOMER_D1_REMINDER',
        target:         'notification',
        payload: {
          orderId:        order.id,
          customerId:     customer.id,
          orderRef:       order.odoo_order_ref || order.id.slice(0, 8).toUpperCase(),
          address:        order.delivery_address || 'your delivery address',
          phone:          customer.phone  || null,
          email:          customer.email  || null,
          customerName:   customer.full_name || 'Customer',
          slotDate:       order.time_slots?.date             || tomorrow,
          timeWindowStart: order.time_slots?.time_window_start || null,
          timeWindowEnd:  order.time_slots?.time_window_end   || null,
        },
        idempotencyKey: `order:${order.id}:d1_reminder`,
      });

      enqueued++;
    }

    console.log(`[D1Reminder] Enqueued ${enqueued} D-1 reminders for ${tomorrow}`);
    return { reminded: enqueued };
  } catch (err) {
    console.error('[D1Reminder] Error:', err.message);
    return { reminded: 0, error: err.message };
  }
}

module.exports = { runD1ReminderCron };
