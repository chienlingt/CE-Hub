// server/services/odooCallbackEnvelope.js
//
// One versioned envelope for every CE Hub -> Odoo callback (GCA Integration Method
// Report §5, FRD v1.2 INT-04, INT-07..INT-11). The HTTP transport posts it as is; the
// JSON-RPC transport writes the same data as fields and Log Notes. Contract for GCA:
// docs/odoo-callback-spec.md.
//
//   event_id   the outbox row id: the update reference (FRD §12 #10); stable across retries
//   sequence   per-DO counter, increasing in the order CE Hub queued the events
//   occurred_at when the business event happened (FRD §12 #12)
//   attempt    delivery attempt of this DO (FRD §12 #15)
//
// Pure: no database or network access.

const { toMytIso } = require('./odooPayloadBuilder');

const SCHEMA_VERSION = '1.0';

// CE Hub status -> FRD v1.2 operational status value (same as x_delivery_status).
const ODOO_STATUS = {
  Picked: 'picked', Loaded: 'loaded', Delivering: 'in_transit', Arrived: 'arrived',
  Delivered: 'delivered', Failed: 'failed',
};

const EVENT_TYPES = {
  APPOINTMENT_RESULT: 'appointment_result',
  STATUS: 'status',
  DRIVER_CHANGED: 'driver_changed',
  DELIVERED_FULL: 'delivered_full',
  DELIVERED_PARTIAL: 'delivered_partial',
  FAILED: 'failed',
  CHANGE_DECISION: 'change_decision',
};

// Outbox rows the callback transport handles. Everything else stays internal.
const CALLBACK_ROW_TYPES = ['SLOT_STATUS_CHANGED', 'ORDER_FAILED', 'APPOINTMENT_CONFIRMATION', 'APPOINTMENT_CHANGE_DECISION', 'DRIVER_CHANGED'];

function eventTypeFor(row) {
  const payload = row.payload || {};
  switch (row.event_type) {
    case 'APPOINTMENT_CONFIRMATION': return EVENT_TYPES.APPOINTMENT_RESULT;
    case 'APPOINTMENT_CHANGE_DECISION': return EVENT_TYPES.CHANGE_DECISION;
    case 'DRIVER_CHANGED': return EVENT_TYPES.DRIVER_CHANGED;
    case 'ORDER_FAILED': return EVENT_TYPES.FAILED;
    case 'SLOT_STATUS_CHANGED':
      if (payload.status === 'Delivered') return payload.is_partial ? EVENT_TYPES.DELIVERED_PARTIAL : EVENT_TYPES.DELIVERED_FULL;
      if (payload.status === 'Failed') return EVENT_TYPES.FAILED;
      if (ODOO_STATUS[payload.status]) return EVENT_TYPES.STATUS;
      return null;
    default: return null;
  }
}

function crewOf(payload) {
  return {
    driver_name: payload.driver_name ?? null,
    assistant_name: payload.assistant_name ?? null,
    driver_ref: payload.driver_ref ?? null,
    assistant_ref: payload.assistant_ref ?? null,
    vehicle_plate: payload.vehicle_plate ?? null,
    vehicle_ref: payload.vehicle_ref ?? null,
    trip_ref: payload.trip_ref ?? null,
    slot_ref: payload.slot_ref ?? null,
  };
}

// Per-line delivery result: disjoint quantities and serials (delivered + undelivered +
// damaged = quantity) plus one exception entry per unit that did not reach the customer.
function resultLines(payload) {
  return (payload.order_lines || []).map(line => ({
    order_line_id: line.order_line_id,
    quantity: line.quantity,
    delivered_qty: line.delivered_qty ?? line.actual_delivered_qty ?? null,
    undelivered_qty: line.undelivered_qty ?? null,
    damaged_qty: line.damaged_qty ?? 0,
    delivered_serial_numbers: line.delivered_serial_numbers || [],
    undelivered_serial_numbers: line.undelivered_serial_numbers || [],
    damaged_serial_numbers: line.damaged_serial_numbers || [],
    exceptions: (line.exceptions || []).map(({ evidence_paths: _paths, ...exception }) => exception),
  }));
}

function attachmentsOf(files) {
  return (files || []).map(file => ({ kind: file.kind, filename: file.filename, mimetype: file.mimetype, base64: file.base64 }));
}

function dataFor(eventType, payload, files) {
  switch (eventType) {
    case EVENT_TYPES.APPOINTMENT_RESULT: {
      const { do_ref: _d, so_ref: _s, cehub_order_id: _c, order_line_model: _m, timestamp: _t, sequence: _q, attempt_no: _a, attempt_ref: _r, ...data } = payload;
      return data;
    }
    case EVENT_TYPES.CHANGE_DECISION: {
      const { do_ref: _d, cehub_order_id: _c, timestamp: _t, sequence: _q, ...data } = payload;
      return data;
    }
    case EVENT_TYPES.STATUS:
      return {
        status: ODOO_STATUS[payload.status],
        ...crewOf(payload),
        scheduled_start: payload.scheduled_start ?? null,
        scheduled_end: payload.scheduled_end ?? null,
        ...(['Loaded', 'Arrived'].includes(payload.status) && {
          order_lines: (payload.order_lines || []).map(line => ({
            order_line_id: line.order_line_id, quantity: line.quantity,
            prepared_quantity: line.prepared_quantity ?? null, serial_numbers: line.serial_numbers || [],
          })),
        }),
      };
    case EVENT_TYPES.DRIVER_CHANGED:
      return { ...crewOf(payload), previous: payload.previous_crew || null };
    case EVENT_TYPES.DELIVERED_FULL:
    case EVENT_TYPES.DELIVERED_PARTIAL:
      return {
        status: 'delivered',
        is_partial: eventType === EVENT_TYPES.DELIVERED_PARTIAL,
        completion_time: payload.delivered_time ?? payload.occurred_at ?? null,
        arrived_time: payload.arrived_time ?? null,
        ...crewOf(payload),
        order_lines: resultLines(payload),
        remarks: payload.remarks ?? null,
        notes: payload.delivery_notes ?? null,
        signature_captured: !!payload.signature_captured,
        attachments: attachmentsOf(files),
      };
    case EVENT_TYPES.FAILED:
      return {
        status: 'failed',
        failure_reason: payload.failure_reason ?? null,
        remarks: payload.remarks ?? null,
        notes: payload.delivery_notes ?? null,
        failure_event_id: payload.failure_event_id ?? null,
        attempt_time: payload.attempt_time ?? null,
        ...crewOf(payload),
        order_lines: resultLines(payload),
        attachments: attachmentsOf(files),
      };
    default:
      return {};
  }
}

/**
 * @param {{ id: string, event_type: string, payload: object, created_at?: Date }} row - integration_outbox row
 * @param {{ files?: Array, now?: Date }} [options] - proof files (odooProofFiles.proofFilesFor) and clock
 * @returns {object|null} the envelope, or null for a row that is not an Odoo callback
 */
function buildEnvelope(row, { files = [], now = new Date() } = {}) {
  const eventType = eventTypeFor(row);
  if (!eventType) return null;
  const payload = row.payload || {};
  const attemptNo = payload.attempt_no ?? null;
  return {
    schema_version: SCHEMA_VERSION,
    event_id: row.id,
    event_type: eventType,
    sequence: payload.sequence ?? null,
    occurred_at: payload.occurred_at || payload.reviewed_at || payload.timestamp || toMytIso(row.created_at) || null,
    sent_at: toMytIso(now),
    do_ref: payload.do_ref || payload.odooRef || null,
    picking_id: payload.picking_id ?? null,
    cehub_order_id: payload.ce_hub_order_ref || payload.cehub_order_id || null,
    order_line_model: payload.order_line_model || 'stock.move',
    attempt: attemptNo == null ? null : { no: attemptNo, ref: payload.attempt_ref || null },
    data: dataFor(eventType, payload, files),
  };
}

module.exports = { buildEnvelope, eventTypeFor, EVENT_TYPES, ODOO_STATUS, CALLBACK_ROW_TYPES, SCHEMA_VERSION };
