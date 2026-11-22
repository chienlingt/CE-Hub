// server/services/planningService.js
//
// B.1 Part 2 planning run: fixed assignment at the cutoff for one date.
// Replaces the FIFO engine (services/scheduler.js). Rules: planningSpec.js
// (packing) and crewSpec.js (crews); plan ~/.claude/plans/b1-planning-run.md.
//
// Steps
//   1. Load settings, crews, block-offs and the date's DOs:
//        movable  booked by Odoo with no slot yet, or 'assigned' (not approved)
//                 on one of the date's slots and not started
//        fixed    approved (or already under way) on a team's trip; they stay
//   2. Describe each DO: service minutes, installer need, volume, coordinates
//   3. Per session: B.2 groups nearby DOs, B.1 packs them into team trips
//   4. Dry run stops here (estimated travel only, nothing written)
//   5. Commit trips as 'assigned' (admin approves later); unassign movable DOs
//      that no longer fit; remove trips left empty on that date
//   6. B.2 sequences each trip; if it cannot, B.1 drops the latest DO it blamed
//      and asks again (at most MAX_ROUTE_ATTEMPTS), then records the reason
//   7. Suggest another date/session for every leftover (slot recommender rules)
//   8. Record the run and its deferrals

const prisma = require('../prismaClient');
const plan = require('./planningSpec');
const recommend = require('./slotRecommendSpec');
const { crewsForSession } = require('./crewSpec');
const { loadCrews } = require('./crewService');
const { loadRows } = require('./fleetAvailabilityService');
const { getSchedulerSettings } = require('./schedulerSettings');
const { serviceMinutesForOrders } = require('./serviceTime');
const { loadBookedOrders, linesVolume } = require('./slotRecommendService');
const { closedSessions } = require('./availabilityService');
const { sessionForWindow, APPOINTMENT_SESSIONS } = require('./odooAppointmentSessions');
const routing = require('./googleRoutingService');
const { optimizeScheduledSlot } = require('./intelligentRouteOptimizationService');

const MAX_ROUTE_ATTEMPTS = 3;
const SUGGEST_DAYS = 14;
const CLOSED_ORDER = /^(delivered|completed|cancelled|canceled|failed)$/i;
// Only these can still be moved by a run; anything further along is under way.
const MOVABLE_STATUS = ['Pending', 'Scheduled'];
const ROUTE_FAILURES = ['NO_FEASIBLE_SEQUENCE', 'UNRESOLVED_ADDRESS'];
// Same lock as POST /api/orders/:id/approve, so a run and an approval never interleave.
const APPROVAL_LOCK = 19761019;

class PlanningError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const klDateTime = (date, clock) => new Date(`${date}T${clock}:00+08:00`);

const ORDER_INCLUDE = {
  buildings: { select: { id: true, building_name: true, address: true, postal_code: true, latitude: true, longitude: true,
    access_time_window_start: true, access_time_window_end: true } },
  customers: { select: { address: true, city: true, postcode: true, state: true } },
  order_products: {
    select: {
      id: true, quantity: true, odoo_product_name: true, dismantle_required: true,
      dismantle_time_min: true, dismantle_time_max: true,
      custom_installation_time_min: true, custom_installation_time_max: true,
      products: { select: { product_name: true, package_length_cm: true, package_width_cm: true, package_height_cm: true } },
    },
  },
  time_slots: { select: { id: true, date: true, time_window_start: true, delivery_team_id: true, truck_id: true, departed_at: true } },
};

// ------------------------------------------------------------------ 1. load

async function loadDateOrders(db, date) {
  const rows = await db.orders.findMany({
    where: {
      OR: [
        { time_slot_id: null, requested_appointment_date: date },
        { time_slots: { date } },
      ],
    },
    include: ORDER_INCLUDE,
  });

  const movable = [];
  const fixed = [];
  for (const o of rows) {
    if (CLOSED_ORDER.test(o.order_status ?? '')) continue;
    const slot = o.time_slots;
    const session = slot ? sessionForWindow(slot.time_window_start) : o.requested_appointment_session;
    if (!plan.SESSIONS.includes(session)) continue;
    const started = slot?.departed_at || !MOVABLE_STATUS.includes(o.order_status ?? 'Pending');
    if (slot && (o.assignment_status === 'approved' || started)) fixed.push({ order: o, session });
    else movable.push({ order: o, session });
  }
  return { movable, fixed };
}

// ------------------------------------------------------------------ 2. describe

async function describeOrders(db, entries, settings) {
  const service = await serviceMinutesForOrders(entries.map(e => e.order), { settings, db });
  const out = [];
  for (const { order, session } of entries) {
    let coords = null;
    try {
      // B.2 converts addresses (shared geocode cache, Google when missing).
      coords = await routing.resolveOrderCoords(order);
    } catch { coords = null; }
    const s = service.get(order.id);
    out.push({
      id: order.id,
      ref: order.odoo_order_ref || order.id.slice(0, 8),
      session,
      service_minutes: Math.ceil(s?.totalMinutes ?? 0),
      requires_installer: Boolean(s?.requiresInstaller),
      volume_cm3: linesVolume((order.order_products ?? []).map(l => ({ quantity: l.quantity, product: l.products }))),
      coords,
      access_start: order.buildings?.access_time_window_start ?? null,
      access_end: order.buildings?.access_time_window_end ?? null,
      raw: order,
    });
  }
  return out;
}

async function warehouseCoords(settings) {
  if (settings.warehouse_latitude != null && settings.warehouse_longitude != null) {
    return { lat: Number(settings.warehouse_latitude), lon: Number(settings.warehouse_longitude) };
  }
  try { return await routing.geocodeAddress(settings.warehouse_address); } catch { return null; }
}

// ------------------------------------------------------------------ 3. per session

async function planSession({ session, date, orders, fixedOrders, crews, warehouse, settings }) {
  const located = orders.filter(o => o.coords);
  let groups = [];
  if (located.length > 1) {
    // B.2 proposes nearby groups by predicted road time at the session start.
    const departure = klDateTime(date, APPOINTMENT_SESSIONS[session][0]).getTime();
    const clusters = await routing.groupNearbyOrders(
      located.map(o => ({ id: o.id, coords: o.coords, buildings: o.raw.buildings })),
      departure,
    ).catch(() => located.map(o => [o]));
    groups = clusters.map(c => c.map(o => o.id));
  }

  const fixedByCrew = {};
  for (const f of fixedOrders) {
    const crewId = f.raw.time_slots?.delivery_team_id;
    if (crewId) (fixedByCrew[crewId] ??= []).push(f);
  }

  return plan.packSession({
    session,
    orders,
    groups,
    crews,
    fixed: fixedByCrew,
    warehouse,
    settings: { graceMinutes: settings.grace_minutes, bufferMinutes: settings.buffer_minutes },
  });
}

// ------------------------------------------------------------------ 5. commit

async function commitTrips(db, { date, sessionPlans, movableIds, fixedSlotByCrewSession, serviceById }) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${APPROVAL_LOCK})`;
    // Anything approved since the run loaded it is no longer ours to move.
    const still = await tx.orders.findMany({
      where: { id: { in: movableIds }, NOT: { assignment_status: 'approved' } },
      select: { id: true, order_status: true },
    });
    const statusById = new Map(still.map(o => [o.id, o.order_status]));
    const committed = [];
    const placed = new Set();

    for (const { session, result } of sessionPlans) {
      const [start, end] = APPOINTMENT_SESSIONS[session];
      for (const trip of result.trips) {
        const ids = trip.order_ids.filter(id => statusById.has(id));
        if (!ids.length) continue;
        let slotId = fixedSlotByCrewSession.get(`${trip.crew_id}|${session}`) ?? null;
        if (!slotId) {
          const existing = await tx.time_slots.findFirst({
            where: { date, time_window_start: start, truck_id: trip.truck_id, delivery_team_id: trip.crew_id,
              OR: [{ slot_status: null }, { slot_status: { notIn: ['completed', 'cancelled'] } }] },
            select: { id: true },
          });
          slotId = existing?.id ?? (await tx.time_slots.create({
            data: { date, time_window_start: start, time_window_end: end, truck_id: trip.truck_id,
              delivery_team_id: trip.crew_id, available_flag: true, slot_status: 'scheduled' },
            select: { id: true },
          })).id;
        }
        for (const id of ids) {
          await tx.orders.update({
            where: { id },
            data: {
              time_slot_id: slotId,
              assignment_status: 'assigned',
              order_status: statusById.get(id) === 'Pending' ? 'Scheduled' : statusById.get(id),
              // B.2 reads end - start as this DO's service time (as the FIFO engine
              // wrote it), so the window is session start + the DO's own minutes,
              // not the whole session. The customer's window is the session itself.
              scheduled_start_date_time: klDateTime(date, start),
              scheduled_end_date_time: new Date(klDateTime(date, start).getTime() + (serviceById.get(id) ?? 15) * 60000),
              updated_at: new Date(),
            },
          });
          placed.add(id);
        }
        committed.push({ ...trip, session, slot_id: slotId, order_ids: ids });
      }
    }

    // Movable DOs this run could not place come off any trip they were on.
    const unplaced = [...statusById.keys()].filter(id => !placed.has(id));
    if (unplaced.length) {
      await tx.orders.updateMany({
        where: { id: { in: unplaced }, NOT: { time_slot_id: null } },
        data: { time_slot_id: null, assignment_status: 'unassigned', updated_at: new Date() },
      });
      await tx.orders.updateMany({
        where: { id: { in: unplaced }, order_status: 'Scheduled' },
        data: { order_status: 'Pending' },
      });
    }

    // Trips on this date left with no DOs (a re-run moved them) and not started
    // are removed, so the Board does not show empty lorries.
    const empty = await tx.time_slots.findMany({
      where: { date, truck_id: { not: null }, delivery_team_id: { not: null }, departed_at: null, orders: { none: {} }, lorry_trip: null },
      select: { id: true },
    });
    if (empty.length) await tx.time_slots.deleteMany({ where: { id: { in: empty.map(e => e.id) } } });
    return committed;
  }, { timeout: 30000 });
}

// ------------------------------------------------------------------ 6. B.2 negotiation

async function sequenceTrip(db, trip, routeOptions) {
  const dropped = [];
  const movable = [...trip.order_ids];
  let last = null;
  for (let attempt = 1; attempt <= MAX_ROUTE_ATTEMPTS; attempt += 1) {
    try {
      last = await optimizeScheduledSlot(trip.slot_id, routeOptions);
    } catch (err) {
      return { slot_id: trip.slot_id, status: 'error', detail: err.message, dropped };
    }
    if (!last?.needs_review || !ROUTE_FAILURES.includes(last.reason)) {
      return { slot_id: trip.slot_id, status: last?.needs_review ? 'needs_review' : 'sequenced', detail: last?.reason ?? null, dropped };
    }
    const issues = Array.isArray(last.issues) ? last.issues : [];
    const drop = plan.dropForRoute(issues, movable);
    if (!drop || attempt === MAX_ROUTE_ATTEMPTS) break;
    const issue = issues.find(i => i.order_id === drop);
    await db.orders.update({
      where: { id: drop },
      data: { time_slot_id: null, assignment_status: 'unassigned', order_status: 'Pending', updated_at: new Date() },
    });
    movable.splice(movable.indexOf(drop), 1);
    dropped.push({
      order_id: drop,
      code: plan.REASON.ROUTE_INFEASIBLE,
      detail: issue?.minutes_late
        ? `Route would finish ${issue.minutes_late} min late`
        : (issue?.reason === 'UNRESOLVED_ADDRESS' ? 'Route planner could not locate the address' : plan.REASON_LABELS.ROUTE_INFEASIBLE),
    });
  }
  return { slot_id: trip.slot_id, status: 'needs_review', detail: last?.reason ?? null, dropped };
}

// ------------------------------------------------------------------ 7. suggestions

async function suggestAlternatives(db, { date, leftovers, described, crews, settings }) {
  if (!leftovers.length) return new Map();
  const dates = recommend.horizon(date, { days: SUGGEST_DAYS });
  const from = dates[0];
  const to = dates[dates.length - 1];
  const [truckRows, blockoffs, slots, booked] = await Promise.all([
    db.trucks.findMany({ select: { id: true, tone: true, length_cm: true, width_cm: true, height_cm: true } }),
    loadRows(db, { from, to }),
    db.time_slots.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, time_window_start: true, available_flag: true, slot_status: true } }),
    loadBookedOrders(db, { from, to }),
  ]);
  const trucks = truckRows.map(t => ({ id: t.id, tone: t.tone, volume_cm3: recommend.boxCm3(t.length_cm, t.width_cm, t.height_cm) }));
  const service = await serviceMinutesForOrders(booked.map(b => b.order), { settings, db });
  const bookings = booked.map(({ order, date: d, session }) => ({
    order_id: order.id, date: d, session,
    service_minutes: service.get(order.id)?.totalMinutes ?? 0,
    volume_cm3: linesVolume((order.order_products ?? []).map(l => ({ quantity: l.quantity, product: l.products }))),
  }));
  const closed = closedSessions(slots);
  const byId = new Map(described.map(d => [d.id, d]));

  const out = new Map();
  for (const l of leftovers) {
    const d = byId.get(l.order_id);
    // Another date does not fix an address nobody can find.
    if (!d || l.code === plan.REASON.ADDRESS_NOT_LOCATED) continue;
    const windows = recommend.evaluateWindows({
      dates, settings,
      job: { service_minutes: d.service_minutes, requires_installer: d.requires_installer, volume_cm3: d.volume_cm3 },
      building: d.raw.buildings ?? null,
      trucks, teams: crews, blockoffs,
      bookings: bookings.filter(b => b.order_id !== d.id),
      closedSessions: closed,
    }).filter(w => !(w.date === date && w.session === d.session));
    const best = recommend.pickOptions(windows, { limit: 1 }).options[0];
    if (best) out.set(l.order_id, { date: best.date, session: best.session });
  }
  return out;
}

// ------------------------------------------------------------------ entry point

/**
 * @param {object} args
 * @param {string} args.date        YYYY-MM-DD to plan
 * @param {boolean} [args.dryRun]   preview only: nothing written, travel estimated
 * @param {'cron'|'manual'} [args.trigger]
 * @param {string} [args.createdBy] employee id
 */
async function runPlanning({ date, dryRun = false, trigger = 'manual', createdBy = null, db = prisma } = {}) {
  if (!dryRun) {
    const running = await db.planning_runs.findFirst({
      where: { plan_date: date, status: 'running', dry_run: false, started_at: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
      select: { id: true },
    });
    if (running) throw new PlanningError(`A planning run for ${date} is already in progress.`, 'RUN_IN_PROGRESS', 409);
  }
  const run = dryRun ? null : await db.planning_runs.create({
    data: { plan_date: date, trigger, dry_run: false, status: 'running', created_by: createdBy },
    select: { id: true },
  });

  try {
    // Step 1. Load.
    const settings = await getSchedulerSettings();
    const [{ movable, fixed }, allCrews, blockoffs, warehouse] = await Promise.all([
      loadDateOrders(db, date),
      loadCrews(db),
      loadRows(db, { from: date, to: date }),
      warehouseCoords(settings),
    ]);

    // Step 2. Describe every DO (movable and fixed: fixed ones use up trip time).
    const described = await describeOrders(db, [...movable, ...fixed], settings);
    const movableIds = new Set(movable.map(m => m.order.id));
    const movableDescribed = described.filter(d => movableIds.has(d.id));
    const fixedDescribed = described.filter(d => !movableIds.has(d.id));

    // Step 3. Pack each session.
    const sessionPlans = [];
    for (const session of plan.SESSIONS) {
      const crews = crewsForSession(allCrews, date, session, blockoffs);
      const result = await planSession({
        session, date, settings, warehouse, crews,
        orders: movableDescribed.filter(d => d.session === session),
        fixedOrders: fixedDescribed.filter(d => d.session === session),
      });
      sessionPlans.push({ session, crews, result });
    }

    let trips = sessionPlans.flatMap(p => p.result.trips.map(t => ({ ...t, session: p.session })));
    let leftovers = sessionPlans.flatMap(p => p.result.leftovers.map(l => ({ ...l, session: p.session })));
    let routing_results = [];

    if (!dryRun) {
      // Step 5. Commit.
      const fixedSlotByCrewSession = new Map(fixedDescribed
        .filter(d => d.raw.time_slots?.delivery_team_id)
        .map(d => [`${d.raw.time_slots.delivery_team_id}|${d.session}`, d.raw.time_slots.id]));
      trips = await commitTrips(db, {
        date, sessionPlans, movableIds: [...movableIds], fixedSlotByCrewSession,
        serviceById: new Map(described.map(d => [d.id, d.service_minutes])),
      });

      // Step 6. B.2 sequences each trip; bounded negotiation on failure.
      const routeOptions = { warehouseAddress: settings.warehouse_address, warehouseCoords: warehouse };
      for (const trip of trips) {
        const r = await sequenceTrip(db, trip, routeOptions);
        routing_results.push(r);
        for (const d of r.dropped) {
          leftovers.push({ ...d, session: trip.session });
          trip.order_ids = trip.order_ids.filter(id => id !== d.order_id);
        }
      }
    }

    // Step 7. Suggest an alternative for each leftover.
    const suggestions = await suggestAlternatives(db, {
      date, leftovers, described, settings,
      crews: allCrews,
    });

    const crewName = new Map(allCrews.map(c => [c.id, { name: c.name, plate: c.truck?.plate_no ?? null }]));
    const refById = new Map(described.map(d => [d.id, d.ref]));
    const summary = {
      date,
      dry_run: dryRun,
      booked: movable.length,
      fixed: fixed.length,
      assigned: trips.reduce((s, t) => s + t.order_ids.length, 0),
      deferred: leftovers.length,
      trips: trips.map(t => ({
        session: t.session,
        team_id: t.crew_id,
        team: crewName.get(t.crew_id)?.name ?? null,
        truck_id: t.truck_id,
        truck: crewName.get(t.crew_id)?.plate ?? null,
        slot_id: t.slot_id ?? null,
        orders: t.order_ids.map(id => ({ id, ref: refById.get(id) })),
        fixed_orders: (t.fixed_order_ids ?? []).length,
        estimated_minutes: t.estimated_minutes,
        estimated_travel_minutes: t.estimated_travel_minutes,
      })),
      leftovers: leftovers.map(l => ({
        order_id: l.order_id,
        ref: refById.get(l.order_id) ?? null,
        session: l.session,
        code: l.code,
        detail: l.detail,
        suggestion: suggestions.get(l.order_id) ?? null,
      })),
      routing: routing_results,
    };

    // Step 8. Record.
    if (run) {
      await db.$transaction([
        db.planning_run_deferrals.createMany({
          data: summary.leftovers.map(l => ({
            run_id: run.id, order_id: l.order_id, session: l.session, reason_code: l.code,
            reason_detail: l.detail ? String(l.detail).slice(0, 300) : null,
            suggested_date: l.suggestion?.date ?? null, suggested_session: l.suggestion?.session ?? null,
          })),
        }),
        db.planning_runs.update({ where: { id: run.id }, data: { status: 'completed', finished_at: new Date(), summary } }),
        db.scheduler_config.updateMany({ where: { singleton: true }, data: { last_run_at: new Date() } }),
      ]);
    }
    return { run_id: run?.id ?? null, ...summary };
  } catch (err) {
    if (run) {
      await db.planning_runs.update({
        where: { id: run.id },
        data: { status: 'failed', finished_at: new Date(), error: String(err.message).slice(0, 2000) },
      }).catch(() => {});
    }
    throw err;
  }
}

/** Latest runs, newest first. */
async function listRuns({ date = null, limit = 20, db = prisma } = {}) {
  return db.planning_runs.findMany({
    where: date ? { plan_date: date } : {},
    orderBy: { started_at: 'desc' },
    take: limit,
    select: { id: true, plan_date: true, trigger: true, status: true, started_at: true, finished_at: true, error: true, summary: true },
  });
}

module.exports = { runPlanning, listRuns, PlanningError, loadDateOrders };
