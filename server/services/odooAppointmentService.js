// server/services/odooAppointmentService.js
//
// FRD INT-03/04/05 — Confirm Appointment from the Odoo DOO — and INT-11 —
// Request Edit / Cancel Appointment. Confirmation is asynchronous: the request
// is stored here, and the confirmed / rejected / cancelled result is sent back
// through the outbox when a CE Hub admin approves, rejects or undoes the slot
// assignment (routes/orders.js). Edit/cancel requests reuse odoo_change_requests
// so they are reviewed in the existing Sync Monitor.

const { Prisma } = require('@prisma/client');
const prisma = require('../prismaClient');
const { pushOrder } = require('./odooOrderIngestService');
const { preparationError } = require('./odooPreparation');
const { unitsFor } = require('./orderProductUnits');
const { snapshot, hash } = require('./odooChangeReviewService');
const { enqueue } = require('./integrationOutboxService');
const { buildAppointmentDecisionPayload } = require('./odooPayloadBuilder');
const { APPOINTMENT_SESSIONS } = require('./odooAppointmentSessions');

const EDITABLE_STATUSES = ['Pending', 'Scheduled'];
const ACTIVE_APPOINTMENT = ['requested', 'confirmed'];

const invalid = message => preparationError(message, 'INVALID_APPOINTMENT');
const optionalText = (value, max) => value == null || (typeof value === 'string' && value.length <= max);

function asResult(error) {
  if (!error.status) throw error;
  return { success: false, action: error.status === 409 ? 'blocked' : error.status === 404 ? 'not_found' : 'invalid', error: error.message, code: error.code };
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeAppointment(appointment) {
  if (!appointment || typeof appointment !== 'object' || Array.isArray(appointment)) throw invalid('appointment is required.');
  const { request_ref, requested_date, requested_session, requirements, delivery_document } = appointment;
  if (typeof request_ref !== 'string' || !request_ref.trim() || request_ref.length > 100) throw invalid('appointment.request_ref must be a non-empty string (max 100).');
  if (!isCalendarDate(requested_date)) throw invalid('appointment.requested_date must be a YYYY-MM-DD date.');
  if (!APPOINTMENT_SESSIONS[requested_session]) throw invalid(`appointment.requested_session must be one of ${Object.keys(APPOINTMENT_SESSIONS).join(', ')}.`);
  if (requirements != null && (typeof requirements !== 'object' || Array.isArray(requirements))) throw invalid('appointment.requirements must be an object.');
  if (!optionalText(delivery_document, 30)) throw invalid('appointment.delivery_document must be a string (max 30).');
  return {
    request_ref: request_ref.trim(), requested_date, requested_session,
    requirements: requirements ?? null, delivery_document: delivery_document?.trim() || null,
  };
}

// Approve-time and request-time guard: an appointment can only change before
// loading/delivery starts (FRD §10 cancellation and delivery boundary).
function appointmentBlockers(order) {
  const blockers = [];
  if (!ACTIVE_APPOINTMENT.includes(order.appointment_status)) blockers.push('This DOO has no active CE Hub appointment to change.');
  const scanned = (order.order_products || []).some(item => unitsFor(item).some(unit => unit.handling_status !== 'pending'));
  if (!EDITABLE_STATUSES.includes(order.order_status) || scanned) blockers.push(`The appointment cannot change once loading or delivery has started (order is ${order.order_status}).`);
  return blockers;
}

/**
 * POST /api/webhooks/odoo/appointment-confirm — the DO snapshot (same shape as
 * /odoo/order) plus an `appointment` block. Creates/updates the DO through
 * pushOrder and records the requested date/session. The same request_ref is an
 * INT-05 retry and never re-applies anything.
 */
async function requestAppointment(payload) {
  try {
    const appointment = normalizeAppointment(payload?.appointment);
    if (!payload?.name) throw invalid('Payload must include name (DO reference).');

    const existing = await prisma.orders.findFirst({ where: { odoo_order_ref: payload.name } });
    if (existing && existing.appointment_request_ref === appointment.request_ref) {
      return {
        success: true, action: 'previously_received', order_id: existing.id, request_ref: appointment.request_ref,
        confirmation_status: existing.appointment_status === 'requested' ? 'pending' : existing.appointment_status,
      };
    }
    if (existing?.appointment_status === 'confirmed') {
      throw preparationError('This DOO already has a confirmed appointment. Use Request Edit Appointment to change it.', 'APPOINTMENT_ALREADY_CONFIRMED', 409);
    }

    const { appointment: _appointment, ...doPayload } = payload;
    const result = await pushOrder(doPayload);
    if (!result.success) return result;

    const [sessionStart] = APPOINTMENT_SESSIONS[appointment.requested_session];
    await prisma.orders.update({
      where: { id: result.order_id },
      data: {
        appointment_request_ref:       appointment.request_ref,
        requested_appointment_date:    appointment.requested_date,
        requested_appointment_session: appointment.requested_session,
        appointment_requirements:      appointment.requirements ?? Prisma.DbNull,
        delivery_document_requirement: appointment.delivery_document,
        appointment_status:            'requested',
        appointment_message:           null,
        preferred_timeslot:            new Date(`${appointment.requested_date}T${sessionStart}:00+08:00`),
        updated_at:                    new Date(),
      },
    });

    return {
      success: true,
      action: result.action === 'pending_approval' ? 'pending_approval' : 'appointment_requested',
      order_id: result.order_id,
      request_ref: appointment.request_ref,
      confirmation_status: 'pending',
      ...(result.request_id && { request_id: result.request_id, review_status: result.review_status }),
    };
  } catch (error) {
    return asResult(error);
  }
}

function reviewResult(request, order) {
  return {
    success: true, action: request.status === 'pending' ? 'pending_approval' : 'previously_reviewed',
    request_id: request.id, review_status: request.status, order_id: order.id, order_status: order.order_status,
  };
}

/**
 * POST /api/webhooks/odoo/appointment-change — Odoo's Request Edit / Cancel
 * Appointment. Stored for CE Hub admin review; nothing changes until approval.
 */
async function requestAppointmentChange(payload) {
  try {
    const { id, name, request_ref, action, reason, requested_by } = payload || {};
    if (!name || !Number.isInteger(id) || id <= 0) throw preparationError('id (stock.picking.id) and name (DO reference) are required.', 'INVALID_APPOINTMENT_CHANGE');
    if (!['edit', 'cancel'].includes(action)) throw preparationError('action must be edit or cancel.', 'INVALID_APPOINTMENT_CHANGE');
    if (typeof request_ref !== 'string' || !request_ref.trim() || request_ref.length > 100) throw preparationError('request_ref must be a non-empty string (max 100).', 'INVALID_APPOINTMENT_CHANGE');
    if (!optionalText(reason, 2000) || !optionalText(requested_by, 255)) throw preparationError('reason and requested_by must be strings.', 'INVALID_APPOINTMENT_CHANGE');

    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19761019)`;
      const order = await tx.orders.findFirst({ where: { odoo_order_ref: name }, include: { order_products: true, customers: true } });
      if (!order) throw preparationError(`Order not found for ref: ${name}`, 'ORDER_NOT_FOUND', 404);
      if (order.odoo_picking_id != null && order.odoo_picking_id !== id) throw preparationError('DO reference does not match its Odoo picking id.', 'ODOO_REFERENCE_MISMATCH', 409);

      const kind = `appointment_${action}`;
      const key = hash({ orderId: order.id, kind, request_ref: request_ref.trim() });
      const prior = await tx.odoo_change_requests.findUnique({ where: { request_key: key } });
      if (prior) return reviewResult(prior, order);

      if (!ACTIVE_APPOINTMENT.includes(order.appointment_status)) throw preparationError('This DOO has no active CE Hub appointment to change.', 'NO_ACTIVE_APPOINTMENT', 409);
      const blockers = appointmentBlockers(order);
      if (blockers.length) throw preparationError(blockers.join(' '), 'APPOINTMENT_LOCKED', 409);

      const before = snapshot(order);
      const request = await tx.odoo_change_requests.create({ data: {
        order_id: order.id, do_ref: order.odoo_order_ref, request_kind: kind, request_key: key,
        payload: { id, name, request_ref: request_ref.trim(), action, reason: reason?.trim() || null, requested_by: requested_by?.trim() || null },
        before_snapshot: before, baseline_hash: hash(before),
        changes: [{
          field: 'appointment',
          label: action === 'edit' ? 'Request edit appointment' : 'Request cancel appointment',
          before: {
            status: order.appointment_status,
            date: order.requested_appointment_date, session: order.requested_appointment_session,
            scheduled_start: order.scheduled_start_date_time, scheduled_end: order.scheduled_end_date_time,
          },
          after: reason?.trim() || null,
        }],
        status: 'pending',
      } });
      return reviewResult(request, order);
    }, { timeout: 20000 });
  } catch (error) {
    return asResult(error);
  }
}

/**
 * Called inside decideRequest's transaction for appointment_* kinds. Approval
 * releases the slot so the DOO goes back to Pending; Odoo is told to clear its
 * confirmed appointment and re-enable Confirm Appointment. Rejection changes
 * nothing locally. Returns what finishAppointmentDecision needs after commit.
 */
async function applyAppointmentDecision(tx, request, decision) {
  const order = await tx.orders.findUnique({ where: { id: request.order_id }, include: { order_products: true, time_slots: true } });
  if (decision !== 'approve') return { order, previousSlotId: null };
  if (!order) throw preparationError('The order no longer exists.', 'ORDER_NOT_FOUND', 404);

  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;
  const blockers = appointmentBlockers(order);
  if (blockers.length) throw preparationError(blockers.join(' '), 'APPOINTMENT_LOCKED', 409);

  await tx.orders.update({ where: { id: order.id }, data: {
    time_slot_id: null, scheduled_start_date_time: null, scheduled_end_date_time: null,
    assignment_status: 'unassigned', order_status: 'Pending',
    appointment_status: 'cancelled', appointment_request_ref: null,
    appointment_message: request.payload?.reason || null, appointment_confirmed_at: null,
    updated_at: new Date(),
  } });
  return { order, previousSlotId: order.time_slot_id };
}

async function finishAppointmentDecision(reviewed, effect) {
  if (effect.previousSlotId) {
    const { updateTimeslotResources } = require('./scheduler');
    await updateTimeslotResources(effect.previousSlotId)
      .catch(e => console.error('[OdooAppointment] Slot resources not refreshed:', e.message));
  }
  if (!reviewed.do_ref) return;
  await enqueue({
    eventType:      'APPOINTMENT_CHANGE_DECISION',
    target:         'odoo',
    payload:        buildAppointmentDecisionPayload(reviewed, effect.order),
    idempotencyKey: `odoo-change:${reviewed.id}:decision`,
  });
}

module.exports = {
  requestAppointment,
  requestAppointmentChange,
  appointmentBlockers,
  applyAppointmentDecision,
  finishAppointmentDecision,
};
