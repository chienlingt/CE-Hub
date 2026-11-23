// server/services/planningSpec.js
//
// B.1 Part 2: fixed assignment at the planning cutoff
// (docs/Final_Scheduler_Design_Proposal.md §5 Part 2; plan ~/.claude/plans/b1-planning-run.md).
// Pure: no Prisma, no clock, no Google. planningService.js loads the data, gets
// B.2's nearby groups, calls these functions, writes the trips and runs the
// B.2 sequencing / negotiation loop.
//
// For one date + session, B.1 packs booked DOs into trips (one delivery team with
// its own truck). Main objective: assign the most DOs; then fewer trips and less
// travel. A DO that fits no trip is a leftover with a reason; it is never
// squeezed into a trip that breaks a hard rule.
//
// A trip fits when:
//   installer  any DO needs one -> the team has an installer (crewSpec)
//   space      known volumes <= the truck's volume (unknown sizes are not counted)
//   time       service + estimated travel + (buffer + grace) per stop <= session
//              Grace is a gap after every stop, as B.2 applies it
//              (intelligentRouteOptimizationService: readyForNextStop = end + grace,
//              late if that passes the session end), so a trip B.1 builds is one
//              B.2 can sequence.
// Travel here is an estimate (straight line x 1.4 at 30 km/h, warehouse then
// nearest stop). B.2 sequences the real route after commit and can push back.

const { APPOINTMENT_SESSIONS } = require('./odooAppointmentSessions');

const SESSIONS = Object.keys(APPOINTMENT_SESSIONS);
const ROAD_FACTOR = 1.4;
const SPEED_KMH = 30;

// Why a DO was left over. Ordered roughly by when the run finds out.
const REASON = {
  ADDRESS_NOT_LOCATED: 'ADDRESS_NOT_LOCATED',
  ACCESS_HOURS: 'ACCESS_HOURS',
  VISIT_TOO_LONG: 'VISIT_TOO_LONG',
  NO_TEAM_FREE: 'NO_TEAM_FREE',
  NO_INSTALLER_TEAM: 'NO_INSTALLER_TEAM',
  TRUCK_TOO_SMALL: 'TRUCK_TOO_SMALL',
  TEAMS_FULL: 'TEAMS_FULL',
  ROUTE_INFEASIBLE: 'ROUTE_INFEASIBLE',
};

const REASON_LABELS = {
  ADDRESS_NOT_LOCATED: 'Address could not be located',
  ACCESS_HOURS: 'Building access hours do not fit this session',
  VISIT_TOO_LONG: 'Visit plus travel is longer than the session',
  NO_TEAM_FREE: 'No delivery team free in this session',
  NO_INSTALLER_TEAM: 'No free team has an installer',
  TRUCK_TOO_SMALL: 'Too large for any free truck',
  TEAMS_FULL: 'Every suitable team is full for this session',
  ROUTE_INFEASIBLE: 'Route could not reach it in time',
};

// ------------------------------------------------------------------ helpers

const clockToMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function sessionWindow(session) {
  const [start, end] = APPOINTMENT_SESSIONS[session];
  return { start, end, startMin: clockToMinutes(start), endMin: clockToMinutes(end), minutes: clockToMinutes(end) - clockToMinutes(start) };
}

function haversineKm(a, b) {
  const R = 6371;
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const legMinutes = (a, b) => (haversineKm(a, b) * ROAD_FACTOR / SPEED_KMH) * 60;

/**
 * Estimated driving minutes for a trip: from the warehouse, always to the
 * nearest unvisited stop. No return leg (the session ends at the last stop).
 */
function estimateTravelMinutes(warehouse, stops) {
  if (!warehouse || !stops.length) return 0;
  const left = [...stops];
  let here = warehouse;
  let total = 0;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i += 1) if (legMinutes(here, left[i]) < legMinutes(here, left[best])) best = i;
    total += legMinutes(here, left[best]);
    here = left.splice(best, 1)[0];
  }
  return total;
}

// ------------------------------------------------------------------ DO-level checks

/**
 * Hard checks on one DO before packing. Returns a leftover reason or null.
 * @param {{coords, service_minutes, access_start, access_end}} order
 */
function precheck(order, session, { graceMinutes = 0 } = {}) {
  const w = sessionWindow(session);
  if (!order.coords) return { code: REASON.ADDRESS_NOT_LOCATED, detail: 'No coordinates for the delivery address' };
  if (order.service_minutes + graceMinutes > w.minutes) {
    return { code: REASON.VISIT_TOO_LONG, detail: `A ${order.service_minutes}-min visit does not fit the ${w.minutes}-min session` };
  }
  const as = clockToMinutes(order.access_start);
  const ae = clockToMinutes(order.access_end);
  // Only when the building's hours actually cut into the session; a building
  // open all session long is the session-length check above, not this one.
  const narrows = (as !== null && as > w.startMin) || (ae !== null && ae < w.endMin);
  if (narrows) {
    const open = Math.min(w.endMin, ae ?? w.endMin) - Math.max(w.startMin, as ?? w.startMin);
    if (open < order.service_minutes) {
      return {
        code: REASON.ACCESS_HOURS,
        detail: `Building open ${order.access_start ?? '…'}–${order.access_end ?? '…'}; a ${order.service_minutes}-min visit does not fit ${w.start}–${w.end}`,
      };
    }
  }
  return null;
}

// ------------------------------------------------------------------ trips

function newTrip(crew, fixed = []) {
  return { crew, fixed, orders: [] };
}

const tripOrders = trip => [...trip.fixed, ...trip.orders];

/**
 * Would this trip still fit with `adding` DOs added?
 * @returns {{ok: boolean, reason?: string, minutes?: number, travel?: number, volume?: number}}
 */
function tripFits(trip, adding, ctx) {
  const all = [...tripOrders(trip), ...adding];
  if (all.some(o => o.requires_installer) && !trip.crew.has_installer) return { ok: false, reason: REASON.NO_INSTALLER_TEAM };

  const truckCm3 = trip.crew.truck?.volume_cm3;
  const volume = all.reduce((s, o) => s + (Number.isFinite(o.volume_cm3) ? o.volume_cm3 : 0), 0);
  if (Number.isFinite(truckCm3) && truckCm3 > 0 && volume > truckCm3) {
    const single = adding.find(o => Number.isFinite(o.volume_cm3) && o.volume_cm3 > truckCm3);
    return { ok: false, reason: single ? REASON.TRUCK_TOO_SMALL : REASON.TEAMS_FULL };
  }

  const service = all.reduce((s, o) => s + o.service_minutes, 0);
  const travel = estimateTravelMinutes(ctx.warehouse, all.map(o => o.coords).filter(Boolean));
  const minutes = service + travel + (ctx.bufferMinutes + ctx.graceMinutes) * all.length;
  if (minutes > ctx.window.minutes) return { ok: false, reason: REASON.TEAMS_FULL };
  return { ok: true, minutes, travel, volume };
}

/** Teams to try for new trips: installer crews only when needed, else non-installer first, then smallest truck. */
function crewPreference(needsInstaller) {
  return (a, b) => {
    if (!needsInstaller && a.has_installer !== b.has_installer) return a.has_installer ? 1 : -1;
    const va = a.truck?.volume_cm3 ?? Infinity;
    const vb = b.truck?.volume_cm3 ?? Infinity;
    return va - vb || String(a.id).localeCompare(String(b.id));
  };
}

/** Why `order` cannot go anywhere, judged against every crew on its own. */
function leftoverReason(order, crews, ctx) {
  if (!crews.length) return REASON.NO_TEAM_FREE;
  if (order.requires_installer && !crews.some(c => c.has_installer)) return REASON.NO_INSTALLER_TEAM;
  const eligible = order.requires_installer ? crews.filter(c => c.has_installer) : crews;
  const alone = eligible.map(c => tripFits(newTrip(c), [order], ctx));
  if (alone.every(r => r.reason === REASON.TRUCK_TOO_SMALL)) return REASON.TRUCK_TOO_SMALL;
  // Does not fit even an empty trip: the visit plus the drive is longer than the session.
  if (alone.every(r => !r.ok)) return REASON.VISIT_TOO_LONG;
  return REASON.TEAMS_FULL;
}

/**
 * Pack one session's booked DOs into trips.
 * @param {object} args
 * @param {string} args.session                morning | afternoon | evening
 * @param {Array}  args.orders                 [{ id, service_minutes, requires_installer, volume_cm3, coords, access_start, access_end }]
 * @param {Array<string[]>} [args.groups]      B.2 nearby groups (order ids); missing ids become singletons
 * @param {Array}  args.crews                  crewsForSession() output (with truck.volume_cm3, has_installer)
 * @param {Record<string, Array>} [args.fixed] crew id -> approved DOs already on its trip (same shape as orders)
 * @param {{lat, lon}} [args.warehouse]
 * @param {{graceMinutes?, bufferMinutes?}} [args.settings]
 * @returns {{ trips: Array, leftovers: Array<{order_id, code, detail}> }}
 */
function packSession({ session, orders = [], groups = [], crews = [], fixed = {}, warehouse = null, settings = {} }) {
  const ctx = {
    window: sessionWindow(session),
    graceMinutes: Number(settings.graceMinutes) || 0,
    bufferMinutes: Number(settings.bufferMinutes) || 0,
    warehouse,
  };
  const leftovers = [];
  const ok = [];
  for (const o of orders) {
    const fail = precheck(o, session, ctx);
    if (fail) leftovers.push({ order_id: o.id, ...fail });
    else ok.push(o);
  }

  // B.2's groups, restricted to DOs that passed; anything not grouped is alone.
  const byId = new Map(ok.map(o => [o.id, o]));
  const seen = new Set();
  const grouped = [];
  for (const ids of groups) {
    const g = ids.map(id => byId.get(id)).filter(o => o && !seen.has(o.id));
    g.forEach(o => seen.add(o.id));
    if (g.length) grouped.push(g);
  }
  for (const o of ok) if (!seen.has(o.id)) grouped.push([o]);

  // Scarce first: groups needing an installer, then bigger groups, then longer work.
  const work = g => g.reduce((s, o) => s + o.service_minutes, 0);
  grouped.sort((a, b) => (Number(b.some(o => o.requires_installer)) - Number(a.some(o => o.requires_installer)))
    || (b.length - a.length) || (work(b) - work(a)));

  // Trips that already carry approved DOs are open from the start.
  const trips = [];
  const crewById = new Map(crews.map(c => [c.id, c]));
  for (const [crewId, fixedOrders] of Object.entries(fixed)) {
    const crew = crewById.get(crewId);
    if (crew && fixedOrders.length) trips.push(newTrip(crew, fixedOrders));
  }
  const usedCrew = () => new Set(trips.map(t => t.crew.id));

  const place = (adding) => {
    const needsInstaller = adding.some(o => o.requires_installer);
    // 1. An open trip, the one with the most time left first.
    const open = trips
      .map(t => ({ t, fit: tripFits(t, adding, ctx) }))
      .filter(x => x.fit.ok)
      .sort((a, b) => a.fit.minutes - b.fit.minutes);
    if (open.length) { open[0].t.orders.push(...adding); return true; }
    // 2. A new trip on an unused crew.
    const used = usedCrew();
    const fresh = crews.filter(c => !used.has(c.id)).sort(crewPreference(needsInstaller));
    for (const crew of fresh) {
      const trip = newTrip(crew);
      if (tripFits(trip, adding, ctx).ok) { trip.orders.push(...adding); trips.push(trip); return true; }
    }
    return false;
  };

  for (const group of grouped) {
    if (place(group)) continue;
    // Split: biggest jobs first, each on its own; the rest stay nearby where possible.
    for (const o of [...group].sort((a, b) => b.service_minutes - a.service_minutes)) {
      if (!place([o])) leftovers.push({ order_id: o.id, code: leftoverReason(o, crews, ctx), detail: null });
    }
  }

  return {
    trips: trips.filter(t => t.orders.length).map(t => {
      const fit = tripFits(newTrip(t.crew, tripOrders(t)), [], ctx);
      return {
        crew_id: t.crew.id,
        truck_id: t.crew.truck?.id ?? null,
        order_ids: t.orders.map(o => o.id),
        fixed_order_ids: t.fixed.map(o => o.id),
        estimated_minutes: Math.round(fit.minutes ?? 0),
        estimated_travel_minutes: Math.round(fit.travel ?? 0),
        volume_cm3: fit.volume ?? 0,
      };
    }),
    leftovers: leftovers.map(l => ({ ...l, detail: l.detail ?? REASON_LABELS[l.code] })),
  };
}

// ------------------------------------------------------------------ B.2 negotiation

/**
 * B.2 could not sequence a committed trip. Pick the DO to drop: among the DOs
 * B.2 blamed (that B.1 placed, not approved ones), the latest one; else none.
 * @param {Array<{order_id, minutes_late?}>} issues  B.2's review issues
 * @param {string[]} movable                         DO ids this run placed on the trip
 * @returns {string|null}
 */
function dropForRoute(issues = [], movable = []) {
  const blamed = issues.filter(i => movable.includes(i.order_id));
  if (!blamed.length) return null;
  return [...blamed].sort((a, b) => (b.minutes_late ?? 0) - (a.minutes_late ?? 0))[0].order_id;
}

module.exports = {
  SESSIONS,
  REASON,
  REASON_LABELS,
  sessionWindow,
  estimateTravelMinutes,
  precheck,
  tripFits,
  packSession,
  dropForRoute,
};
