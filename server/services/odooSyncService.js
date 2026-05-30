/**
 * A1.4 — Odoo Order Ingestion Polling Service
 *
 * Fallback for missed webhooks. Polls Odoo every 15 minutes for confirmed
 * sale orders and imports any that are not yet in CE Hub.
 */
const prisma = require('../prismaClient');
const { extractBuildingName } = require('../utils/addressParser');

async function syncOrdersFromOdoo() {
  if (!process.env.ODOO_URL) {
    console.log('[OdooSync] ODOO_URL not configured — skipping sync.');
    return { synced: 0, skipped: 0 };
  }

  try {
    const { getConfirmedOrders } = require('./odooService');

    // Only fetch orders updated in the last 24h to keep the query small
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const odooOrders = await getConfirmedOrders(since);

    if (!odooOrders?.length) {
      console.log('[OdooSync] No new confirmed orders from Odoo.');
      return { synced: 0, skipped: 0 };
    }

    let synced = 0;
    let skipped = 0;

    for (const oo of odooOrders) {
      const odooRef = oo.name;
      if (!odooRef) continue;

      // Skip if already in CE Hub
      const existing = await prisma.orders.findFirst({ where: { odoo_order_ref: odooRef } });
      if (existing) { skipped++; continue; }

      // Resolve partner (customer) info — Odoo returns [id, name] tuple for Many2one
      const partnerName  = Array.isArray(oo.partner_id) ? oo.partner_id[1] : oo.partner_id;

      // Upsert customer by Odoo partner name (no email available in search_read by default)
      let customer = await prisma.customers.findFirst({
        where: { full_name: { equals: partnerName, mode: 'insensitive' } },
      });
      if (!customer) {
        customer = await prisma.customers.create({
          data: { full_name: partnerName || 'Unknown', created_at: new Date() },
        });
      }

      // Resolve building
      const buildingName = extractBuildingName(partnerName || '') || 'Unknown';
      let building = await prisma.buildings.findFirst({
        where: { building_name: { equals: buildingName, mode: 'insensitive' } },
      });
      if (!building) {
        building = await prisma.buildings.create({
          data: {
            building_name:            buildingName,
            housing_type:             'Residential',
            access_time_window_start: '08:00',
            access_time_window_end:   '20:00',
            created_at:               new Date(),
          },
        });
      }

      await prisma.orders.create({
        data: {
          customer_id:       customer.id,
          building_id:       building.id,
          order_status:      'Pending',
          assignment_status: 'unassigned',
          odoo_order_ref:    odooRef,
          created_at:        new Date(),
          updated_at:        new Date(),
        },
      });

      console.log(`[OdooSync] Imported missed order: ${odooRef}`);
      synced++;
    }

    console.log(`[OdooSync] Done — synced: ${synced}, skipped (already exists): ${skipped}`);
    return { synced, skipped };
  } catch (err) {
    console.error('[OdooSync] Sync failed:', err.message);
    return { synced: 0, skipped: 0, error: err.message };
  }
}

module.exports = { syncOrdersFromOdoo };
