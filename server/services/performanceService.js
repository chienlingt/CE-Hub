// server/services/performanceService.js
//
// FR-10 read side and admin writes: ranked performance, per-employee order
// drill-down, per-order points, incentive rules and manual point adjustments.
//
// Points come from the order_point_awards snapshot (see incentiveService.js).
// Manual adjustments apply to the whole order, so every crew member on the order
// receives them in full. RM = total points x the rm_per_point of the rule in
// force now (it is a presentation rate, not part of the snapshot).

const prisma = require('../prismaClient');
const { ruleInForce, itemKey, ensureItemRates } = require('./incentiveService');

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
    bonus_points: award.bonus_points,
    manual_points: manual,
    total_points: round2(award.item_points + award.bonus_points + manual),
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
  const manual = await loadAdjustments([...new Set(awards.map(award => award.order_id))], db);
  const rule = await ruleInForce(db);
  const rmPerPoint = rule?.rm_per_point ?? 0;

  const byEmployee = new Map();
  for (const award of awards) {
    const points = orderPointsFor(award, manual.get(award.order_id));
    const row = byEmployee.get(award.employee_id) || {
      employee_id: award.employee_id, name: employeeName(award.employee), job_role: award.employee.role?.name || null,
      award_roles: new Set(), teams: (award.employee.teamAssignments || []).map(a => a.team?.team_type).filter(Boolean),
      completed_orders: 0, item_points: 0, bonus_points: 0, manual_points: 0, total_points: 0,
    };
    row.award_roles.add(award.role);
    row.completed_orders += 1;
    row.item_points = round2(row.item_points + points.item_points);
    row.bonus_points = round2(row.bonus_points + points.bonus_points);
    row.manual_points = round2(row.manual_points + points.manual_points);
    row.total_points = round2(row.total_points + points.total_points);
    byEmployee.set(award.employee_id, row);
  }
  const rows = rankRows([...byEmployee.values()].map(row => ({ ...row, award_roles: [...row.award_roles], incentive_rm: round2(row.total_points * rmPerPoint) })));
  return { rm_per_point: rmPerPoint, rows };
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
  const orderIds = awards.map(award => award.order_id);
  const adjustments = orderIds.length ? await db.order_point_adjustments.findMany({ where: { order_id: { in: orderIds } }, orderBy: { created_at: 'asc' } }) : [];
  const manual = adjustmentTotals(adjustments);
  const rule = await ruleInForce(db);
  const rmPerPoint = rule?.rm_per_point ?? 0;

  const orders = awards.map(award => ({
    order_id: award.order_id, do_ref: award.orders?.odoo_order_ref || null, so_ref: award.orders?.odoo_sales_ref || null,
    customer: award.orders?.customers?.full_name || null, completed_at: award.awarded_at, role: award.role,
    ...orderPointsFor(award, manual.get(award.order_id)),
    items: award.item_breakdown || [],
    adjustments: adjustments.filter(a => a.order_id === award.order_id).map(a => ({ id: a.id, points: a.points, reason: a.reason, created_at: a.created_at, reverses_id: a.reverses_id })),
  }));
  const sum = key => round2(orders.reduce((total, order) => total + order[key], 0));
  const summary = { completed_orders: orders.length, item_points: sum('item_points'), bonus_points: sum('bonus_points'), manual_points: sum('manual_points'), total_points: sum('total_points') };
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
    item_points: first?.item_points ?? 0, bonus_points: first?.bonus_points ?? 0,
    total_points: round2((first?.item_points ?? 0) + (first?.bonus_points ?? 0) + manual),
    crew: awards.map(award => ({ employee_id: award.employee_id, name: employeeName(award.employee), role: award.role, ...orderPointsFor(award, manual) })),
    adjustments: adjustments.map(a => ({ id: a.id, points: a.points, reason: a.reason, created_by: a.created_by, created_at: a.created_at, reverses_id: a.reverses_id })),
  };
}

// ── Manual adjustments (append-only) ────────────────────────────────────────

async function addAdjustment(orderId, { points, reason }, adminId, db = prisma) {
  if (!isUuid(orderId)) throw httpError(400, 'INVALID_ORDER', 'Invalid order id.');
  const value = Number(points);
  if (!Number.isFinite(value) || value === 0 || Math.abs(value) > MAX_ADJUSTMENT) throw httpError(400, 'INVALID_POINTS', `points must be a non-zero number up to ${MAX_ADJUSTMENT} either way.`);
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text || text.length > 500) throw httpError(400, 'REASON_REQUIRED', 'A reason (max 500 characters) is required.');
  const awarded = await db.order_point_awards.count({ where: { order_id: orderId } });
  if (!awarded) throw httpError(409, 'ORDER_HAS_NO_POINTS', 'This order has not earned points (not completed, or no crew), so there is no one to give extra points to.');
  return db.order_point_adjustments.create({ data: { order_id: orderId, points: round2(value), reason: text, created_by: adminId || null } });
}

async function reverseAdjustment(adjustmentId, adminId, db = prisma) {
  if (!isUuid(adjustmentId)) throw httpError(400, 'INVALID_ADJUSTMENT', 'Invalid adjustment id.');
  const original = await db.order_point_adjustments.findUnique({ where: { id: adjustmentId } });
  if (!original) throw httpError(404, 'ADJUSTMENT_NOT_FOUND', 'Adjustment not found.');
  if (original.reverses_id) throw httpError(409, 'CANNOT_REVERSE_A_REVERSAL', 'A reversal cannot be reversed. Add a new adjustment instead.');
  try {
    return await db.order_point_adjustments.create({ data: { order_id: original.order_id, points: round2(-original.points), reason: `Reversal: ${original.reason}`.slice(0, 500), created_by: adminId || null, reverses_id: original.id } });
  } catch (error) {
    if (error.code === 'P2002') throw httpError(409, 'ALREADY_REVERSED', 'This adjustment was already reversed.');
    throw error;
  }
}

// ── Rules ───────────────────────────────────────────────────────────────────

function ruleValues(input) {
  // Points per item now live on each item (Information > Item), not on the rule.
  const fields = { bonus_points_per_order: 'Bonus points per order', rm_per_point: 'RM per point' };
  const out = {};
  for (const [key, label] of Object.entries(fields)) {
    const value = Number(input?.[key]);
    if (input?.[key] === '' || input?.[key] == null || !Number.isFinite(value) || value < 0 || value > 100000) throw httpError(400, 'INVALID_RULE', `${label} must be a number from 0 to 100000.`);
    out[key] = round2(value);
  }
  out.points_per_item = 0;
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
  ROLES, resetItemSyncThrottle: () => { lastItemSync = 0; }, parseRange, adjustmentTotals, orderPointsFor, rankRows,
  getRanking, getEmployeePerformance, getOrderPoints,
  addAdjustment, reverseAdjustment, getRules, createRule, listItemRates, countPendingItems, createItem, updateItem, deleteItem,
};
