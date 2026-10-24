const prisma = require('../prismaClient');

// ─── In-app notification helpers ────────────────────────────────────────────

async function createInAppNotification(userId, message, type = 'warning', orderId = null) {
  try {
    return await prisma.notifications.create({
      data: {
        user_id:    userId,
        message,
        type,
        is_read:    false,
        order_id:   orderId,
        created_at: new Date(),
      },
    });
  } catch (err) {
    console.error('[NotificationService] Failed to create in-app notification:', err.message);
  }
}

async function getAdminEmployees() {
  return prisma.employees.findMany({
    where: {
      active_flag: true,
      role: { name: { contains: 'admin', mode: 'insensitive' } },
    },
    include: { role: true },
  });
}

// Internal alerts only; customer WhatsApp is handled by the Odoo status trigger.
async function sendDeliveryFailureNotifications(orderId) {
  // ── 1. Load order with all relations ──────────────────────────────────────
  const order = await prisma.orders.findUnique({
    where: { id: orderId },
    include: {
      customers: true,
      buildings: true,
      employees: { include: { role: true } },
    },
  });

  if (!order) {
    console.warn(`[NotificationService] Order not found: ${orderId}`);
    return;
  }

  const customerName     = order.customers?.full_name || 'Unknown Customer';
  const address          = order.delivery_address || order.buildings?.building_name || 'Unknown Address';
  const orderRef         = order.odoo_order_ref   || 'Not Synced';
  const failureReason    = order.issue_reason     || 'Unspecified';
  const salespersonName  = order.salesperson_name  || null;
  const salespersonPhone = order.salesperson_phone || null;


  // ── 2. Notify admins in-app (FR-06-001, FR-06-002) ───────────────────────
  const allAdmins = await getAdminEmployees();
  for (const admin of allAdmins) {
    const shortRef = order.odoo_order_ref || 'Not Synced';
    const message = `Delivery failed · ${customerName} · ${address} · ${failureReason} · #${shortRef}`;
    await createInAppNotification(admin.id, message, 'error', orderId);
  }

  // ── 2b. Notify salesperson in-app ────────────────────────────────────────
  if (salespersonPhone) {
    const salespersonEmployee = await prisma.employees.findFirst({
      where: {
        contact_number: salespersonPhone,
        active_flag: true,
        OR: [
          { name:         { contains: salespersonName, mode: 'insensitive' } },
          { display_name: { contains: salespersonName, mode: 'insensitive' } },
        ],
      },
    });
    if (salespersonEmployee) {
      const shortRef = order.odoo_order_ref || 'Not Synced';
      const message = `Delivery failed · ${customerName} · ${address} · ${failureReason} · #${shortRef}`;
      await createInAppNotification(salespersonEmployee.id, message, 'error', orderId);
    } else {
      console.warn(`[NotificationService] No employee account found for salesperson phone ${salespersonPhone} — skipping in-app`);
    }
  }

  // Customer failure WhatsApp is requested through ORDER_FAILED -> Odoo.
  // Keep internal admin/salesperson notifications, but never duplicate the
  // customer message using CE Hub's WhatsApp provider.

  console.log(`[NotificationService] Internal failure notifications created for order ${orderRef}`);
}

module.exports = {
  createInAppNotification,
  getAdminEmployees,
  sendDeliveryFailureNotifications,
};
