// server/services/serviceTime.js
//
// Each order's service time for the scheduling engine (decided 2026-11-21):
//
//   base delivery (once per order with lines)
//   + install x qty per line
//   + dismantle x qty, only on lines with dismantle_required
//
// Install per unit, first that is set: the order line's custom install time
// (midpoint of min/max), the product's own install time (Information > Item),
// the item type's install time, else the fallback install time.
// Dismantle per unit, first that is set: the line's dismantle_time (midpoint),
// the product's own, the type's, else 0.
// The item type decides whether installation counts, whatever service_type
// the line carries (Odoo ingest always sends 'delivery').
// Inactive types still apply to products already assigned to them.
//
// Not called by any engine yet: the new scheduler will call serviceMinutes().

const prisma = require('../prismaClient');

const itemKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 255);
const lineName = line => line.products?.product_name || line.odoo_product_name || null;

function midpoint(min, max) {
  const lo = Number.isFinite(min) ? Number(min) : null;
  const hi = Number.isFinite(max) ? Number(max) : null;
  if (lo !== null && hi !== null) return (lo + hi) / 2;
  return lo ?? hi;
}

/**
 * Pure calculation. No database access.
 * @param {Array<{line: object, itemType: object|null, product?: object}>} lines
 *   order_products rows with their item type (null = unclassified) and their
 *   item_point_rates row (`product`, for the product's own times)
 * @param {{base_delivery_minutes:number, fallback_install_minutes:number}} settings
 */
function computeServiceMinutes(lines = [], settings = {}) {
  const fallback = Number(settings.fallback_install_minutes) || 0;
  let installMinutes = 0;
  let dismantleMinutes = 0;
  let requiresInstaller = false;
  const breakdown = [];

  for (const { line = {}, itemType = null, product = null } of lines) {
    const qty = Math.max(1, Number(line.quantity) || 1);
    const perUnit = midpoint(line.custom_installation_time_min, line.custom_installation_time_max)
      ?? product?.install_minutes ?? itemType?.install_minutes ?? null;
    const usedFallback = perUnit === null;
    const install = (perUnit ?? fallback) * qty;

    let dismantle = 0;
    if (line.dismantle_required) {
      dismantle = (midpoint(line.dismantle_time_min, line.dismantle_time_max)
        ?? product?.dismantle_minutes ?? itemType?.dismantle_minutes ?? 0) * qty;
    }

    installMinutes += install;
    dismantleMinutes += dismantle;
    if (itemType?.requires_installer) requiresInstaller = true;
    breakdown.push({
      order_product_id: line.id ?? null,
      product_name: lineName(line),
      item_type_id: itemType?.id ?? null,
      classified: !!itemType,
      quantity: qty,
      install_minutes: install,
      dismantle_minutes: dismantle,
      used_fallback: usedFallback,
    });
  }

  const deliveryMinutes = lines.length ? Number(settings.base_delivery_minutes) || 0 : 0;
  return {
    totalMinutes: deliveryMinutes + installMinutes + dismantleMinutes,
    deliveryMinutes,
    installMinutes,
    dismantleMinutes,
    requiresInstaller,
    unclassifiedLines: breakdown.filter(b => !b.classified).length,
    lines: breakdown,
  };
}

/**
 * Service time for one order.
 * @param {object} order  orders row with `order_products` (and optional `products` on each line)
 * @param {object} [opts]
 * @param {object} [opts.settings]  scheduler settings (base_delivery_minutes, fallback_install_minutes); read when omitted
 * @param {object} [opts.db]
 */
async function serviceMinutes(order, { settings, db = prisma } = {}) {
  const lines = Array.isArray(order?.order_products) ? order.order_products : [];
  const resolvedSettings = settings ?? await require('./schedulerSettings').getSchedulerSettings();
  const keys = [...new Set(lines.map(line => itemKey(lineName(line))).filter(Boolean))];
  const rows = keys.length
    ? await db.item_point_rates.findMany({ where: { item_key: { in: keys } }, include: { item_type: true } })
    : [];
  const rowByKey = new Map(rows.map(row => [row.item_key, row]));
  return computeServiceMinutes(
    lines.map(line => {
      const product = rowByKey.get(itemKey(lineName(line))) ?? null;
      return { line, product, itemType: product?.item_type ?? null };
    }),
    resolvedSettings,
  );
}

module.exports = { computeServiceMinutes, serviceMinutes };
