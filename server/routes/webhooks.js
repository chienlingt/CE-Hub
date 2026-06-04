const express = require('express');
const router  = express.Router();
const prisma  = require('../prismaClient');
const { extractBuildingName } = require('../utils/addressParser');

const WEBHOOK_SECRET = process.env.ODOO_WEBHOOK_SECRET;

function verifySecret(req, res, next) {
  const provided = req.headers['x-odoo-secret'];
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * POST /api/webhooks/odoo/order
 *
 * Triggered by an Odoo Automated Action when a sale.order is confirmed (state = 'sale').
 *
 * Configure the Odoo Automated Action → Send Webhook with:
 *   URL:    https://lab2.tbm2u.net/api/webhooks/odoo/order
 *   Header: X-Odoo-Secret: <your ODOO_WEBHOOK_SECRET>
 *   Body (JSON template):
 *   {
 *     "id":                  {{ object.id }},
 *     "name":                "{{ object.name }}",
 *     "partner_name":        "{{ object.partner_id.name }}",
 *     "partner_email":       "{{ object.partner_id.email }}",
 *     "partner_phone":       "{{ object.partner_id.phone }}",
 *     "delivery_address":    "{{ object.partner_shipping_id.street }}",
 *     "delivery_city":       "{{ object.partner_shipping_id.city }}",
 *     "delivery_state_name": "{{ object.partner_shipping_id.state_id.name }}",
 *     "delivery_zip":        "{{ object.partner_shipping_id.zip }}",
 *     "order_lines": [
 *       {% for line in object.order_line %}
 *       { "product_name": "{{ line.product_id.name }}", "product_uom_qty": {{ line.product_uom_qty }} }
 *       {% endfor %}
 *     ]
 *   }
 */
router.post('/odoo/order', verifySecret, async (req, res) => {
  try {
    const {
      id:                 odoo_id,
      name:               odoo_order_ref,
      partner_name,
      partner_email,
      partner_phone,
      delivery_address,
      delivery_city,
      delivery_state_name,
      delivery_zip,
      delivery_remarks,
      order_lines = [],
    } = req.body;

    if (!odoo_id || !odoo_order_ref) {
      return res.status(400).json({ error: 'Payload must include id and name' });
    }

    // Idempotency — skip already-imported orders
    const existing = await prisma.orders.findFirst({ where: { odoo_order_ref } });
    if (existing) {
      return res.json({ success: true, skipped: true, order_id: existing.id });
    }

    // Upsert customer by email; create if not found
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

    // Resolve or create building from delivery address
    const buildingName = extractBuildingName(delivery_address || '') || 'Unknown';
    let building = await prisma.buildings.findFirst({
      where: { building_name: { equals: buildingName, mode: 'insensitive' } },
    });
    if (!building) {
      building = await prisma.buildings.create({
        data: {
          building_name:            buildingName,
          housing_type:             'Residential',
          postal_code:              delivery_zip || null,
          access_time_window_start: '08:00',
          access_time_window_end:   '20:00',
          created_at:               new Date(),
        },
      });
    }

    // Match order lines to local products by name
    const productLines = [];
    for (const line of order_lines) {
      if (!line.product_name) continue;
      const product = await prisma.products.findFirst({
        where: {
          product_name:   { contains: line.product_name, mode: 'insensitive' },
          available_flag: true,
        },
      });
      if (product) {
        productLines.push({
          product_id:         product.id,
          quantity:           Number(line.product_uom_qty) || 1,
          service_type:       'delivery',
          dismantle_required: false,
        });
      } else {
        console.warn(`[Odoo Webhook] No local product matched: "${line.product_name}"`);
      }
    }

    const order = await prisma.orders.create({
      data: {
        customer_id:       customer.id,
        building_id:       building.id,
        order_status:      'Pending',
        odoo_order_ref,
        delivery_address:  delivery_address    || null,
        delivery_city:     delivery_city       || null,
        delivery_postcode: delivery_zip        || null,
        delivery_state:    delivery_state_name || null,
        delivery_remarks:          delivery_remarks    || null,
        original_delivery_address: delivery_address    || null,
        assignment_status:         'unassigned',
        created_at:        new Date(),
        updated_at:        new Date(),
        ...(productLines.length > 0 && { order_products: { create: productLines } }),
      },
    });

    console.log(`[Odoo Webhook] Imported ${odoo_order_ref} → local id ${order.id}`);
    return res.status(201).json({ success: true, order_id: order.id });
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/order error:', err);
    return res.status(500).json({ error: 'Failed to process webhook', details: err.message });
  }
});

/**
 * POST /api/webhooks/odoo/order-update
 *
 * Triggered by an Odoo Automated Action when a confirmed sale.order is edited —
 * order lines changed (item/qty), customer details updated, or delivery address changed.
 * All fields are optional except "name". Only fields present in the payload are updated.
 *
 * Configure the Odoo Automated Action → Send Webhook with:
 *   URL:    https://lab2.tbm2u.net/api/webhooks/odoo/order-update
 *   Header: X-Odoo-Secret: <your ODOO_WEBHOOK_SECRET>
 *   Body (JSON template):
 *   {
 *     "name":                "{{ object.name }}",
 *     "partner_name":        "{{ object.partner_id.name }}",
 *     "partner_phone":       "{{ object.partner_id.phone }}",
 *     "partner_email":       "{{ object.partner_id.email }}",
 *     "delivery_address":    "{{ object.partner_shipping_id.street }}",
 *     "delivery_city":       "{{ object.partner_shipping_id.city }}",
 *     "delivery_state_name": "{{ object.partner_shipping_id.state_id.name }}",
 *     "delivery_zip":        "{{ object.partner_shipping_id.zip }}",
 *     "delivery_remarks":    "{{ object.note }}",
 *     "order_lines": [
 *       {% for line in object.order_line %}
 *       { "product_name": "{{ line.product_id.name }}", "product_uom_qty": {{ line.product_uom_qty }}, "serial_number": "{{ line.lot_id.name }}" }
 *       {% endfor %}
 *     ]
 *   }
 *
 * Behaviour:
 *   - Pending   → updates customer details, delivery address, and/or order lines
 *   - Scheduled / Delivering / Delivered / Completed / Cancelled → blocked (409)
 *
 * Address change note:
 *   If delivery_address changes, any previously LLM-parsed address/contact fields are
 *   cleared so the admin reviews the new address afresh.
 */
router.post('/odoo/order-update', verifySecret, async (req, res) => {
  try {
    const {
      name:                odoo_order_ref,
      partner_name,
      partner_phone,
      partner_email,
      delivery_address,
      delivery_city,
      delivery_state_name,
      delivery_zip,
      delivery_remarks,
      order_lines,
    } = req.body;

    if (!odoo_order_ref) {
      return res.status(400).json({ error: 'Payload must include name (order reference)' });
    }

    const order = await prisma.orders.findFirst({
      where: { odoo_order_ref },
    });

    if (!order) {
      return res.status(404).json({ error: `Order not found for ref: ${odoo_order_ref}` });
    }

    // Block if already in motion — admin must handle manually
    const blocked = ['Scheduled', 'Delivering', 'Delivered', 'Completed', 'Cancelled'];
    if (blocked.includes(order.order_status)) {
      return res.status(409).json({
        error: `Cannot update — order is already ${order.order_status}. Admin must intervene manually.`,
        order_status: order.order_status,
      });
    }

    const changes = { updated_at: new Date() };

    // ── Delivery address fields ───────────────────────────────────────────────
    const addressChanged = delivery_address && delivery_address !== order.delivery_address;

    if (delivery_address)    changes.delivery_address  = delivery_address;
    if (delivery_city)       changes.delivery_city     = delivery_city;
    if (delivery_state_name) changes.delivery_state    = delivery_state_name;
    if (delivery_zip)        changes.delivery_postcode = delivery_zip;
    if (delivery_remarks)    changes.delivery_remarks  = delivery_remarks;

    // If address changed, clear LLM-parsed fields so admin reviews from scratch
    if (addressChanged) {
      changes.remarks_delivery_address = null;
      changes.remarks_contact_phone    = null;
      changes.remarks_contact_name     = null;
      changes.remarks_driver_notes     = null;
    }

    // ── Re-resolve building if delivery address changed ───────────────────────
    if (addressChanged) {
      const newBuildingName = extractBuildingName(delivery_address) || 'Unknown';
      let building = await prisma.buildings.findFirst({
        where: { building_name: { equals: newBuildingName, mode: 'insensitive' } },
      });
      if (!building) {
        building = await prisma.buildings.create({
          data: {
            building_name:            newBuildingName,
            housing_type:             'Residential',
            postal_code:              delivery_zip || null,
            access_time_window_start: '08:00',
            access_time_window_end:   '20:00',
            created_at:               new Date(),
          },
        });
      }
      changes.building_id = building.id;
    }

    // ── Update order ──────────────────────────────────────────────────────────
    await prisma.orders.update({ where: { id: order.id }, data: changes });

    // ── Update customer details ───────────────────────────────────────────────
    if (order.customer_id && (partner_name || partner_phone || partner_email)) {
      const customerUpdate = {};
      if (partner_name)  customerUpdate.full_name = partner_name;
      if (partner_phone) customerUpdate.phone     = partner_phone;
      if (partner_email) customerUpdate.email     = partner_email;
      await prisma.customers.update({
        where: { id: order.customer_id },
        data:  customerUpdate,
      });
    }

    // ── Replace order lines if provided ──────────────────────────────────────
    let updatedLines = 0;
    if (Array.isArray(order_lines)) {
      await prisma.order_products.deleteMany({ where: { order_id: order.id } });

      const productLines = [];
      for (const line of order_lines) {
        if (!line.product_name) continue;
        const product = await prisma.products.findFirst({
          where: {
            product_name:   { contains: line.product_name, mode: 'insensitive' },
            available_flag: true,
          },
        });
        if (product) {
          productLines.push({
            order_id:           order.id,
            product_id:         product.id,
            quantity:           Number(line.product_uom_qty) || 1,
            service_type:       'delivery',
            dismantle_required: false,
            assigned_serial:    line.serial_number || null,
          });
        } else {
          console.warn(`[Odoo order-update] No local product matched: "${line.product_name}"`);
        }
      }

      if (productLines.length > 0) {
        await prisma.order_products.createMany({ data: productLines });
      }
      updatedLines = productLines.length;
    }

    console.log(`[Odoo order-update] ${odoo_order_ref} — lines: ${updatedLines}, addressChanged: ${!!addressChanged}`);
    return res.json({
      success:         true,
      updated_lines:   updatedLines,
      address_changed: !!addressChanged,
    });
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/order-update error:', err);
    return res.status(500).json({ error: 'Failed to update order', details: err.message });
  }
});

/**
 * POST /api/webhooks/odoo/order-cancel
 *
 * Triggered by an Odoo Automated Action when a sale.order is cancelled.
 * Configure the webhook URL as: https://lab2.tbm2u.net/api/webhooks/odoo/order-cancel
 *
 * Expected payload: { "name": "S00042" }
 */
router.post('/odoo/order-cancel', verifySecret, async (req, res) => {
  try {
    const { name: odoo_order_ref } = req.body;

    if (!odoo_order_ref) {
      return res.status(400).json({ error: 'Payload must include name (order reference)' });
    }

    const order = await prisma.orders.findFirst({ where: { odoo_order_ref } });
    if (!order) {
      return res.status(404).json({ error: `Order not found for ref: ${odoo_order_ref}` });
    }

    if (['Delivered', 'Completed'].includes(order.order_status)) {
      return res.status(409).json({
        error: 'Cannot cancel an order that is already delivered or completed',
      });
    }

    await prisma.orders.update({
      where: { id: order.id },
      data:  { order_status: 'Cancelled', updated_at: new Date() },
    });

    console.log(`[Odoo Webhook] Cancelled ${odoo_order_ref}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('[Odoo Webhook] /odoo/order-cancel error:', err);
    return res.status(500).json({ error: 'Failed to cancel order', details: err.message });
  }
});

module.exports = router;
