// server/services/performanceService.js
//
// FR-10 read side and admin writes: ranked performance, per-employee order
// drill-down, per-order points, the RM rate and the extra points an admin sets on an order.
//
// Points come from the order_point_awards snapshot (see incentiveService.js).
// Extra points apply to the whole order, so every crew member on the order
// receives them in full. RM = total points x the rm_per_point of the rule in
// force now (it is a presentation rate, not part of the snapshot).

const prisma = require('../prismaClient');
const {
  ruleInForce, itemKey, ensureItemRates, readItemRates, lineName, computeOrderPoints, resolveCrew, awardOrder, COMPLETED_STATUSES,
} = require('./incentiveService');

const ROLES = ['driver', 'assistant', 'installer'];
const MAX_ADJUSTMENT = 10000;
const DAY = 86400000;

const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** from/to are inclusive YYYY-MM-DD calendar days in Malaysia time. */
function parseRange({ from, to } = {}) {
  if ((from && !validDate(from)) || (to && !validDate(to))) throw httpError(400, 'INVALID_RANGE', 'from and to must be YYYY-MM-DD dates.');
  if (from && to && from > to) throw httpError(400, 'INVALID_RANGE', 'from must not be after to.');
  const range = {};
  if (from) range.gte = new Date(`${from}T00:00:00+08:00`);
  if (to) range.lt = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + DAY);
  return Object.keys(range).length ? range : null;
}

const employeeName = employee => employee?.name || employee?.display_name || employee?.email || 'Unknown';

// ── Pure helpers (unit tested) ───────────────────────────────────────────────

/** Sum adjustment points per order. */
function adjustmentTotals(adjustments) {
  const totals = new Map();
  for (const adjustment of adjustments) totals.set(adjustment.order_id, round2((totals.get(adjustment.order_id) || 0) + adjustment.points));
  return totals;
}

/** One award as reported to a client: order points = snapshot + manual points. */
function orderPointsFor(award, manualPoints) {
  const manual = manualPoints || 0;
  return {
    item_points: award.item_points,
    manual_points: manual,
    total_points: round2(award.item_points + manual),
  };
}

/** Standard competition ranking: ties share a rank, the next rank is skipped. */
function rankRows(rows) {
  const sorted = [...rows].sort((a, b) => b.total_points - a.total_points || a.name.localeCompare(b.name));
  let previous = null, rank = 0;
  return sorted.map((row, index) => {
    if (previous === null || row.total_points !== previous) rank = index + 1;
    previous = row.total_points;
    return { ...row, rank };
  });
}

// ── Ranking and drill-down ──────────────────────────────────────────────────

async function loadAdjustments(orderIds, db = prisma) {
  if (!orderIds.length) return new Map();
  return adjustmentTotals(await db.order_point_adjustments.findMany({ where: { order_id: { in: orderIds } } }));
}

// ── Completed deliveries without saved points ────────────────────────────────
// Points are saved when an order completes. Orders completed before that existed
// (or whose award failed) have no saved points, so they would not show up at all.
// They are read from the delivered orders and priced live with the current item
// points, flagged `estimated`. Nothing is written; the backfill saves them.

const ESTIMATE_LIMIT = 500;
const crewInclude = {
  order_products: { include: { products: { select: { product_name: true, points_per_item: true } } } },
  time_slots: { include: { truck: { select: { driver_id: true, assistant_id: true } }, lorry_trip: { select: { driver_id: true, assistant_id: true } } } },
  installation_schedules: { include: { team: { include: { assignments: { select: { employee_id: true } } } } } },
  customers: { select: { full_name: true } },
};
const memberSelect = { id: true, name: true, display_name: true, email: true, role: { select: { name: true } }, teamAssignments: { select: { team: { select: { id: true, team_type: true } } } } };

// Rule in force when the order completed (newest effective on or before it), else the newest.
const ruleAt = (rules, at) => rules.find(rule => rule.effective_from <= at) || rules[0] || null;

/** Award-shaped rows (estimated: true) for delivered orders that have no saved points. */
async function estimateUnawarded({ range, employeeId } = {}, db = prisma) {
  const statuses = COMPLETED_STATUSES.flatMap(status => [status, status[0].toUpperCase() + status.slice(1)]);
  const orders = await db.orders.findMany({
    where: { order_status: { in: statuses }, order_point_awards: { none: {} }, ...(range && { delivery_end_date_time: range }) },
    include: crewInclude, orderBy: { delivery_end_date_time: 'desc' }, take: ESTIMATE_LIMIT,
  });
  if (!orders.length) return [];
  const [rates, rules] = await Promise.all([
    readItemRates(orders.flatMap(order => order.order_products.map(lineName)), db),
    db.incentive_rules.findMany({ where: { active: true }, orderBy: { effective_from: 'desc' } }),
  ]);
  const found = [];
  for (const order of orders) {
    const completedAt = order.delivery_end_date_time || order.actual_arrival_date_time || order.updated_at || new Date();
    const rule = ruleAt(rules, completedAt);
    if (!rule) continue;
    const points = computeOrderPoints(order.order_products, rule, rates);
    if (points.item_points === 0) continue; // same as awardOrder: nothing delivered
    for (const member of resolveCrew(order)) {
      if (employeeId && member.employee_id !== employeeId) continue;
      found.push({
        order_id: order.id, employee_id: member.employee_id, role: member.role, estimated: true,
        item_points: points.item_points, item_breakdown: points.item_breakdown, awarded_at: completedAt,
        orders: { odoo_order_ref: order.odoo_order_ref, odoo_sales_ref: order.odoo_sales_ref, delivery_end_date_time: order.delivery_end_date_time, customers: order.customers },
      });
    }
  }
  const ids = [...new Set(found.map(award => award.employee_id))];
  const people = ids.length ? await db.employees.findMany({ where: { id: { in: ids } }, select: memberSelect }) : [];
  const byId = new Map(people.map(person => [person.id, person]));
  return found.filter(award => byId.has(award.employee_id)).map(award => ({ ...award, employee: byId.get(award.employee_id) }));
}

/**
 * Ranked performance, one row per employee with at least one award in range.
 * @param {{ from?:string, to?:string, team?:string, role?:string }} filters
 */
async function getRanking(filters = {}, db = prisma) {
  const range = parseRange(filters);
  if (filters.role && !ROLES.includes(filters.role)) throw httpError(400, 'INVALID_ROLE', `role must be one of ${ROLES.join(', ')}.`);
  if (filters.team && !isUuid(filters.team)) throw httpError(400, 'INVALID_TEAM', 'team must be a team id.');

  const awards = await db.order_point_awards.findMany({
    where: {
      ...(range && { awarded_at: range }),
      ...(filters.role && { role: filters.role }),
      ...(filters.team && { employee: { teamAssignments: { some: { team_id: filters.team } } } }),
    },
    include: { employee: { select: { id: true, name: true, display_name: true, email: true, role: { select: { name: true } }, teamAssignments: { select: { team: { select: { id: true, team_type: true } } } } } } },
  });
  const estimated = (await estimateUnawarded({ range }, db)).filter(award =>
    (!filters.role || award.role === filters.role)
    && (!filters.team || award.employee.teamAssignments.some(assignment => assignment.team?.id === filters.team)));
  const manual = await loadAdjustments([...new Set(awards.map(award => award.order_id))], db);
  const rule = await ruleInForce(db);
  const rmPerPoint = rule?.rm_per_point ?? 0;

  const byEmployee = new Map();
  for (const award of [...awards, ...estimated]) {
    const points = orderPointsFor(award, manual.get(award.order_id));
    const row = byEmployee.get(award.employee_id) || {
      employee_id: award.employee_id, name: employeeName(award.employee), job_role: award.employee.role?.name || null,
      award_roles: new Set(), teams: (award.employee.teamAssignments || []).map(a => a.team?.team_type).filter(Boolean),
      completed_orders: 0, estimated_orders: 0, item_points: 0, manual_points: 0, total_points: 0,
    };
    row.award_roles.add(award.role);
    row.completed_orders += 1;
    if (award.estimated) row.estimated_orders += 1;
    row.item_points = round2(row.item_points + points.item_points);
    row.manual_points = round2(row.manual_points + points.manual_points);
    row.total_points = round2(row.total_points + points.total_points);
    byEmployee.set(award.employee_id, row);
  }
  const rows = rankRows([...byEmployee.values()].map(row => ({ ...row, award_roles: [...row.award_roles], incentive_rm: round2(row.total_points * rmPerPoint) })));
  return { rm_per_point: rmPerPoint, estimated_orders: new Set(estimated.map(award => award.order_id)).size, rows };
}

/** Completed orders and points for one employee, with per-item points. */
async function getEmployeePerformance(employeeId, filters = {}, db = prisma) {
  if (!isUuid(employeeId)) throw httpError(400, 'INVALID_EMPLOYEE', 'Invalid employee id.');
  const range = parseRange(filters);
  const employee = await db.employees.findUnique({ where: { id: employeeId }, select: { id: true, name: true, display_name: true, email: true, role: { select: { name: true } } } });
  if (!employee) throw httpError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');

  const awards = await db.order_point_awards.findMany({
    where: { employee_id: employeeId, ...(range && { awarded_at: range }) },
    include: { orders: { select: { odoo_order_ref: true, odoo_sales_ref: true, delivery_end_date_time: true, customers: { select: { full_name: true } } } } },
    orderBy: { awarded_at: 'desc' },
  });
  const estimated = await estimateUnawarded({ range, employeeId }, db);
  const orderIds = awards.map(award => award.order_id);
  const adjustments = orderIds.length ? await db.order_point_adjustments.findMany({ where: { order_id: { in: orderIds } }, orderBy: { created_at: 'asc' } }) : [];
  const manual = adjustmentTotals(adjustments);
  const rule = await ruleInForce(db);
  const rmPerPoint = rule?.rm_per_point ?? 0;

  const orders = [...awards, ...estimated].sort((a, b) => new Date(b.awarded_at) - new Date(a.awarded_at)).map(award => ({
    estimated: !!award.estimated,
    order_id: award.order_id, do_ref: award.orders?.odoo_order_ref || null, so_ref: award.orders?.odoo_sales_ref || null,
    customer: award.orders?.customers?.full_name || null, completed_at: award.awarded_at, role: award.role,
    ...orderPointsFor(award, manual.get(award.order_id)),
    items: award.item_breakdown || [],
    adjustments: adjustments.filter(a => a.order_id === award.order_id).map(a => ({ id: a.id, points: a.points, reason: a.reason, created_at: a.created_at, reverses_id: a.reverses_id })),
  }));
  const sum = key => round2(orders.reduce((total, order) => total + order[key], 0));
  const summary = { completed_orders: orders.length, estimated_orders: estimated.length, item_points: sum('item_points'), manual_points: sum('manual_points'), total_points: sum('total_points') };
  return {
    employee: { id: employee.id, name: employeeName(employee), job_role: employee.role?.name || null },
    rm_per_point: rmPerPoint, summary: { ...summary, incentive_rm: round2(summary.total_points * rmPerPoint) }, orders,
  };
}

/** Points on one order: each crew award plus the manual adjustments. */
async function getOrderPoints(orderId, db = prisma) {
  if (!isUuid(orderId)) throw httpError(400, 'INVALID_ORDER', 'Invalid order id.');
  const [awards, adjustments] = await Promise.all([
    db.order_point_awards.findMany({ where: { order_id: orderId }, include: { employee: { select: { name: true, display_name: true, email: true } } } }),
    db.order_point_adjustments.findMany({ where: { order_id: orderId }, orderBy: { created_at: 'asc' } }),
  ]);
  const manual = adjustmentTotals(adjustments).get(orderId) || 0;
  const first = awards[0];
  return {
    order_id: orderId, manual_points: manual, items: first?.item_breakdown || [],
    item_points: first?.item_points ?? 0,
    total_points: round2((first?.item_points ?? 0) + manual),
    crew: awards.map(award => ({ employee_id: award.employee_id, name: employeeName(award.employee), role: award.role, ...orderPointsFor(award, manual) })),
    adjustments: adjustments.map(a => ({ id: a.id, points: a.points, reason: a.reason, created_by: a.created_by, created_at: a.created_at, reverses_id: a.reverses_id })),
  };
}

// ── Extra points (set per order, history kept) ──────────────────────────────

/**
 * Set the extra points of one order to an exact value (0 clears them). Every
 * crew member on the order gets them. The change is stored as an append-only
 * adjustment for the difference, so the history of edits is kept.
 *
 * An order that has no saved points yet (delivered before points existed) has
 * its points saved first, using the current item points, so there is a snapshot
 * to add the extra to.
 */
async function setExtraPoints(orderId, points, adminId, db = prisma) {
  if (!isUuid(orderId)) throw httpError(400, 'INVALID_ORDER', 'Invalid order id.');
  const value = Number(points);
  if (points === '' || points == null || !Number.isFinite(value) || Math.abs(value) > MAX_ADJUSTMENT) throw httpError(400, 'INVALID_POINTS', `Extra points must be a number from -${MAX_ADJUSTMENT} to ${MAX_ADJUSTMENT}.`);

  let awarded = await db.order_point_awards.count({ where: { order_id: orderId } });
  if (!awarded) {
    await awardOrder(orderId, db);
    awarded = await db.order_point_awards.count({ where: { order_id: orderId } });
  }
  if (!awarded) throw httpError(409, 'ORDER_HAS_NO_POINTS', 'This order has not earned points (not delivered, or no crew), so it cannot have extra points.');

  const current = adjustmentTotals(await db.order_point_adjustments.findMany({ where: { order_id: orderId } })).get(orderId) || 0;
  const target = round2(value);
  const delta = round2(target - current);
  if (delta !== 0) {
    await db.order_point_adjustments.create({ data: { order_id: orderId, points: delta, reason: `Extra points set to ${target} (was ${current})`, created_by: adminId || null } });
  }
  return { order_id: orderId, manual_points: target };
}

// ── Rules ───────────────────────────────────────────────────────────────────

function ruleValues(input) {
  // Points per item live on each item (Information > Item) and there is no per-order
  // bonus, so the rule only carries the RM rate. The other columns stay at 0.
  const fields = { rm_per_point: 'RM per point' };
  const out = {};
  for (const [key, label] of Object.entries(fields)) {
    const value = Number(input?.[key]);
    if (input?.[key] === '' || input?.[key] == null || !Number.isFinite(value) || value < 0 || value > 100000) throw httpError(400, 'INVALID_RULE', `${label} must be a number from 0 to 100000.`);
    out[key] = round2(value);
  }
  out.points_per_item = 0;
  out.bonus_points_per_order = 0;
  return out;
}

async function getRules(db = prisma) {
  const history = await db.incentive_rules.findMany({ orderBy: { effective_from: 'desc' }, take: 25 });
  return { current: await ruleInForce(db), history };
}

/** A change inserts a new rule effective now; old awards keep the rule they used. */
async function createRule(input, adminId, db = prisma) {
  return db.incentive_rules.create({ data: { ...ruleValues(input), created_by: adminId || null, effective_from: new Date(), active: true } });
}

// ── Items (Information > Item): item name -> points per item.
// The list fills itself from order lines: a new item starts at 0 points and is
// flagged needs_review until an admin saves it. Deleting an item removes the
// row; if the item is still on an order it comes back at 0 for review. Earned
// points never change.

function itemInput(input) {
  const name = typeof input?.item_name === 'string' ? input.item_name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 255) throw httpError(400, 'INVALID_ITEM', 'Item name is required (max 255 characters).');
  const raw = input?.points_per_item;
  const points = Number(raw);
  if (raw === '' || raw == null || !Number.isFinite(points) || points < 0 || points > 100000) throw httpError(400, 'INVALID_POINTS', 'Point per item must be a number from 0 to 100000.');
  return { item_name: name, item_key: itemKey(name), points_per_item: round2(points) };
}

const itemRow = row => ({ id: row.id, item_name: row.item_name, points_per_item: row.points_per_item, needs_review: !!row.needs_review });

async function listItemRates(db = prisma) {
  // Pick up items from order lines first, so new ones appear for review.
  const lines = await db.order_products.groupBy({ by: ['odoo_product_name'], where: { odoo_product_name: { not: null } } });
  await ensureItemRates(lines.map(line => line.odoo_product_name), db);
  const rows = await db.item_point_rates.findMany({ orderBy: { item_name: 'asc' } });
  return { pending_review: rows.filter(row => row.needs_review).length, items: rows.map(itemRow) };
}

// Header badge: how many items still need an admin to set points. New items are
// picked up from order lines here too, but at most once a minute, so a busy
// header poll never rescans order_products.
const PENDING_SYNC_MS = 60000;
let lastItemSync = 0;

async function countPendingItems(db = prisma, now = Date.now()) {
  if (now - lastItemSync >= PENDING_SYNC_MS) {
    lastItemSync = now;
    try {
      const lines = await db.order_products.groupBy({ by: ['odoo_product_name'], where: { odoo_product_name: { not: null } } });
      await ensureItemRates(lines.map(line => line.odoo_product_name), db);
    } catch (error) {
      lastItemSync = 0; // retry on the next poll
      throw error;
    }
  }
  return { pending_review: await db.item_point_rates.count({ where: { needs_review: true } }) };
}

function duplicateItem(error) {
  return error.code === 'P2002' ? httpError(409, 'ITEM_EXISTS', 'An item with this name already exists.') : error;
}

async function createItem(input, adminId, db = prisma) {
  const data = itemInput(input);
  try {
    return itemRow(await db.item_point_rates.create({ data: { ...data, needs_review: false, updated_by: adminId || null } }));
  } catch (error) {
    throw duplicateItem(error);
  }
}

async function updateItem(id, input, adminId, db = prisma) {
  if (!isUuid(id)) throw httpError(400, 'INVALID_ITEM', 'Invalid item id.');
  const data = itemInput(input);
  try {
    return itemRow(await db.item_point_rates.update({ where: { id }, data: { ...data, needs_review: false, updated_by: adminId || null } }));
  } catch (error) {
    if (error.code === 'P2025') throw httpError(404, 'ITEM_NOT_FOUND', 'Item not found.');
    throw duplicateItem(error);
  }
}

async function deleteItem(id, db = prisma) {
  if (!isUuid(id)) throw httpError(400, 'INVALID_ITEM', 'Invalid item id.');
  const result = await db.item_point_rates.deleteMany({ where: { id } });
  if (!result.count) throw httpError(404, 'ITEM_NOT_FOUND', 'Item not found.');
  return { deleted: true };
}

module.exports = {
  ROLES, estimateUnawarded, resetItemSyncThrottle: () => { lastItemSync = 0; }, parseRange, adjustmentTotals, orderPointsFor, rankRows,
  getRanking, getEmployeePerformance, getOrderPoints,
  setExtraPoints, getRules, createRule, listItemRates, countPendingItems, createItem, updateItem, deleteItem,
};
