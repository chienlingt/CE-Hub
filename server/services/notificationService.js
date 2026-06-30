const prisma = require('../prismaClient');
const {
  sendDeliveryFailureWhatsApp,
  sendDeliveryFailureSalespersonWhatsApp,
  sendDeliveryFailureAdminWhatsApp,
  isSettingEnabled,
} = require('./whatsappService');

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

async function getWhatsAppAdminRecipients(allAdmins) {
  try {
    const setting = await prisma.system_settings.findUnique({
      where: { setting_key: 'whatsapp_admin_recipients' },
    });
    const ids = JSON.parse(setting?.setting_value || '[]');
    if (ids.length === 0) return allAdmins; // empty = all admins
    return allAdmins.filter(a => ids.includes(a.id));
  } catch {
    return allAdmins;
  }
}

// ─── Odoo chatter post (FR-06-003) ──────────────────────────────────────────

// Records each chatter-post attempt to integration_outbox for admin visibility
// (Cases → Order Issues → Odoo Chatter section). Logging failure is non-fatal.
async function logChatterAttempt(orderId, odooOrderRef, { status, details, error }) {
  try {
    await prisma.integration_outbox.create({
      data: {
        event_type:      'ODOO_CHATTER_POST',
        target:          'odoo',
        payload:         { orderId, odooOrderRef, details: details || null },
        idempotency_key: `order:${orderId}:odoo_chatter:${Date.now()}`,
        status,
        attempts:        1,
        last_error:      error || null,
        processed_at:    new Date(),
      },
    });
  } catch (err) {
    console.error('[NotificationService] Failed to log Odoo chatter attempt:', err.message);
  }
}

async function postToOdooChatter(orderId, odooOrderRef, { customerName, address, failureReason, failureDesc, driverName }) {
  const details = { customerName, address, driverName, failureReason, failureDesc };

  if (!process.env.ODOO_URL || !odooOrderRef) {
    await logChatterAttempt(orderId, odooOrderRef, {
      status: 'skipped', details,
      error:  'Odoo integration not configured (ODOO_URL missing) or order has no odoo_order_ref',
    });
    return;
  }

  try {
    const { callModel } = require('./odooService');

    const odooOrders = await callModel('sale.order', 'search_read',
      [[['name', '=', odooOrderRef]]],
      { fields: ['id'], limit: 1 }
    );

    if (!odooOrders?.length) {
      console.warn(`[NotificationService] Odoo order not found for ref: ${odooOrderRef}`);
      await logChatterAttempt(orderId, odooOrderRef, {
        status: 'failed', details, error: `Odoo order not found for ref: ${odooOrderRef}`,
      });
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
    await logChatterAttempt(orderId, odooOrderRef, { status: 'posted', details });
  } catch (err) {
    // Odoo chatter failure must never crash the main flow
    console.warn('[NotificationService] Odoo chatter post failed (non-fatal):', err.message);
    await logChatterAttempt(orderId, odooOrderRef, { status: 'failed', details, error: err.message });
  }
}

// ─── Main A6 function ────────────────────────────────────────────────────────

/**
 * Fire all A6 notifications when a delivery fails.
 * Call this after the order issue fields are written to DB.
 *
 * FR-06-001  In-app + WhatsApp to admins, WhatsApp to salesperson
 * FR-06-002  In-app notification appears in CE Hub notification panel
 * FR-06-003  Post failure details to Odoo chatter
 * FR-06-004  WhatsApp to customer
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

  const customerName     = order.customers?.full_name || 'Unknown Customer';
  const customerPhone    = order.customers?.phone     || null;
  const address          = order.delivery_address || order.buildings?.building_name || 'Unknown Address';
  const orderRef         = order.odoo_order_ref   || order.id;
  const failureReason    = order.issue_reason     || 'Unspecified';
  const failureDesc      = order.issue_desc       || '';
  const driverName       = order.employees?.name  || order.employees?.display_name || 'Unknown';
  const salespersonName  = order.salesperson_name  || null;
  const salespersonPhone = order.salesperson_phone || null;

  const notifData = { orderRef, customerName, address, failureReason, failureDesc, driverName };

  // ── 2. Notify admins in-app (FR-06-001, FR-06-002) ───────────────────────
  const allAdmins = await getAdminEmployees();
  for (const admin of allAdmins) {
    const shortRef = (order.odoo_order_ref || orderId).substring(0, 8).toUpperCase();
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
      const shortRef = (order.odoo_order_ref || orderId).substring(0, 8).toUpperCase();
      const message = `Delivery failed · ${customerName} · ${address} · ${failureReason} · #${shortRef}`;
      await createInAppNotification(salespersonEmployee.id, message, 'error', orderId);
    } else {
      console.warn(`[NotificationService] No employee account found for salesperson phone ${salespersonPhone} — skipping in-app`);
    }
  }

  // ── 3. Post to Odoo chatter (FR-06-003) ──────────────────────────────────
  await postToOdooChatter(order.id, order.odoo_order_ref, notifData);

  // ── 4. WhatsApp to admins (FR-06-001) ────────────────────────────────────
  const adminWhatsAppEnabled = await isSettingEnabled('whatsapp_admin_notification_enabled');
  if (adminWhatsAppEnabled) {
    const recipientAdmins = await getWhatsAppAdminRecipients(allAdmins);
    for (const admin of recipientAdmins) {
      const phone = admin.contact_number || null;
      if (!phone) {
        console.warn(`[NotificationService] Admin ${admin.name} has no contact_number — skipping WhatsApp`);
        continue;
      }
      await sendDeliveryFailureAdminWhatsApp(phone, {
        adminName:        admin.name || admin.display_name || 'Admin',
        customerName,
        orderRef,
        reason:           failureReason,
        driverName,
        address,
        salespersonName:  salespersonName  || 'N/A',
        salespersonPhone: salespersonPhone || 'N/A',
      });
      console.log(`[NotificationService] WhatsApp sent to admin ${admin.name} (${phone})`);
    }
  }

  // ── 5. WhatsApp to salesperson in charge (FR-06-001) ─────────────────────
  if (salespersonPhone) {
    await sendDeliveryFailureSalespersonWhatsApp(salespersonPhone, {
      recipientName: salespersonName  || 'Salesperson',
      customerName,
      customerPhone,
      orderRef,
      reason:        failureReason,
      driverName,
      address,
    });
    console.log(`[NotificationService] WhatsApp sent to salesperson ${salespersonName} (${salespersonPhone})`);
  } else {
    console.warn(`[NotificationService] No salesperson phone for order ${orderRef} — skipping salesperson WhatsApp`);
  }

  // ── 6. WhatsApp to customer (FR-06-004) ──────────────────────────────────
  const customerWaEnabled = await isSettingEnabled('whatsapp_customer_notification_enabled');
  if (customerPhone && customerWaEnabled) {
    await sendDeliveryFailureWhatsApp(customerPhone, {
      customerName,
      orderRef,
      reason: failureReason,
    });
    console.log(`[NotificationService] WhatsApp sent to customer ${customerName} (${customerPhone})`);
  } else if (customerPhone && !customerWaEnabled) {
    console.log(`[NotificationService] Customer WhatsApp skipped (toggle off) for ${customerName}`);
  } else if (!customerPhone) {
    console.warn(`[NotificationService] Customer WhatsApp skipped (no phone) for ${customerName}`);
  }

  console.log(`[NotificationService] A6 notifications sent for order ${orderRef}`);
}

module.exports = {
  createInAppNotification,
  sendDeliveryFailureNotifications,
};
