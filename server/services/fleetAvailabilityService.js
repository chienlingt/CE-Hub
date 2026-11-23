// server/services/fleetAvailabilityService.js
//
// Database side of B.4 Fleet Availability: trucks, teams (with their staff),
// block-off rows and the bookings they can affect. Matching rules live in
// fleetAvailabilitySpec.js; this file only loads and shapes data.

const prisma = require('../prismaClient');
const spec = require('./fleetAvailabilitySpec');

// Orders in these states are finished, so a block-off no longer affects them.
const CLOSED_ORDER = /^(delivered|completed|cancelled|canceled)$/i;
const CLOSED_SLOT = ['completed', 'cancelled'];
const CLOSED_INSTALL = /^(completed|cancelled|canceled)$/i;
// How far ahead affected bookings are looked for (Exceptions tab and badge).
const AFFECTED_HORIZON_DAYS = 120;

const personName = e => e?.name || e?.display_name || null;

async function loadTrucks(db = prisma) {
  const rows = await db.trucks.findMany({ select: { id: true, plate_no: true, tone: true }, orderBy: { plate_no: 'asc' } });
  return rows.map(t => ({
    id: t.id,
    plate_no: t.plate_no || `Truck ${t.id.slice(0, 6)}`,
    tone: Number.isInteger(t.tone) ? t.tone : null,
    tone_key: spec.toneKey(t.tone),
  }));
}

/**
 * Teams with their staff. Delivery teams list the Primary Driver and Assistant
 * first; anyone else assigned to the team follows. Team name = team_type, as
 * on Information > Team.
 */
async function loadTeams(db = prisma) {
  const rows = await db.teams.findMany({
    include: {
      primary_driver: { select: { id: true, name: true, display_name: true } },
      assistant_driver: { select: { id: true, name: true, display_name: true } },
      truck: { select: { id: true, plate_no: true } },
      assignments: { include: { employee: { select: { id: true, name: true, display_name: true, active_flag: true } } } },
    },
    orderBy: { team_type: 'asc' },
  });
  return rows.map(t => {
    const kind = spec.teamKind(t.team_type);
    const members = [];
    const seen = new Set();
    const add = (employee, role) => {
      const name = personName(employee);
      if (!employee || !name || seen.has(employee.id)) return;
      seen.add(employee.id);
      members.push({ id: employee.id, name, role });
    };
    add(t.primary_driver, 'Driver');
    add(t.assistant_driver, 'Assistant');
    for (const a of t.assignments ?? []) {
      if (a.employee?.active_flag === false) continue;
      add(a.employee, kind === 'installer' ? 'Installer' : 'Member');
    }
    return {
      id: t.id,
      name: t.team_type || `Team ${t.id.slice(0, 6)}`,
      kind,
      available_flag: t.available_flag !== false,
      truck: t.truck ? { id: t.truck.id, plate_no: t.truck.plate_no } : null,
      members,
    };
  });
}

/** Rows overlapping from..to (either may be omitted). */
async function loadRows(db = prisma, { from, to } = {}) {
  const where = {};
  if (to) where.start_date = { lte: new Date(`${to}T00:00:00Z`) };
  if (from) where.end_date = { gte: new Date(`${from}T00:00:00Z`) };
  return db.resource_blockoffs.findMany({ where, orderBy: [{ start_date: 'asc' }, { created_at: 'asc' }] });
}

/**
 * Open deliveries (orders on a time slot) and installations between from and to,
 * each as { kind, order_id, order_ref, date, session, truck_id, team_id, area }.
 */
async function loadBookings(db = prisma, { from, to }) {
  const slots = await db.time_slots.findMany({
    where: {
      date: { gte: from, lte: to },
      OR: [{ slot_status: null }, { slot_status: { notIn: CLOSED_SLOT } }],
    },
    select: {
      id: true, date: true, time_window_start: true, truck_id: true, delivery_team_id: true,
      orders: { select: { id: true, odoo_order_ref: true, order_status: true, delivery_city: true } },
    },
  });
  const bookings = [];
  for (const slot of slots) {
    const when = spec.slotDateSession(slot);
    if (!when) continue;
    for (const order of slot.orders ?? []) {
      if (CLOSED_ORDER.test(order.order_status ?? '')) continue;
      bookings.push({
        kind: 'delivery', order_id: order.id, order_ref: order.odoo_order_ref || order.id.slice(0, 8),
        date: when.date, session: when.session, slot_id: slot.id,
        truck_id: slot.truck_id ?? null, team_id: slot.delivery_team_id ?? null, area: order.delivery_city ?? null,
      });
    }
  }

  const installs = await db.installation_schedules.findMany({
    where: {
      installation_team_id: { not: null },
      estimated_arrival_time: { gte: new Date(`${from}T00:00:00+08:00`), lte: new Date(`${to}T23:59:59+08:00`) },
    },
    select: {
      id: true, status: true, estimated_arrival_time: true, installation_team_id: true,
      orders: { select: { id: true, odoo_order_ref: true, order_status: true, delivery_city: true } },
    },
  });
  for (const s of installs) {
    if (CLOSED_INSTALL.test(s.status ?? '') || CLOSED_ORDER.test(s.orders?.order_status ?? '')) continue;
    const when = spec.klDateSession(s.estimated_arrival_time);
    if (!when) continue;
    bookings.push({
      kind: 'installation', order_id: s.orders?.id ?? null, order_ref: s.orders?.odoo_order_ref || (s.orders?.id ?? s.id).slice(0, 8),
      date: when.date, session: when.session, installation_id: s.id,
      truck_id: null, team_id: s.installation_team_id, area: s.orders?.delivery_city ?? null,
    });
  }
  return bookings.sort((a, b) => (a.date + a.session < b.date + b.session ? -1 : 1));
}

/**
 * Ids a validated group names that do not exist. Truck types must match a
 * tonnage some truck has today.
 * @returns {Record<string,string>} errors, empty when all exist
 */
async function checkTargets(db = prisma, value) {
  const errors = {};
  if (value.fleet) return errors;
  if (value.trucks.length) {
    const found = await db.trucks.findMany({ where: { id: { in: value.trucks } }, select: { id: true } });
    if (found.length !== value.trucks.length) errors.trucks = 'one or more trucks no longer exist';
  }
  if (value.teams.length) {
    const found = await db.teams.findMany({ where: { id: { in: value.teams } }, select: { id: true } });
    if (found.length !== value.teams.length) errors.teams = 'one or more teams no longer exist';
  }
  if (value.employees?.length) {
    const found = await db.employees.findMany({ where: { id: { in: value.employees } }, select: { id: true } });
    if (found.length !== value.employees.length) errors.employees = 'one or more staff no longer exist';
  }
  if (value.truck_types.length) {
    const tones = new Set((await db.trucks.findMany({ select: { tone: true } })).map(t => spec.toneKey(t.tone)));
    const missing = value.truck_types.filter(t => !tones.has(t));
    if (missing.length) errors.truck_types = `no truck has tonnage ${missing.join(', ')}`;
  }
  return errors;
}

const bookingKey = b => [b.kind, b.order_id, b.slot_id ?? b.installation_id, b.date, b.session].join('|');

/**
 * Bookings a group of rows would newly affect, for the impact check before
 * saving. Other block-offs in the range count too, because staff rows combine:
 * a second installer's MC can be what takes the whole team out.
 */
async function previewAffected(db = prisma, rows, { from, to }) {
  const groupId = rows[0]?.group_id;
  const [trucks, teams, bookings, existing] = await Promise.all([
    loadTrucks(db), loadTeams(db), loadBookings(db, { from, to }), loadRows(db, { from, to }),
  ]);
  const others = existing.filter(r => r.group_id !== groupId);
  const before = new Set(spec.affectedBookings(bookings, trucks, others, teams).map(({ booking }) => bookingKey(booking)));
  return spec.affectedBookings(bookings, trucks, [...others, ...rows], teams)
    .map(({ booking }) => booking)
    .filter(b => !before.has(bookingKey(b)));
}

/**
 * Open bookings from today that sit on a blocked truck or team: the Exceptions
 * › Fleet Blocked list. Each carries the block-off row that blocks it.
 */
async function findAffected(db = prisma, now = new Date()) {
  const today = spec.klToday(now);
  const rows = await loadRows(db, { from: today });
  if (!rows.length) return [];
  const lastEnd = rows.reduce((m, r) => { const e = spec.toDateKey(r.end_date); return e > m ? e : m; }, today);
  const to = lastEnd < spec.addDays(today, AFFECTED_HORIZON_DAYS) ? lastEnd : spec.addDays(today, AFFECTED_HORIZON_DAYS);
  const [trucks, teams, bookings] = await Promise.all([loadTrucks(db), loadTeams(db), loadBookings(db, { from: today, to })]);
  return spec.affectedBookings(bookings, trucks, rows, teams).map(({ booking, row }) => ({ ...booking, blocked_by: spec.rowToApi(row) }));
}

/** Distinct orders on the Fleet Blocked list, for the Exceptions badge. */
async function countFleetBlocked(db = prisma, now = new Date()) {
  const affected = await findAffected(db, now);
  return new Set(affected.map(a => a.order_id ?? a.installation_id ?? a.slot_id)).size;
}

module.exports = {
  loadTrucks,
  loadTeams,
  loadRows,
  loadBookings,
  checkTargets,
  previewAffected,
  findAffected,
  countFleetBlocked,
};
