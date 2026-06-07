// server/services/deliveryCompletionService.js
//
// A.4 Delivery Completion Processing
//
// Called when a driver marks an order as delivered via the driver web dashboard.
// Enforces the scan/unload gate, captures POD, resolves final status
// (Delivered vs Completed), enqueues Odoo sync, and auto-closes the slot trip.

const prisma = require('../prismaClient');
const {
  markOrderDelivered,
  isEndTripTerminal,
  ordersBlockingEndTrip,
} = require('./deliveryLifecycleService');
const {
  enqueue,
  enqueueSlotEndTripSideEffects,
} = require('./integrationOutboxService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the URL path prefix used for serving uploaded files.
 * Mirrors the path written by upload.js middleware.
 */
function buildFilePath(orderId, subDir, filename) {
  return `/uploads/orders/del/${subDir}/${orderId}/${filename}`;
}

/**
 * Auto-depart a slot that was never manually departed, then attempt to close it.
 * Marks the lorry_trip with an auto_departed flag in started_by (uses null + logs).
 *
 * Returns { autoDeparted, autoEnded }.
 */
async function tryAutoCloseSlot(timeSlotId, employeeId) {
  if (!timeSlotId) return { autoDeparted: false, autoEnded: false };

  const slot = await prisma.time_slots.findUnique({
    where:   { id: timeSlotId },
    include: { orders: { select: { id: true, order_status: true, odoo_order_ref: true } } },
  });

  if (!slot) return { autoDeparted: false, autoEnded: false };
  if (slot.slot_status === 'completed') return { autoDeparted: false, autoEnded: false };

  const now = new Date();
  let autoDeparted = false;

  // If slot was never departed, auto-depart it first
  if (slot.slot_status === 'scheduled') {
    await prisma.time_slots.update({
      where: { id: timeSlotId },
      data:  { slot_status: 'out_for_delivery', departed_at: now, started_by: employeeId || null },
    });

    // Upsert lorry_trips mirror
    await prisma.lorry_trips.upsert({
      where:  { time_slot_id: timeSlotId },
      create: {
        time_slot_id:     timeSlotId,
        truck_id:         slot.truck_id || null,
        delivery_team_id: slot.delivery_team_id || null,
        status:           'active',
        started_at:       now,
        started_by:       employeeId || null,
        updated_at:       now,
      },
      update: {
        status:     'active',
        started_at: now,
        started_by: employeeId || null,
        updated_at: now,
      },
    });

    autoDeparted = true;
    console.log(`[A4] Auto-departed slot ${timeSlotId} [auto] by driver ${employeeId || 'unknown'}`);
  }

  // Re-fetch orders with fresh statuses
  const freshOrders = await prisma.orders.findMany({
    where:  { time_slot_id: timeSlotId },
    select: { id: true, order_status: true, odoo_order_ref: true },
  });

  const blocking = ordersBlockingEndTrip(freshOrders);
  if (blocking.length > 0) {
    console.log(`[A4] Slot ${timeSlotId}: ${blocking.length} orders still active — not closing yet.`);
    return { autoDeparted, autoEnded: false };
  }

  // All orders terminal — close the slot
  await prisma.time_slots.update({
    where: { id: timeSlotId },
    data:  { slot_status: 'completed', ended_at: now, ended_by: employeeId || null },
  });

  // Close lorry_trip
  const existingTrip = await prisma.lorry_trips.findUnique({ where: { time_slot_id: timeSlotId } });
  if (existingTrip) {
    await prisma.lorry_trips.update({
      where: { time_slot_id: timeSlotId },
      data:  { status: 'completed', ended_at: now, ended_by: employeeId || null, updated_at: now },
    });
  }

  // Enqueue outbox side effects (Odoo sync per terminal order)
  await enqueueSlotEndTripSideEffects(timeSlotId, freshOrders).catch(e =>
    console.error('[A4] enqueueSlotEndTripSideEffects failed:', e.message)
  );

  console.log(`[A4] Slot ${timeSlotId} auto-closed after last order delivery.`);
  return { autoDeparted, autoEnded: true };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * A.4 Delivery Completion — called from POST /api/orders/:id/deliver.
 *
 * Validates:
 *   - All items unloaded (scan gate)
 *   - POD present (FR-04-003): at least one photo file OR signature data-URL
 *
 * Then:
 *   - Resolves final status: Delivered (install required) or Completed
 *   - Persists completion fields
 *   - Enqueues Odoo sync via outbox
 *   - Attempts auto-close of the slot trip
 *   - Creates customer in-app notification
 *
 * @param {string} orderId
 * @param {{
 *   employeeId?: string,
 *   deliveryNotes?: string,
 *   photoFiles?: Array<Express.Multer.File>,
 *   signatureDataUrl?: string,   // base64 data:image/png;base64,...
 * }} options
 * @returns {{ order, finalStatus, slotAutoClosed, autoDeparted, odooEnqueued }}
 */
async function processDeliveryCompletion(orderId, {
  employeeId,
  deliveryNotes,
  photoFiles = [],
  signatureDataUrl,
} = {}) {

  // ── Step 1: Load order with products ──────────────────────────────────────
  const order = await prisma.orders.findUnique({
    where:   { id: orderId },
    include: {
      order_products: {
        include: { products: { select: { installer_team_required_flag: true } } },
      },
      customers: { select: { id: true, full_name: true } },
    },
  });

  if (!order) {
    const err = new Error('Order not found');
    err.code  = 'ORDER_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // ── Step 2: Scan gate — all items must be unloaded ────────────────────────
  const notUnloaded = order.order_products.filter(i => i.picking_status !== 'unloaded');
  if (notUnloaded.length > 0) {
    const err = new Error('Cannot complete — not all items have been unloaded.');
    err.code  = 'ITEMS_NOT_UNLOADED';
    err.statusCode = 400;
    err.notUnloaded = notUnloaded.map(i => ({ id: i.id, status: i.picking_status }));
    throw err;
  }

  // ── Step 3: FR-04-003 — POD required ─────────────────────────────────────
  const hasPhotos    = photoFiles.length > 0;
  const hasSignature = !!(signatureDataUrl && signatureDataUrl.startsWith('data:image'));
  if (!hasPhotos && !hasSignature) {
    const err = new Error('Proof of delivery is required — please upload a photo or capture a signature.');
    err.code  = 'POD_REQUIRED';
    err.statusCode = 400;
    throw err;
  }

  // ── Step 4: Resolve final status ──────────────────────────────────────────
  const requiresInstaller = order.order_products.some(
    op => op.products?.installer_team_required_flag === true
  );
  const finalStatus = requiresInstaller ? 'Delivered' : 'Completed';

  // ── Step 5: Persist ───────────────────────────────────────────────────────
  const now = new Date();

  // Build delivery_evidence paths from uploaded photos
  const existingEvidence = order.delivery_evidence || [];
  const newPhotoPaths = photoFiles.map(f =>
    buildFilePath(orderId, 'status', f.filename)
  );

  // Handle signature: save data-URL directly into proof_of_delivery_url
  const proofUrl = hasSignature ? signatureDataUrl : (order.proof_of_delivery_url || null);

  const updateData = {
    order_status:             finalStatus,
    delivered_by:             employeeId || null,
    delivery_end_date_time:   now,
    actual_arrival_date_time: now,
    updated_at:               now,
    delivery_evidence:        [...existingEvidence, ...newPhotoPaths],
    proof_of_delivery_url:    proofUrl,
  };

  if (deliveryNotes !== undefined && deliveryNotes !== null) {
    updateData.delivery_notes = deliveryNotes;
  }

  const updatedOrder = await prisma.orders.update({
    where: { id: orderId },
    data:  updateData,
  });

  // ── Step 6: Odoo sync via outbox (A.4.4) ─────────────────────────────────
  let odooEnqueued = false;
  if (updatedOrder.odoo_order_ref) {
    await enqueue({
      eventType:      'SLOT_STATUS_CHANGED',
      target:         'odoo',
      payload:        { orderId, odooRef: updatedOrder.odoo_order_ref, status: finalStatus },
      idempotencyKey: `order:${orderId}:odoo:${finalStatus}`,
    }).catch(e => console.error('[A4] Odoo enqueue failed:', e.message));
    odooEnqueued = true;
  }

  // ── Step 7: Auto trip close (A.4.2 + A.4.3) ──────────────────────────────
  let autoEnded    = false;
  let autoDeparted = false;
  if (updatedOrder.time_slot_id) {
    const result = await tryAutoCloseSlot(updatedOrder.time_slot_id, employeeId).catch(e => {
      console.error('[A4] tryAutoCloseSlot failed:', e.message);
      return { autoDeparted: false, autoEnded: false };
    });
    autoEnded    = result.autoEnded;
    autoDeparted = result.autoDeparted;
  }

  // ── Step 8: Customer in-app notification ─────────────────────────────────
  if (order.customers?.id) {
    await prisma.notifications.create({
      data: {
        user_id: order.customers.id,
        message: `Your delivery for order #${orderId.slice(0, 8).toUpperCase()} has been ${finalStatus === 'Delivered' ? 'delivered' : 'completed'}.`,
        type:    'success',
      },
    }).catch(e => console.error('[A4] Notification create failed:', e.message));
  }

  console.log(`[A4] Order ${orderId} completed by ${employeeId || 'unknown'} → ${finalStatus}. Slot auto-closed: ${autoEnded}`);

  return {
    order:          updatedOrder,
    finalStatus,
    slotAutoClosed: autoEnded,
    autoDeparted,
    odooEnqueued,
  };
}

module.exports = { processDeliveryCompletion };
