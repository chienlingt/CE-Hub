// server/services/odooOrderIngestService.js
//
// Shared create-or-update logic for ingesting an Odoo sale.order into CE Hub.
// Used by: the single-order push webhook, the bulk push webhook, and the
// 5PM next-day fallback sync — so all three entry points behave identically.

const prisma = require('../prismaClient');
const { extractBuildingName } = require('../utils/addressParser');
const { normalizePreparation, mergePreparationUnits, preparationError } = require('./odooPreparation');
const { unitsFor, summarizeUnits } = require('./orderProductUnits');
const { recordPickedMilestone } = require('./odooProgressService');

const IN_MOTION_STATUSES = ['Scheduled', 'Delivering', 'Delivered', 'Cancelled'];

async function resolveBuilding(address, zip, fallbackName = '', db = prisma) {
  const buildingName = extractBuildingName(address || fallbackName || '') || 'Unknown';
  let building = await db.buildings.findFirst({
    where: { building_name: { equals: buildingName, mode: 'insensitive' } },
  });
  if (!building) {
    building = await db.buildings.create({
      data: {
        building_name:            buildingName,
        housing_type:             'Residential',
        postal_code:              zip || null,
        access_time_window_start: '08:00',
        access_time_window_end:   '20:00',
        created_at:               new Date(),
      },
    });
  }
  return building;
}

/**
 * Diff an order's existing order_products against a fresh set of Odoo order
 * lines. Lines are matched by odoo_line_id (Odoo sale.order.line ID).
 * Lines removed from Odoo are deleted UNLESS the item already has progress
 * (loaded/unloaded) — those are kept and logged, never silently destroyed.
 */
async function mergeOrderLines(orderId, newLines = [], odooOrderRef = null, db = prisma, ready = false) {
  const existing = await db.order_products.findMany({ where: { order_id: orderId } });
  const incoming = normalizePreparation(newLines, ready);
  await assertNoSerialConflicts(db, incoming, orderId);
  const ids = new Set(incoming.map(line => line.odoo_line_id));
  const removed = existing.filter(line => line.odoo_line_id && !ids.has(line.odoo_line_id));
  if (removed.some(line => unitsFor(line).some(unit => unit.handling_status !== 'pending'))) {
    throw preparationError('Cannot remove an Odoo line after scanning started.', 'PREPARATION_LOCKED', 409);
  }
  const updates = incoming.map(line => {
    const match = existing.find(item => item.odoo_line_id === line.odoo_line_id);
    return { match, data: { ...line, ...summarizeUnits(mergePreparationUnits(match, line)) } };
  });
  for (const line of removed) await db.order_products.delete({ where: { id: line.id } });
  for (const { match, data } of updates) {
    if (match) await db.order_products.update({ where: { id: match.id }, data });
    else await db.order_products.create({ data: { ...data, order_id: orderId, service_type: 'delivery' } });
  }
  return { created: updates.filter(update => !update.match).length, updated: updates.filter(update => update.match).length, deleted: removed.length, protected: 0 };
}

/**
 * Create-or-update one order from an Odoo payload (webhook shape — see
 * server/routes/webhooks.js POST /odoo/order for the field list).
 * Returns a result object; never throws for expected business conditions
 * (missing ref, order already in motion) — only throws on unexpected DB errors.
 */
async function ingestOrder(payload, db) {
  const {
    name: odoo_order_ref,
    sales_order_name: odoo_sales_ref,
    partner_name, partner_email, partner_phone,
    delivery_address, delivery_city, delivery_state_name, delivery_zip, delivery_remarks,
    salesperson_name, salesperson_phone,
    // Customer-requested delivery window as read from Odoo's picking.scheduled_date
    // (see odooService.getOrderDetail) — a preference only, not guaranteed. Flows
    // Odoo -> CE Hub;
    preferred_delivery_time,
    order_lines = [],
  } = payload || {};

  if (!odoo_order_ref) {
    return { success: false, error: 'Payload must include name (order reference)' };
  }

  const existing = await db.orders.findFirst({ where: { odoo_order_ref } });
  if (!Number.isInteger(payload.id) || payload.id <= 0) throw preparationError('A positive Odoo stock.picking id is required.');
  if (payload.doo_ready !== undefined && typeof payload.doo_ready !== 'boolean') throw preparationError('doo_ready must be a boolean.');
  if (existing?.odoo_picking_id != null && existing.odoo_picking_id !== payload.id) throw preparationError('DO reference does not match its Odoo picking id.', 'ODOO_REFERENCE_MISMATCH', 409);
  const ready = payload.doo_ready ?? existing?.doo_ready ?? false;
  const preparation = normalizePreparation(order_lines, ready);

  if (existing) {
    if (IN_MOTION_STATUSES.includes(existing.order_status)) {
      return {
        success:      false,
        action:       'blocked',
        order_id:     existing.id,
        order_status: existing.order_status,
        error:        `Cannot update — order is already ${existing.order_status}. Admin must intervene manually.`,
      };
    }

    const changes = { updated_at: new Date(), odoo_picking_id: payload.id, doo_ready: ready };
    const addressChanged = delivery_address && delivery_address !== existing.delivery_address;

    if (odoo_sales_ref)       changes.odoo_sales_ref    = odoo_sales_ref;
    if (preferred_delivery_time) changes.preferred_timeslot = new Date(preferred_delivery_time);
    if (delivery_address)    changes.delivery_address  = delivery_address;
    if (delivery_city)       changes.delivery_city     = delivery_city;
    if (delivery_state_name) changes.delivery_state    = delivery_state_name;
    if (delivery_zip)        changes.delivery_postcode = delivery_zip;
    if (delivery_remarks)    changes.delivery_remarks  = delivery_remarks;
    if (salesperson_name)    changes.salesperson_name  = salesperson_name;
    if (salesperson_phone)   changes.salesperson_phone = salesperson_phone;

    if (addressChanged) {
      changes.remarks_delivery_address = null;
      changes.remarks_contact_phone    = null;
      changes.remarks_contact_name     = null;
      changes.remarks_driver_notes     = null;
      const building = await resolveBuilding(delivery_address, delivery_zip, '', db);
      changes.building_id = building.id;
    }

    await db.orders.update({ where: { id: existing.id }, data: changes });

    if (existing.customer_id && (partner_name || partner_phone || partner_email)) {
      const customerUpdate = {};
      if (partner_name)  customerUpdate.full_name = partner_name;
      if (partner_phone) customerUpdate.phone     = partner_phone;
      if (partner_email) customerUpdate.email     = partner_email;
      await db.customers.update({ where: { id: existing.customer_id }, data: customerUpdate });
    }

    const lineResult = await mergeOrderLines(existing.id, order_lines, odoo_order_ref, db, ready);

    return { success: true, action: 'updated', order_id: existing.id, address_changed: !!addressChanged, lines: lineResult };
  }

  // ── New order — create ──────────────────────────────────────────────────
  let customer = partner_email
    ? await db.customers.findFirst({ where: { email: partner_email } })
    : null;

  if (!customer) {
    customer = await db.customers.create({
      data: {
        full_name:  partner_name        || 'Unknown',
        email:      partner_email       || null,
        phone:      partner_phone       || null,
        address:    delivery_address    || null,
        city:       delivery_city       || null,
        state:      delivery_state_name || null,
        postcode:   delivery_zip        || null,
        created_at: new Date(),
      },
    });
  }

  const building = await resolveBuilding(delivery_address, delivery_zip, partner_name, db);

  const productLines = preparation.map(line => ({ ...line,
    ...summarizeUnits(mergePreparationUnits(null, line)),
    service_type: 'delivery', dismantle_required: false,
  }));
  await assertNoSerialConflicts(db, preparation);

  const order = await db.orders.create({
    data: {
      customer_id:               customer.id,
      building_id:               building.id,
      order_status:              'Pending',
      odoo_order_ref,
      delivery_address:          delivery_address    || null,
      delivery_city:             delivery_city       || null,
      delivery_postcode:         delivery_zip        || null,
      delivery_state:            delivery_state_name || null,
      delivery_remarks:          delivery_remarks    || null,
      original_delivery_address: delivery_address    || null,
      odoo_sales_ref:            odoo_sales_ref      || null,
      odoo_picking_id:           payload.id,
      doo_ready:                 ready,
      preferred_timeslot:        preferred_delivery_time ? new Date(preferred_delivery_time) : null,
      salesperson_name:          salesperson_name    || null,
      salesperson_phone:         salesperson_phone   || null,
      assignment_status:         'unassigned',
      created_at:                new Date(),
      updated_at:                new Date(),
      ...(productLines.length > 0 && { order_products: { create: productLines } }),
    },
  });

  return { success: true, action: 'created', order_id: order.id };
}

async function withPreparationLock(work) {
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19761019)`;
      const result = await work(tx);
      if (result.success && result.order_id) await recordPickedMilestone(tx, result.order_id);
      return result;
    }, { timeout: 20000 });
  } catch (error) {
    if (error.status) return { success: false, action: error.status === 409 ? 'blocked' : 'invalid', error: error.message, code: error.code };
    if (error.code === 'P2002') return { success: false, action: 'blocked', error: 'This Odoo reference is already registered.', code: 'ODOO_REFERENCE_CONFLICT' };
    throw error;
  }
}

async function assertNoSerialConflicts(db, lines, orderId = null) {
  const wanted = new Set(lines.flatMap(line => line.assigned_serials).map(serial => serial.toLowerCase()));
  if (!wanted.size) return;
  const others = await db.order_products.findMany({ where: {
    ...(orderId ? { order_id: { not: orderId } } : {}),
    orders: { order_status: { notIn: ['Delivered', 'Completed', 'Cancelled', 'Failed'] } },
  } });
  if (others.some(line => unitsFor(line).some(unit => ['assigned_serial', 'loaded_serial', 'unloaded_serial'].some(field => unit[field] && wanted.has(unit[field].trim().toLowerCase()))))) {
    throw preparationError('An assigned serial is already used by another active DOO.', 'SERIAL_DUPLICATE', 409);
  }
}

const pushOrder = payload => withPreparationLock(tx => ingestOrder(payload, tx));

// Separate from appointment/order edits: a full, authoritative preparation snapshot.
// Scheduled DOOs can receive their warehouse preparation without being rescheduled.
async function syncOrderPreparation(payload) {
  return withPreparationLock(async tx => {
    if (!payload?.name || !Number.isInteger(payload.id) || payload.id <= 0 || typeof payload.doo_ready !== 'boolean') throw preparationError('id, name and boolean doo_ready are required.');
    const order = await tx.orders.findFirst({ where: { odoo_order_ref: payload.name } });
    if (!order) throw preparationError('DOO must be imported before preparation can be synchronized.', 'ORDER_NOT_FOUND');
    if (order.odoo_picking_id != null && order.odoo_picking_id !== payload.id) throw preparationError('DO reference does not match its Odoo picking id.', 'ODOO_REFERENCE_MISMATCH', 409);
    if (['Delivering', 'In Progress', 'Delivered', 'Failed', 'Cancelled', 'Completed'].includes(order.order_status)) throw preparationError('Preparation cannot change after departure or a terminal outcome.', 'PREPARATION_LOCKED', 409);
    const current = await tx.order_products.findMany({ where: { order_id: order.id } });
    if (order.doo_ready !== payload.doo_ready && current.some(line => unitsFor(line).some(unit => unit.handling_status !== 'pending'))) throw preparationError('Reset scans before changing DOO Ready.', 'PREPARATION_LOCKED', 409);
    const result = await mergeOrderLines(order.id, payload.order_lines, payload.name, tx, payload.doo_ready);
    await tx.orders.update({ where: { id: order.id }, data: { odoo_picking_id: payload.id, doo_ready: payload.doo_ready, updated_at: new Date() } });
    return { success: true, action: 'preparation_updated', order_id: order.id, doo_ready: payload.doo_ready, lines: result };
  });
}

module.exports = { pushOrder, syncOrderPreparation, mergeOrderLines, resolveBuilding };
