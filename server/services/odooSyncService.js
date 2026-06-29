/**
 * A1.4 — Odoo Order Ingestion Polling Service
 *
 * Safety net for the Odoo "push" button workflow: runs once daily at 5PM MYT
 * and makes sure every confirmed sale order delivering TOMORROW already
 * exists in CE Hub, in case it was never pushed (or push failed) from Odoo.
 * Only creates missing orders — does not touch orders already present
 * (those are kept in sync via the push endpoints instead).
 */
const dayjs  = require('dayjs');
const prisma = require('../prismaClient');

async function syncOrdersFromOdoo() {
  if (!process.env.ODOO_URL) {
    console.log('[OdooSync] ODOO_URL not configured — skipping sync.');
    return { synced: 0, skipped: 0 };
  }

  try {
    const { getOrdersForDeliveryDate, getOrderDetail } = require('./odooService');
    const { pushOrder } = require('./odooOrderIngestService');

    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
    const odooOrders = await getOrdersForDeliveryDate(tomorrow);

    if (!odooOrders?.length) {
      console.log(`[OdooSync] No confirmed orders in Odoo for ${tomorrow}.`);
      return { synced: 0, skipped: 0 };
    }

    let synced = 0;
    let skipped = 0;

    for (const oo of odooOrders) {
      const odooRef = oo.name;
      if (!odooRef) continue;

      // Skip if already in CE Hub — push endpoints own keeping it up to date
      const existing = await prisma.orders.findFirst({ where: { odoo_order_ref: odooRef } });
      if (existing) { skipped++; continue; }

      const detail = await getOrderDetail(oo.id);
      if (!detail) { console.warn(`[OdooSync] Could not resolve detail for ${odooRef} — skipped.`); skipped++; continue; }

      const result = await pushOrder(detail);
      if (result.success) {
        console.log(`[OdooSync] Imported next-day order missed by push: ${odooRef}`);
        synced++;
      } else {
        console.warn(`[OdooSync] Failed to import ${odooRef}: ${result.error}`);
        skipped++;
      }
    }

    console.log(`[OdooSync] Done for ${tomorrow} — synced: ${synced}, skipped: ${skipped}`);
    return { synced, skipped };
  } catch (err) {
    console.error('[OdooSync] Sync failed:', err.message);
    return { synced: 0, skipped: 0, error: err.message };
  }
}

module.exports = { syncOrdersFromOdoo };
