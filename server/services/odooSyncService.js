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

async function syncOrdersFromOdoo(targetDate = null) {
  if (!process.env.ODOO_URL) {
    console.log('[OdooSync] ODOO_URL not configured — skipping sync.');
    return { synced: 0, skipped: 0, synced_dos: [], skipped_dos: [] };
  }

  try {
    const { getOrdersForDeliveryDate, getOrderDetail } = require('./odooService');
    const { pushOrder } = require('./odooOrderIngestService');

    const tomorrow = targetDate || dayjs().add(1, 'day').format('YYYY-MM-DD');
    const odooOrders = await getOrdersForDeliveryDate(tomorrow);

    if (!odooOrders?.length) {
      console.log(`[OdooSync] No confirmed orders in Odoo for ${tomorrow}.`);
      return { synced: 0, skipped: 0, synced_dos: [], skipped_dos: [] };
    }

    // Track the actual DO references, not just counts, so GCA can see which
    // DOs were imported vs. skipped in the FALLBACK_POLL_COMPLETE payload.
    const syncedDos  = [];
    const skippedDos = [];

    for (const oo of odooOrders) {
      const odooRef = oo.name;
      if (!odooRef) continue;

      // Skip if already in CE Hub — push endpoints own keeping it up to date
      const existing = await prisma.orders.findFirst({ where: { odoo_order_ref: odooRef } });
      if (existing) { skippedDos.push(odooRef); continue; }

      const detail = await getOrderDetail(oo.id);
      if (!detail) { console.warn(`[OdooSync] Could not resolve detail for ${odooRef} — skipped.`); skippedDos.push(odooRef); continue; }

      const result = await pushOrder(detail);
      if (result.success) {
        console.log(`[OdooSync] Imported next-day order missed by push: ${odooRef}`);
        syncedDos.push(odooRef);
      } else {
        console.warn(`[OdooSync] Failed to import ${odooRef}: ${result.error}`);
        skippedDos.push(odooRef);
      }
    }

    const synced  = syncedDos.length;
    const skipped = skippedDos.length;

    console.log(`[OdooSync] Done for ${tomorrow} — synced: ${synced}, skipped: ${skipped}`);

    // Emit outbox event so Odoo/GCA knows polling is complete and can trigger D-1 WhatsApp.
    // Carries the actual DO references (not just counts) so GCA can identify exactly which
    // orders CE Hub now has — the send-to-Odoo side is still a stub (see integrationOutboxCron.js
    // handleFallbackPollComplete) pending GCA confirming the receiving mechanism.
    try {
      await prisma.integration_outbox.create({
        data: {
          event_type:      'FALLBACK_POLL_COMPLETE',
          target:          'odoo',
          payload:         {
            date:          tomorrow,
            synced_dos:    syncedDos,
            skipped_dos:   skippedDos,
            synced_count:  synced,
            skipped_count: skipped,
          },
          idempotency_key: `fallback_poll:${tomorrow}`,
          status:          'pending',
          attempts:        0,
          created_at:      new Date(),
        },
      });
    } catch (outboxErr) {
      console.warn('[OdooSync] Could not write FALLBACK_POLL_COMPLETE to outbox:', outboxErr.message);
    }

    return {
      synced,
      skipped,
      synced_dos:  syncedDos,
      skipped_dos: skippedDos,
    };
  } catch (err) {
    console.error('[OdooSync] Sync failed:', err.message);
    return { synced: 0, skipped: 0, synced_dos: [], skipped_dos: [], error: err.message };
  }
}

module.exports = { syncOrdersFromOdoo };
