// server/routes/driver.js
//
// Driver API routes — mobile web driver dashboard (A.4)
// Mounted at /api/driver


const express = require('express');
const router  = express.Router();
const prisma  = require('../prismaClient');
const upload = require('../middleware/upload');
const { resolveEvidenceSubDir, evidenceFilePath } = upload;
const {
  createInAppNotification,
} = require('../services/notificationService');
const { computeOrderLoadingStats, buildSlotSummaries } = require('../services/orderLoadingStats');
const { healStrandedOrdersOnDepartedSlots } = require('../services/deliveryLifecycleService');
const { toAppDateKey } = require('../utils/dateKey');

function isDeliveryTeamType(team) {
  return (team?.team_type || '').toLowerCase().includes('delivery');
}

// ─── GET /api/driver/jobs ────────────────────────────────────────────────────
// Returns orders scoped to the logged-in driver:
//   - where employee_id matches, OR
//   - where the order's time_slot has delivery_team_id matching driver's team
//
// Query: employee_id (required)
router.get('/jobs', async (req, res) => {
  try {
    const { employee_id } = req.query;
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id query param required' });
    }

    const allAssignments = await prisma.employee_team_assignments.findMany({
      where: { employee_id },
      include: { team: { select: { id: true, team_type: true } } },
    });

    const deliveryTeamIds = [...new Set(
      allAssignments.filter(a => isDeliveryTeamType(a.team)).map(a => a.team.id)
    )];

    // Sync orders assigned to already-departed slots (e.g. rescheduled after depart)
    await healStrandedOrdersOnDepartedSlots({ employeeId: employee_id, deliveryTeamIds });

    // #region agent log
    fetch('http://127.0.0.1:7869/ingest/bb893903-e6fa-49ce-bc0f-08c7f79bdc83',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'008708'},body:JSON.stringify({sessionId:'008708',location:'driver.js:jobs:teamLookup',message:'Driver team lookup',data:{employee_id,deliveryTeamIds,allAssignments:allAssignments.map(a=>({teamId:a.team?.id,teamType:a.team?.team_type}))},timestamp:Date.now(),hypothesisId:'B,C',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    // Build where: employee_id match OR slot delivery_team match (any assigned delivery team)
    const whereConditions = [{ employee_id }];
    if (deliveryTeamIds.length > 0) {
      whereConditions.push({
        time_slots: { delivery_team_id: { in: deliveryTeamIds } },
      });
    }

    const orders = await prisma.orders.findMany({
      where: { OR: whereConditions },
      include: {
        order_products: { include: { products: { select: { product_name: true } } } },
        customers:      { select: { full_name: true, phone: true } },
        buildings:      { select: { building_name: true } },
        time_slots: {
          include: {
            warehouse_team: {
              include: {
                assignments: {
                  where:   { employee: { active_flag: true } },
                  include: { employee: { select: { name: true, display_name: true, contact_number: true } } },
                  take:    1,
                },
              },
            },
          },
        },
      },
      orderBy: { scheduled_start_date_time: 'asc' },
    });

    // #region agent log
    fetch('http://127.0.0.1:7869/ingest/bb893903-e6fa-49ce-bc0f-08c7f79bdc83',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'008708'},body:JSON.stringify({sessionId:'008708',location:'driver.js:jobs:queryResult',message:'Driver jobs query result',data:{employee_id,deliveryTeamIds,orderCount:orders.length,orders:orders.map(o=>({id:o.id,status:o.order_status,employee_id:o.employee_id,time_slot_id:o.time_slot_id,slotDeliveryTeamId:o.time_slots?.delivery_team_id,scheduledStart:o.scheduled_start_date_time?.toISOString?.()??null}))},timestamp:Date.now(),hypothesisId:'A,B',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    // Augment each order with computed loading stats
    const ordersWithLoading = orders.map(o => ({
      ...o,
      ...computeOrderLoadingStats(o.order_products),
    }));

    const jobs = ordersWithLoading.map(o => {
      const productNames = o.order_products
        .map(op => op.products?.product_name)
        .filter(Boolean)
        .join(', ') || 'Unknown Product';

      const address = [
        o.remarks_delivery_address || o.delivery_address,
        o.delivery_city,
        o.delivery_postcode,
        o.delivery_state,
      ].filter(Boolean).join(', ');

      // Pick first warehouse-team member with a contact number
      const warehouseAssignment = o.time_slots?.warehouse_team?.assignments?.[0];
      const warehouseEmployee   = warehouseAssignment?.employee;

      const slotDateKey = o.time_slots?.date ? toAppDateKey(o.time_slots.date) : null;
      const assignedDate = slotDateKey
        || (o.scheduled_start_date_time ? toAppDateKey(o.scheduled_start_date_time) : toAppDateKey(new Date()));

      return {
        id:                       o.id,
        product:                  productNames,
        customer_id:              o.customer_id,
        customer_name:            o.customers?.full_name || '',
        customer_phone:           o.customers?.phone || '',
        address,
        status:                   o.order_status || 'Pending',
        assigned_date:            assignedDate,
        slot_date:                slotDateKey,
        time:                     o.scheduled_start_date_time
          ? o.scheduled_start_date_time.toISOString()
          : '',
        is_complaint_submitted:   o.is_complaint_submitted || false,
        delivery_evidence:        o.delivery_evidence || [],
        proof_of_delivery_url:    o.proof_of_delivery_url || null,
        delivery_notes:           o.delivery_notes || null,
        time_slot_id:             o.time_slot_id || null,
        slot_status:              o.time_slots?.slot_status || null,
        odoo_order_ref:           o.odoo_order_ref || null,
        salesperson_name:         o.salesperson_name  || null,
        salesperson_phone:        o.salesperson_phone || null,
        warehouse_contact_name:   warehouseEmployee
          ? (warehouseEmployee.display_name || warehouseEmployee.name || null)
          : null,
        warehouse_contact_phone:  warehouseEmployee?.contact_number || null,
        issue_priority_level:     o.issue_priority_level || null,
        issue_reason:             o.issue_reason         || null,
        issue_desc:               o.issue_desc           || null,
        issue_evidence:               o.issue_evidence               || [],
        is_escalation_acknowledged:   o.is_escalation_acknowledged   ?? false,
        // Option A: computed loading progress (no new order_status)
        loading_total:            o.total,
        loaded_count:             o.loaded_count,
        all_loaded:               o.all_loaded,
      };
    });

    // Build per-slot summaries from all fetched orders
    const slots = buildSlotSummaries(ordersWithLoading.map(o => ({
      id:           o.id,
      time_slot_id: o.time_slot_id,
      order_status: o.order_status,
      all_loaded:   o.all_loaded,
      time_slots:   o.time_slots,
    })));

    // #region agent log
    fetch('http://127.0.0.1:7869/ingest/bb893903-e6fa-49ce-bc0f-08c7f79bdc83',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'008708'},body:JSON.stringify({sessionId:'008708',location:'driver.js:jobs:slots',message:'Slots returned to client',data:{slots:slots.map(s=>({id:s.id,date:s.date,ready_to_depart:s.ready_to_depart,slot_status:s.slot_status,all_orders_loaded:s.all_orders_loaded}))},timestamp:Date.now(),hypothesisId:'A,B,F'})}).catch(()=>{});
    // #endregion

    res.json({ jobs, slots });
  } catch (err) {
    console.error('GET /api/driver/jobs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/driver/jobs/:orderId/status ────────────────────────────────────
// Status updates from the driver dashboard: → Issue only.
// Completion (→ Completed/Delivered) must go through POST /api/orders/:id/deliver with POD.
// Moving to Delivering is now done via POST /api/time-slots/:id/depart (Option A — Leave warehouse).
router.put('/jobs/:orderId/status', upload.array('files', 5), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { employee_id, status, delivery_notes, issue_priority_level, issue_reason, issue_desc } = req.body;

    // Option A: Delivering is no longer a valid manual status — use slot depart instead.
    if (status === 'Delivering') {
      return res.status(410).json({
        error: 'Setting status to Delivering directly is no longer supported. Use POST /api/time-slots/:id/depart (Leave warehouse) instead.',
        code:  'USE_SLOT_DEPART',
      });
    }

    const ALLOWED = ['Issue'];
    if (!status || !ALLOWED.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed: ${ALLOWED.join(', ')}. To complete an order use POST /api/orders/:id/deliver`,
      });
    }

    const order = await prisma.orders.findFirst({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isIssueEdit = order.order_status === 'Issue' && status === 'Issue';

    // Issue-specific validation
    if (status === 'Issue') {
      if (!issue_reason) {
        return res.status(400).json({ error: 'issue_reason is required when reporting an issue' });
      }
      if (!issue_desc || issue_desc.trim().length < 1) {
        return res.status(400).json({ error: 'issue_desc must be at least 1 characters' });
      }
      if (!isIssueEdit && (!req.files || req.files.length === 0)) {
        return res.status(400).json({ error: 'At least one evidence photo is required' });
      }
    }

    const now  = new Date();
    const data = { order_status: status, updated_at: now };

    if (status === 'Issue') {
      if (issue_priority_level !== undefined) data.issue_priority_level = issue_priority_level;
      if (issue_reason         !== undefined) data.issue_reason         = issue_reason;
      if (issue_desc           !== undefined) data.issue_desc           = issue_desc;
      // Marks this as a driver order report → visible in Cases → Delivery Issues
      data.is_complaint_submitted = true;

      if (req.files?.length) {
        const subDir = resolveEvidenceSubDir(req);
        const existing = order.issue_evidence || [];
        data.issue_evidence = [
          ...existing,
          ...req.files.map(f => evidenceFilePath(orderId, subDir, f.filename)),
        ];
      }
    } else if (req.files?.length) {
      const subDir = resolveEvidenceSubDir(req);
      const existing = order.delivery_evidence || [];
      data.delivery_evidence = [
        ...existing,
        ...req.files.map(f => evidenceFilePath(orderId, subDir, f.filename)),
      ];
    }

    if (delivery_notes !== undefined) data.delivery_notes = delivery_notes;

    const updated = await prisma.orders.update({ where: { id: orderId }, data });

    // Notify admins when driver first reports an issue (Cases → Delivery Issues)
    if (status === 'Issue' && !isIssueEdit) {
      const orderRef = order.odoo_order_ref || orderId.slice(0, 8).toUpperCase();
      const notifMessage = `Driver reported delivery issue — Order #${orderRef} | Reason: ${issue_reason}`;
      const admins = await prisma.employees.findMany({
        where: { active_flag: true, role: { name: { equals: 'admin', mode: 'insensitive' } } },
      });
      await Promise.all(
        admins.map(admin => createInAppNotification(admin.id, notifMessage, 'error', orderId))
      );
    }

    // Customer notification
    if (order.customer_id) {
      await prisma.notifications.create({
        data: {
          user_id: order.customer_id,
          message: `Order #${orderId.slice(0, 8).toUpperCase()} status updated to ${status}.`,
          type:    status === 'Issue' ? 'error' : 'info',
        },
      }).catch(() => {});
    }

    res.json({ success: true, order: updated });
  } catch (err) {
    console.error('PUT /api/driver/jobs/:orderId/status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/driver/jobs/:orderId/delivery-evidence ─────────────────────────
// Append POD photos, update notes, or replace signature on completed orders.
router.put('/jobs/:orderId/delivery-evidence', upload.array('photos', 10), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { delivery_notes, signature_data_url } = req.body;

    const order = await prisma.orders.findFirst({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const ALLOWED = ['Completed', 'Delivered'];
    if (!ALLOWED.includes(order.order_status)) {
      return res.status(400).json({
        error: 'Delivery evidence can only be edited on completed or delivered orders',
      });
    }

    const hasNotes   = delivery_notes !== undefined;
    const hasPhotos  = req.files?.length > 0;
    const hasSignature = !!signature_data_url;

    if (!hasNotes && !hasPhotos && !hasSignature) {
      return res.status(400).json({ error: 'No changes to save' });
    }

    const now  = new Date();
    const data = { updated_at: now };

    if (hasNotes) data.delivery_notes = delivery_notes;

    if (hasPhotos) {
      const subDir = resolveEvidenceSubDir(req);
      const existing = order.delivery_evidence || [];
      data.delivery_evidence = [
        ...existing,
        ...req.files.map(f => evidenceFilePath(orderId, subDir, f.filename)),
      ];
    }

    if (hasSignature) data.proof_of_delivery_url = signature_data_url;

    const updated = await prisma.orders.update({ where: { id: orderId }, data });

    res.json({
      success: true,
      order: {
        id:                    updated.id,
        delivery_evidence:     updated.delivery_evidence || [],
        proof_of_delivery_url: updated.proof_of_delivery_url || null,
        delivery_notes:          updated.delivery_notes || null,
      },
    });
  } catch (err) {
    console.error('PUT /api/driver/jobs/:orderId/delivery-evidence error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/driver/jobs/:orderId/report ────────────────────────────────────
// Pre-fill report modal with existing issue fields. Kept for backward compat.
router.get('/jobs/:orderId/report', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await prisma.orders.findUnique({
      where:  { id: orderId },
      select: {
        id:                     true,
        issue_priority_level:   true,
        issue_reason:           true,
        issue_desc:             true,
        issue_evidence:         true,
        is_complaint_submitted: true,
      },
    });
    if (!order) return res.status(404).json({ message: 'Report not found' });
    res.json(order);
  } catch (err) {
    console.error('GET /api/driver/jobs/:orderId/report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/driver/jobs/:orderId/report ────────────────────────────────────
// Kept for backward compatibility (mobile app, etc). Not called by the web dashboard.
router.put('/jobs/:orderId/report', upload.array('files', 5), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { issue_priority_level, issue_reason, issue_desc } = req.body;

    const order = await prisma.orders.findFirst({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const data = { updated_at: new Date() };
    if (issue_priority_level !== undefined) data.issue_priority_level = issue_priority_level;
    if (issue_reason         !== undefined) data.issue_reason         = issue_reason;
    if (issue_desc           !== undefined) data.issue_desc           = issue_desc;
    data.is_complaint_submitted = true;

    if (req.files?.length) {
      const subDir = resolveEvidenceSubDir(req);
      const existing = order.issue_evidence || [];
      data.issue_evidence = [
        ...existing,
        ...req.files.map(f => evidenceFilePath(orderId, subDir, f.filename)),
      ];
    }

    const updated = await prisma.orders.update({ where: { id: orderId }, data });

    res.json({
      success: true,
      message: 'Report submitted',
      order: {
        id:                     updated.id,
        issue_priority_level:   updated.issue_priority_level,
        issue_reason:           updated.issue_reason,
        issue_desc:             updated.issue_desc,
        issue_evidence:         updated.issue_evidence,
        is_complaint_submitted: updated.is_complaint_submitted,
      },
    });
  } catch (err) {
    console.error('PUT /api/driver/jobs/:orderId/report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/driver/jobs/:orderId/admin-escalation ─────────────────────────
// Escalation via Report → Notify Admin.  Mandatory message is stored as a
// structured driver escalation in issue_reason/issue_desc so it surfaces in
// Cases → Delivery Issues (Escalations section).
// Follow-up calls append to issue_desc with a timestamp separator.
router.post('/jobs/:orderId/admin-escalation', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message, employee_id } = req.body;

    if (!message || message.trim().length < 1) {
      return res.status(400).json({ error: 'A message is required when escalating to admin' });
    }

    const order = await prisma.orders.findUnique({
      where:   { id: orderId },
      include: {
        customers: { select: { full_name: true, phone: true } },
        employees: { select: { name: true, display_name: true } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const orderRef     = order.odoo_order_ref || order.id.slice(0, 8).toUpperCase();
    const customerName = order.customers?.full_name || 'Unknown';
    const driverName   = order.employees?.display_name || order.employees?.name || 'Driver';
    const trimmedMsg   = message.trim();

    const isFirstEscalation = order.issue_reason !== 'Driver Escalation';

    // Build or append issue_desc
    let newIssueDesc;
    if (isFirstEscalation) {
      newIssueDesc = trimmedMsg;
    } else {
      const timestamp = new Date().toLocaleString('en-MY', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
      newIssueDesc = `${order.issue_desc || ''}\n---\n[${timestamp}] ${trimmedMsg}`;
    }

    const parts = [
      `Order #${orderRef} escalated by driver ${driverName}.`,
      `Customer: ${customerName}`,
      `Note: ${trimmedMsg}`,
    ];
    const notifMessage = parts.join(' | ');

    const admins = await prisma.employees.findMany({
      where: { active_flag: true, role: { name: { equals: 'admin', mode: 'insensitive' } } },
      include: { role: true },
    });

    await Promise.all(
      admins.map(admin => createInAppNotification(admin.id, notifMessage, 'error', orderId))
    );

    // Optionally WhatsApp admins
    try {
      const { isSettingEnabled, sendDeliveryFailureAdminWhatsApp } = require('../services/whatsappService');
      const enabled = await isSettingEnabled('whatsapp_admin_notification_enabled');
      if (enabled) {
        for (const admin of admins) {
          const phone = admin.contact_number || null;
          if (!phone) continue;
          await sendDeliveryFailureAdminWhatsApp(phone, {
            adminName:        admin.display_name || admin.name || 'Admin',
            customerName,
            orderRef,
            reason:           'Driver Escalation',
            driverName,
            address:          order.delivery_address || '',
            salespersonName:  order.salesperson_name  || 'N/A',
            salespersonPhone: order.salesperson_phone || 'N/A',
          }).catch(() => {});
        }
      }
    } catch {
      // WhatsApp failure is non-fatal
    }

    const updated = await prisma.orders.update({
      where: { id: orderId },
      data: {
        is_complaint_submitted:     true,
        is_escalation_acknowledged: false,
        issue_reason:               'Driver Escalation',
        issue_desc:                 newIssueDesc,
        updated_at:                 new Date(),
      },
    });

    res.json({
      success:          true,
      message:          'Admin notified',
      is_first:         isFirstEscalation,
      issue_desc:       updated.issue_desc,
    });
  } catch (err) {
    console.error('POST /api/driver/jobs/:orderId/admin-escalation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
