// server/services/odooOrderIngestService.js
//
// Shared create-or-update logic for ingesting an Odoo sale.order into CE Hub.
// Used by: the single-order push webhook, the bulk push webhook, and the
// 5PM next-day fallback sync — so all three entry points behave identically.

const prisma = require('../prismaClient');
const { extractBuildingName } = require('../utils/addressParser');

const IN_MOTION_STATUSES = ['Scheduled', 'Delivering', 'Delivered', 'Cancelled'];

async function resolveBuilding(address, zip, fallbackName = '') {
  const buildingName = extractBuildingName(address || fallbackName || '') || 'Unknown';
  let building = await prisma.buildings.findFirst({
    where: { building_name: { equals: buildingName, mode: 'insensitive' } },
  });
  if (!building) {
    building = await prisma.buildings.create({
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
 * (picked/loaded/unloaded) — those are kept and logged, never silently destroyed.
 */
async function mergeOrderLines(orderId, newLines = []) {
  const existing = await prisma.order_products.findMany({ where: { order_id: orderId } });

  const incoming = newLines
    .filter(l => l.product_name && l.order_line_id)
    .map(l => ({
      odoo_line_id:     l.order_line_id,
      odoo_product_name: l.product_name,
      quantity:         Number(l.product_uom_qty) || 1,
      assigned_serial:  l.serial_number || null,
    }));

  const incomingIds = new Set(incoming.map(l => l.odoo_line_id));

  let created = 0, updated = 0, deleted = 0, protectedCount = 0;

  // Lines that disappeared from the Odoo payload
  for (const ex of existing) {
    if (!ex.odoo_line_id || incomingIds.has(ex.odoo_line_id)) continue;

    const hasProgress = ex.item_delivery_status === 'delivered' || ex.picking_status !== 'pending';
    if (hasProgress) {
      protectedCount++;
      console.warn(`[Odoo push] Line ${ex.odoo_line_id} removed in Odoo but already in progress/delivered (order ${orderId}) — kept.`);
      continue;
    }

    await prisma.order_products.delete({ where: { id: ex.id } });
    deleted++;
  }

  // Lines present in the new payload
  for (const inc of incoming) {
    const match = existing.find(ex => ex.odoo_line_id === inc.odoo_line_id);

    if (!match) {
      await prisma.order_products.create({
        data: {
          order_id:          orderId,
          odoo_line_id:      inc.odoo_line_id,
          odoo_product_name: inc.odoo_product_name,
          quantity:          inc.quantity,
          assigned_serial:   inc.assigned_serial,
          service_type:      'delivery',
        },
      });
      created++;
      continue;
    }

    if (match.picking_status === 'pending') {
      await prisma.order_products.update({
        where: { id: match.id },
        data:  {
          odoo_product_name: inc.odoo_product_name,
          quantity:          inc.quantity,
          assigned_serial:   inc.assigned_serial,
        },
      });
      updated++;
    }
  }

  return { created, updated, deleted, protected: protectedCount };
}

/**
 * Create-or-update one order from an Odoo payload (webhook shape — see
 * server/routes/webhooks.js POST /odoo/order for the field list).
 * Returns a result object; never throws for expected business conditions
 * (missing ref, order already in motion) — only throws on unexpected DB errors.
 */
async function pushOrder(payload) {
  const {
    name: odoo_order_ref,
    sales_order_name: odoo_sales_ref,
    partner_name, partner_email, partner_phone,
    delivery_address, delivery_city, delivery_state_name, delivery_zip, delivery_remarks,
    salesperson_name, salesperson_phone,
    order_lines = [],
  } = payload || {};

  if (!odoo_order_ref) {
    return { success: false, error: 'Payload must include name (order reference)' };
  }

  const existing = await prisma.orders.findFirst({ where: { odoo_order_ref } });

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

    const changes = { updated_at: new Date() };
    const addressChanged = delivery_address && delivery_address !== existing.delivery_address;

    if (odoo_sales_ref)       changes.odoo_sales_ref    = odoo_sales_ref;
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
      const building = await resolveBuilding(delivery_address, delivery_zip);
      changes.building_id = building.id;
    }

    await prisma.orders.update({ where: { id: existing.id }, data: changes });

    if (existing.customer_id && (partner_name || partner_phone || partner_email)) {
      const customerUpdate = {};
      if (partner_name)  customerUpdate.full_name = partner_name;
      if (partner_phone) customerUpdate.phone     = partner_phone;
      if (partner_email) customerUpdate.email     = partner_email;
      await prisma.customers.update({ where: { id: existing.customer_id }, data: customerUpdate });
    }

    const lineResult = await mergeOrderLines(existing.id, order_lines);

    return { success: true, action: 'updated', order_id: existing.id, address_changed: !!addressChanged, lines: lineResult };
  }

  // ── New order — create ──────────────────────────────────────────────────
  let customer = partner_email
    ? await prisma.customers.findFirst({ where: { email: partner_email } })
    : null;

  if (!customer) {
    customer = await prisma.customers.create({
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

  const building = await resolveBuilding(delivery_address, delivery_zip, partner_name);

  const productLines = order_lines
    .filter(l => l.product_name && l.order_line_id)
    .map(l => ({
      odoo_line_id:      l.order_line_id,
      odoo_product_name: l.product_name,
      quantity:          Number(l.product_uom_qty) || 1,
      service_type:      'delivery',
      dismantle_required: false,
      assigned_serial:   l.serial_number || null,
    }));

  const order = await prisma.orders.create({
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

module.exports = { pushOrder, mergeOrderLines, resolveBuilding };
