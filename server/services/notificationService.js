const prisma = require('../prismaClient');
const { sendDeliveryFailureInternalEmail } = require('./emailService');
const { sendDeliveryFailureWhatsApp } = require('./whatsappService');

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
      role: { name: { equals: 'admin', mode: 'insensitive' } },
    },
    include: { role: true },
  });
}

// ─── Odoo chatter post (FR-06-003) ──────────────────────────────────────────

async function postToOdooChatter(odooOrderRef, { customerName, address, failureReason, failureDesc, driverName }) {
  if (!process.env.ODOO_URL || !odooOrderRef) return;

  try {
    const { callModel } = require('./odooService');

    const odooOrders = await callModel('sale.order', 'search_read',
      [[['name', '=', odooOrderRef]]],
      { fields: ['id'], limit: 1 }
    );

    if (!odooOrders?.length) {
      console.warn(`[NotificationService] Odoo order not found for ref: ${odooOrderRef}`);
      return;
    }

    const odooId = odooOrders[0].id;
    const body = [
      `<b>Delivery Failed</b>`,
      `<b>Customer:</b> ${customerName}`,
      `<b>Address:</b> ${address}`,
      `<b>Driver:</b> ${driverName || 'N/A'}`,
      `<b>Failure Reason:</b> ${failureReason}`,
      `<b>Details:</b> ${failureDesc || 'None provided'}`,
    ].join('<br/>');

    await callModel('sale.order', 'message_post', [[odooId]], {
      body,
      message_type:    'comment',
      subtype_xmlid:   'mail.mt_comment',
    });

    console.log(`[NotificationService] Posted failure to Odoo chatter for ${odooOrderRef}`);
  } catch (err) {
    // Odoo chatter failure must never crash the main flow
    console.warn('[NotificationService] Odoo chatter post failed (non-fatal):', err.message);
  }
}

// ─── Main A6 function ────────────────────────────────────────────────────────

/**
 * Fire all A6 notifications when a delivery fails.
 * Call this after the order issue fields are written to DB.
 *
 * FR-06-001  In-app notification to all admins
 * FR-06-002  In-app notification appears in CE Hub notification panel
 * FR-06-003  Post failure details to Odoo chatter
 * FR-06-004  WhatsApp to salesperson in charge + WhatsApp to customer
 *
 * @param {string} orderId - local UUID of the order
 */
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

  const customerName    = order.customers?.full_name || 'Unknown Customer';
  const customerPhone   = order.customers?.phone     || null;
  const address         = order.delivery_address || order.buildings?.building_name || 'Unknown Address';
  const orderRef        = order.odoo_order_ref   || order.id;
  const failureReason   = order.issue_reason     || 'Unspecified';
  const failureDesc     = order.issue_desc       || '';
  const driverName      = order.employees?.name  || order.employees?.display_name || 'Unknown';
  const salespersonName  = order.salesperson_name  || null;
  const salespersonPhone = order.salesperson_phone || null;

  const notifData = { orderRef, customerName, address, failureReason, failureDesc, driverName };

  // ── 2. Notify admins in-app (FR-06-001, FR-06-002) ───────────────────────
  const admins = await getAdminEmployees();
  for (const admin of admins) {
    const message = `Delivery failed — Order ${orderRef} | Customer: ${customerName} | Reason: ${failureReason}`;
    await createInAppNotification(admin.id, message, 'error', orderId);
  }

  // ── 3. Post to Odoo chatter (FR-06-003) ──────────────────────────────────
  await postToOdooChatter(order.odoo_order_ref, notifData);

  // ── 4. WhatsApp to salesperson in charge (FR-06-001) ─────────────────────
  if (salespersonPhone) {
    await sendDeliveryFailureWhatsApp(salespersonPhone, {
      customerName,
      orderRef,
      reason:      failureReason,
      recipientName: salespersonName || 'Salesperson',
    });
    console.log(`[NotificationService] WhatsApp sent to salesperson ${salespersonName} (${salespersonPhone})`);
  } else {
    console.warn(`[NotificationService] No salesperson phone for order ${orderRef} — skipping salesperson WhatsApp`);
  }

  // ── 5. WhatsApp to customer (FR-06-004) ──────────────────────────────────
  if (customerPhone) {
    await sendDeliveryFailureWhatsApp(customerPhone, {
      customerName,
      orderRef,
      reason: failureReason,
    });
    console.log(`[NotificationService] WhatsApp sent to customer ${customerName} (${customerPhone})`);
  }

  console.log(`[NotificationService] A6 notifications sent for order ${orderRef}`);
}

module.exports = {
  createInAppNotification,
  sendDeliveryFailureNotifications,
};
