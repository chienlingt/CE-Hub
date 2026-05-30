const prisma = require('../prismaClient');
const {
  sendDeliveryFailureInternalEmail,
  sendDeliveryFailureCustomerEmail,
} = require('./emailService');
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
 * FR-06-001  Internal email + in-app notification to admins & assigned employee
 * FR-06-002  In-app notification appears in CE Hub notification panel
 * FR-06-003  Post failure details to Odoo chatter
 * FR-06-004  Customer-facing failure email
 *
 * @param {string} orderId - local UUID of the order
 */
async function sendDeliveryFailureNotifications(orderId) {
  // ── 1. Load order with all relations ──────────────────────────────────────
  const order = await prisma.orders.findUnique({
    where: { id: orderId },
    include: {
      customers:  true,
      buildings:  true,
      employees:  { include: { role: true } },
    },
  });

  if (!order) {
    console.warn(`[NotificationService] Order not found: ${orderId}`);
    return;
  }

  const customerName  = order.customers?.full_name   || 'Unknown Customer';
  const customerEmail = order.customers?.email        || null;
  const address       = order.delivery_address
    || order.buildings?.building_name
    || 'Unknown Address';
  const orderRef      = order.odoo_order_ref || order.id;
  const failureReason = order.issue_reason   || 'Unspecified';
  const failureDesc   = order.issue_desc     || '';
  const driverName    = order.employees?.name || order.employees?.display_name || 'Unknown';

  const emailData = { orderRef, customerName, address, failureReason, failureDesc, driverName };

  // ── 2. Load email settings ────────────────────────────────────────────────
  const [internalSetting, recipientsSetting] = await Promise.all([
    prisma.system_settings.findUnique({ where: { setting_key: 'internal_email_notification_enabled' } }),
    prisma.system_settings.findUnique({ where: { setting_key: 'admin_email_recipients' } }),
  ]);

  const internalEmailEnabled = internalSetting?.setting_value !== 'false';

  // Parse enabled admin IDs — empty array means ALL admins are enabled
  let enabledAdminIds = [];
  try {
    enabledAdminIds = JSON.parse(recipientsSetting?.setting_value || '[]');
  } catch { enabledAdminIds = []; }
  const allEnabled = enabledAdminIds.length === 0;

  // ── 3. Notify admins (in-app + email) ─────────────────────────────────────
  const admins = await getAdminEmployees();

  for (const admin of admins) {
    const message = `Delivery failed — Order ${orderRef} | Customer: ${customerName} | Reason: ${failureReason}`;

    // In-app notification always fires for all admins
    await createInAppNotification(admin.id, message, 'error', orderId);

    // Email only if enabled globally AND this admin is in the recipient list
    const isRecipient = allEnabled || enabledAdminIds.includes(admin.id);
    if (internalEmailEnabled && isRecipient && admin.email) {
      await sendDeliveryFailureInternalEmail(
        admin.email,
        admin.name || admin.display_name || 'Admin',
        emailData
      );
    }
  }

  // ── 3. Post to Odoo chatter (FR-06-003) ───────────────────────────────────
  await postToOdooChatter(order.odoo_order_ref, emailData);

  // ── 5. Send customer email (FR-06-004) ────────────────────────────────────
  const customerEmailSetting = await prisma.system_settings.findUnique({
    where: { setting_key: 'customer_email_notification_enabled' },
  });
  const customerEmailEnabled = customerEmailSetting?.setting_value !== 'false';

  if (customerEmailEnabled && customerEmail) {
    await sendDeliveryFailureCustomerEmail(customerEmail, customerName, {
      orderRef,
      failureReason,
      nextSteps: 'Our logistics team will contact you shortly to arrange a new delivery appointment. We apologise for the inconvenience.',
    });
  }

  // ── 6. Send customer WhatsApp (FR-06-004, optional) ───────────────────────
  const customerPhone = order.customers?.phone || null;
  if (customerPhone) {
    await sendDeliveryFailureWhatsApp(customerPhone, {
      customerName,
      orderRef,
      reason: failureReason,
    });
  }

  console.log(`[NotificationService] A6 notifications sent for order ${orderRef}`);
}

module.exports = {
  createInAppNotification,
  sendDeliveryFailureNotifications,
};
