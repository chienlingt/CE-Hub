// server/services/incentiveService.js
//
// FR-10 Employee Performance and Incentives — point calculation and awarding.
//
//   item points  = delivered_quantity x points per item
//                  (rate listed for the item name; an item seen on an order
//                  but not yet listed is added at 0 points for admin review;
//                  the product override / rule default only back up lines
//                  that have no item name)
//   order points = sum of item points (no per-order bonus)
//   manual points live in order_point_adjustments, apply to the whole order and
//   are added on top at read time (never written into the snapshot).
//
// Every crew member (driver, assistant, installer) gets the full order points.
// The snapshot is written once, when the order completes, using the rule in
// force at that moment, so later rule changes never rewrite history.

const prisma = require('../prismaClient');

const COMPLETED_STATUSES = ['delivered', 'completed'];

const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Rates are keyed by item name: Odoo lines carry a name but no products row.
const itemKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 255);
const itemLabel = name => String(name || '').trim().replace(/\s+/g, ' ').slice(0, 255);
const lineName = item => item.products?.product_name || item.odoo_product_name || null;

// Delivered units for a line. Mirrors odooPayloadBuilder.resolveDeliveredQty:
// prefer the real column, fall back to the delivered/failed line status.
function deliveredUnits(item) {
  if (item.delivered_quantity != null) return Math.max(0, item.delivered_quantity);
  if (item.item_delivery_status === 'delivered') return Math.max(0, item.quantity || 0);
  return 0;
}

/**
 * Pure calculation for one order. No database access.
 * @param {Array}  items  order_products rows (with optional `products`)
 * @param {object} rule   { points_per_item } (only backs up lines with no item name)
 * @param {Map<string, number>} [rates] item_key -> points per item (Information > Item)
 * @returns {{ item_points:number, bonus_points:number, item_breakdown:Array }}
 */
function computeOrderPoints(items, rule, rates = new Map()) {
  const breakdown = (items || []).map(item => {
    const delivered = deliveredUnits(item);
    const perItem = rates.get(itemKey(lineName(item))) ?? item.products?.points_per_item ?? rule.points_per_item;
    return {
      order_product_id: item.id,
      product_name: lineName(item),
      quantity: item.quantity ?? 0,
      delivered_quantity: delivered,
      points_per_item: perItem,
      points: round2(delivered * perItem),
    };
  });
  const itemPoints = round2(breakdown.reduce((sum, line) => sum + line.points, 0));
  return {
    item_points: itemPoints,
    bonus_points: 0, // kept in the awards table for old rows; no longer awarded
    item_breakdown: breakdown,
  };
}

/**
 * Crew who earn points on an order, as [{ employee_id, role }], de-duplicated.
 * Driver/assistant: the lorry trip, falling back to the truck defaults.
 * Installers: members of the installation team. orders.employee_id is kept as a
 * driver fallback so orders without trip data still earn for someone.
 */
function resolveCrew(order) {
  const crew = new Map();
  const add = (employeeId, role) => { if (employeeId && !crew.has(employeeId)) crew.set(employeeId, role); };
  const slot = order.time_slots;
  const trip = slot?.lorry_trip;
  add(trip?.driver_id || slot?.truck?.driver_id, 'driver');
  add(trip?.assistant_id || slot?.truck?.assistant_id, 'assistant');
  for (const member of order.installation_schedules?.team?.assignments || []) {
    add(member.employee_id, 'installer');
  }
  if (!crew.size) add(order.employee_id, 'driver');
  return [...crew].map(([employee_id, role]) => ({ employee_id, role }));
}

/**
 * Rates for these item names (Map item_key -> points). Names not listed yet are
 * added at 0 points and flagged needs_review, so every item seen on an order
 * shows up in Information > Item for an admin to price. Safe to call
 * concurrently: the unique key makes a duplicate insert a no-op.
 */
async function ensureItemRates(names, db = prisma) {
  const wanted = new Map();
  for (const name of names) {
    const key = itemKey(name);
    if (key && !wanted.has(key)) wanted.set(key, itemLabel(name));
  }
  if (!wanted.size) return new Map();
  const find = () => db.item_point_rates.findMany({ where: { item_key: { in: [...wanted.keys()] } } });
  let rows = await find();
  const known = new Set(rows.map(row => row.item_key));
  const missing = [...wanted].filter(([key]) => !known.has(key))
    .map(([item_key, item_name]) => ({ item_key, item_name, points_per_item: 0, needs_review: true }));
  if (missing.length) {
    await db.item_point_rates.createMany({ data: missing, skipDuplicates: true });
    rows = await find();
  }
  return new Map(rows.map(row => [row.item_key, row.points_per_item]));
}

/**
 * Read-only counterpart of ensureItemRates: rates for these item names, with
 * unlisted names at 0 (what ensureItemRates would add). Never writes, so a
 * page view cannot create items.
 */
async function readItemRates(names, db = prisma) {
  const rates = new Map();
  for (const name of names) { const key = itemKey(name); if (key) rates.set(key, 0); }
  if (!rates.size) return rates;
  const rows = await db.item_point_rates.findMany({ where: { item_key: { in: [...rates.keys()] } } });
  rows.forEach(row => rates.set(row.item_key, row.points_per_item));
  return rates;
}

// The rule in force at `at`: newest active rule effective on or before it.
async function ruleInForce(db, at = new Date()) {
  return db.incentive_rules.findFirst({
    where: { active: true, effective_from: { lte: at } },
    orderBy: { effective_from: 'desc' },
  });
}

/**
 * Write the point snapshot for a completed order. Idempotent: an employee who
 * already has an award for the order is left untouched, so retries and the
 * backfill never double-count or rewrite a snapshot.
 *
 * @returns {Promise<{ awarded:number, reason?:string }>}
 */
async function awardOrder(orderId, db = prisma) {
  const order = await db.orders.findUnique({
    where: { id: orderId },
    include: {
      order_products: { include: { products: { select: { product_name: true, points_per_item: true } } } },
      time_slots: {
        include: {
          truck: { select: { driver_id: true, assistant_id: true } },
          lorry_trip: { select: { driver_id: true, assistant_id: true } },
        },
      },
      installation_schedules: { include: { team: { include: { assignments: { select: { employee_id: true } } } } } },
    },
  });
  if (!order) return { awarded: 0, reason: 'order_not_found' };
  if (!COMPLETED_STATUSES.includes(String(order.order_status || '').toLowerCase())) return { awarded: 0, reason: 'not_completed' };

  const completedAt = order.delivery_end_date_time || order.actual_arrival_date_time || new Date();
  const rule = await ruleInForce(db, completedAt) || await ruleInForce(db);
  if (!rule) return { awarded: 0, reason: 'no_rule' };

  const rates = await ensureItemRates(order.order_products.map(lineName), db);
  const points = computeOrderPoints(order.order_products, rule, rates);
  if (points.item_points === 0) return { awarded: 0, reason: 'nothing_delivered' };

  const crew = resolveCrew(order);
  if (!crew.length) return { awarded: 0, reason: 'no_crew' };

  const result = await db.order_point_awards.createMany({
    data: crew.map(member => ({
      order_id: order.id, employee_id: member.employee_id, role: member.role,
      item_points: points.item_points, bonus_points: points.bonus_points,
      item_breakdown: points.item_breakdown, rule_id: rule.id, awarded_at: completedAt,
    })),
    skipDuplicates: true,
  });
  return { awarded: result.count };
}

// Best-effort wrapper for delivery paths: points must never fail or delay a
// delivery. A missed award is recovered by the backfill script (idempotent).
async function awardOrderSafe(orderId, db = prisma) {
  try {
    return await awardOrder(orderId, db);
  } catch (error) {
    console.error('[Incentive] Points not awarded for order', orderId, '-', error.message);
    return { awarded: 0, reason: 'error' };
  }
}

module.exports = { awardOrderSafe, itemKey, lineName, ensureItemRates, readItemRates, computeOrderPoints, resolveCrew, awardOrder, ruleInForce, deliveredUnits, COMPLETED_STATUSES };
