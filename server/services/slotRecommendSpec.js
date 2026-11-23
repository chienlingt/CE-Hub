// server/services/slotRecommendSpec.js
//
// B.1 Part 1: recommend a date + session for a DO at booking time
// (docs/Final_Scheduler_Design_Proposal.md §5 Part 1, Steps 1-5).
// Pure: no Prisma, no clock, no Google. slotRecommendService.js loads the data
// and the road distances and calls evaluateWindows() / pickOptions().
//
// A recommendation never fixes a truck, team or route (proposal Step 5); it only
// says which date + session can feasibly take the DO, and why one is preferred.
//
// Hard checks per date + session, in the proposal's constraint priority order:
//   session_open   the session's slots are not all closed (same as Odoo INT-01)
//   access         building access hours leave room for the visit
//   do_cap         booked DOs < max_dos_per_slot
//   team           a delivery team is free (B.4 block-offs, driver on leave)
//   installer      a free delivery team has an installer, when an item needs one
//   truck          a truck is free (B.4 block-offs)
//   truck_load     booked volume + this DO fits the free trucks (when known)
//   visit_length   the visit fits the session (plus grace)
//   service_time   booked work + this visit fits the free delivery teams' hours
// Then ranking: earliest date, most nearby DOs (road km <= nearby_km), most room.

const { APPOINTMENT_SESSIONS } = require('./odooAppointmentSessions');
const { truckBlock } = require('./fleetAvailabilitySpec');
const { crewsForSession } = require('./crewSpec');

const SESSIONS = Object.keys(APPOINTMENT_SESSIONS);
const SESSION_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const HORIZON_DAYS = 14;
const MAX_HORIZON_DAYS = 60;
const MAX_OPTIONS = 3;
const MAX_ITEM_LINES = 50;
const MAX_QTY = 99;
const ADDRESS_MAX = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHECK = {
  SESSION_OPEN: 'session_open',
  ACCESS: 'access',
  DO_CAP: 'do_cap',
  TEAM: 'team',
  INSTALLER: 'installer',
  TRUCK: 'truck',
  TRUCK_LOAD: 'truck_load',
  VISIT_LENGTH: 'visit_length',
  SERVICE_TIME: 'service_time',
};

const CHECK_LABELS = {
  [CHECK.SESSION_OPEN]: 'Session closed',
  [CHECK.ACCESS]: 'Building access hours do not fit',
  [CHECK.DO_CAP]: 'Session is full',
  [CHECK.TEAM]: 'No delivery team free',
  [CHECK.INSTALLER]: 'No free team has an installer',
  [CHECK.TRUCK]: 'No truck free',
  [CHECK.TRUCK_LOAD]: 'Not enough truck space',
  [CHECK.VISIT_LENGTH]: 'Visit is longer than the session',
  [CHECK.SERVICE_TIME]: 'Not enough team hours',
};

// ------------------------------------------------------------------ helpers

const clockToMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins <= 24 * 60 ? mins : null;
};
const minutesToClock = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

function addDays(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateKeys(first, last) {
  const out = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** length x width x height in cm³, or null when any is missing. */
function boxCm3(l, w, h) {
  const dims = [l, w, h].map(Number);
  return dims.every(n => Number.isFinite(n) && n > 0) ? dims[0] * dims[1] * dims[2] : null;
}

function sessionMinutes(session) {
  const [start, end] = APPOINTMENT_SESSIONS[session];
  return clockToMinutes(end) - clockToMinutes(start);
}

// ------------------------------------------------------------------ input

/**
 * Validate the POST body.
 * @returns {{value?: {address, items: {name, quantity, dismantle}[], not_before, days, building_id, location}, errors: Record<string,string>}}
 */
function validateRequest(body = {}) {
  const errors = {};
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  if (!address) errors.address = 'is required';
  else if (address.length > ADDRESS_MAX) errors.address = `must be at most ${ADDRESS_MAX} characters`;

  const items = [];
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.items = 'must list at least one item';
  } else if (body.items.length > MAX_ITEM_LINES) {
    errors.items = `must have at most ${MAX_ITEM_LINES} lines`;
  } else {
    body.items.forEach((raw, i) => {
      const name = typeof raw?.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
      const quantity = raw?.quantity === undefined ? 1 : Number(raw.quantity);
      if (!name || name.length > 255) errors[`items[${i}].name`] = 'is required (max 255 characters)';
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
        errors[`items[${i}].quantity`] = `must be a whole number from 1 to ${MAX_QTY}`;
      }
      items.push({ name, quantity, dismantle: raw?.dismantle === true });
    });
  }

  let notBefore = null;
  if (body.not_before !== undefined && body.not_before !== null && body.not_before !== '') {
    if (!isDateKey(body.not_before)) errors.not_before = 'must be a date (YYYY-MM-DD)';
    else notBefore = body.not_before;
  }

  // Where the address is, when the user picked a building suggestion or
  // confirmed a "Check address" match. Both optional.
  let buildingId = null;
  if (body.building_id !== undefined && body.building_id !== null && body.building_id !== '') {
    if (typeof body.building_id !== 'string' || !UUID_RE.test(body.building_id)) errors.building_id = 'is not a valid building id';
    else buildingId = body.building_id;
  }
  let location = null;
  if (body.location !== undefined && body.location !== null) {
    const lat = Number(body.location?.lat);
    const lon = Number(body.location?.lon);
    const label = typeof body.location?.label === 'string' ? body.location.label.trim().slice(0, ADDRESS_MAX) : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      errors.location = 'must have a valid lat and lon';
    } else {
      location = { lat, lon, label: label || null };
    }
  }

  let days = HORIZON_DAYS;
  if (body.days !== undefined) {
    days = Number(body.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_HORIZON_DAYS) {
      errors.days = `must be a whole number from 1 to ${MAX_HORIZON_DAYS}`;
    }
  }

  if (Object.keys(errors).length) return { errors };
  return { value: { address, items, not_before: notBefore, days, building_id: buildingId, location }, errors };
}

/**
 * Dates to evaluate: from the first bookable date (Odoo INT-01 rule, passed in)
 * or not_before if later, for `days` days.
 */
function horizon(firstBookable, { notBefore = null, days = HORIZON_DAYS } = {}) {
  const first = notBefore && notBefore > firstBookable ? notBefore : firstBookable;
  return dateKeys(first, addDays(first, days - 1));
}

// ------------------------------------------------------------------ building

/** Match a typed address to a building: unique 5-digit postcode, else longest name contained. */
function matchBuilding(address, buildings = []) {
  const text = String(address ?? '').toLowerCase();
  if (!text.trim()) return null;
  const postcodes = text.match(/\b\d{5}\b/g) ?? [];
  if (postcodes.length) {
    const byPostcode = buildings.filter(b => b.postal_code && postcodes.includes(String(b.postal_code).trim()));
    if (byPostcode.length === 1) return byPostcode[0];
  }
  return [...buildings]
    .filter(b => b.building_name && b.building_name.trim().length >= 4)
    .sort((a, b) => b.building_name.length - a.building_name.length)
    .find(b => text.includes(b.building_name.trim().toLowerCase())) ?? null;
}

/**
 * Can a visit of `minutes` fit inside both the session and the building's
 * access hours? Missing access hours on either side count as open.
 */
function accessFits(building, session, minutes) {
  const [ws, we] = APPOINTMENT_SESSIONS[session].map(clockToMinutes);
  const as = clockToMinutes(building?.access_time_window_start);
  const ae = clockToMinutes(building?.access_time_window_end);
  if (as === null && ae === null) return { ok: true, checked: false };
  const start = Math.max(ws, as ?? ws);
  const end = Math.min(we, ae ?? we);
  const ok = end - start >= minutes;
  return {
    ok,
    checked: true,
    detail: ok ? null
      : `Building open ${building.access_time_window_start ?? '…'}–${building.access_time_window_end ?? '…'}; a ${minutes}-min visit does not fit ${minutesToClock(ws)}–${minutesToClock(we)}`,
  };
}

// ------------------------------------------------------------------ evaluation

/**
 * Evaluate every date + session.
 * @param {object} args
 * @param {string[]} args.dates
 * @param {object} args.settings      getSchedulerSettings() (max_dos_per_slot, grace_minutes)
 * @param {{service_minutes:number, requires_installer:boolean, volume_cm3:number|null}} args.job
 * @param {object|null} args.building matched buildings row
 * @param {Array<{id, tone, volume_cm3}>} args.trucks
 * @param {Array} args.teams          crewService.loadCrews() shape (kind, available_flag, truck, members with role_name)
 * @param {Array} args.blockoffs      resource_blockoffs rows
 * @param {Array<{order_id, date, session, service_minutes, volume_cm3}>} args.bookings  open DOs
 * @param {Set<string>} [args.closedSessions] 'date|session' keys whose slots are all closed
 * @param {Map<string, number|null>} [args.distanceKm] order_id -> road km from the new address
 * @param {number} [args.nearbyKm]
 */
function evaluateWindows({
  dates, settings = {}, job, building = null, trucks = [], teams = [], blockoffs = [],
  bookings = [], closedSessions = new Set(), distanceKm = new Map(), nearbyKm = 10,
}) {
  const cap = Number(settings.max_dos_per_slot) || 25;
  const grace = Number(settings.grace_minutes) || 0;
  const byWindow = new Map();
  for (const b of bookings) {
    const key = `${b.date}|${b.session}`;
    if (!byWindow.has(key)) byWindow.set(key, []);
    byWindow.get(key).push(b);
  }

  const windows = [];
  for (const date of dates) {
    for (const session of SESSIONS) {
      const key = `${date}|${session}`;
      const booked = byWindow.get(key) ?? [];
      const length = sessionMinutes(session);
      const checks = {};
      const fail = (code, detail) => { checks[code] = { ok: false, detail }; };
      const pass = (code, detail = null) => { checks[code] = { ok: true, detail }; };

      // 1. Session open (Odoo shows the same thing).
      if (closedSessions.has(key)) fail(CHECK.SESSION_OPEN, 'Every slot in this session is closed');
      else pass(CHECK.SESSION_OPEN);

      // 2. Building access.
      if (building) {
        const a = accessFits(building, session, job.service_minutes);
        if (a.ok) pass(CHECK.ACCESS, a.checked ? null : 'Building has no access hours recorded');
        else fail(CHECK.ACCESS, a.detail);
      } else {
        checks[CHECK.ACCESS] = { ok: true, detail: 'Address not matched to a building; not checked', unchecked: true };
      }

      // 3. DO cap per date + session, all trucks and areas.
      if (booked.length >= cap) fail(CHECK.DO_CAP, `${booked.length} of ${cap} DOs booked`);
      else pass(CHECK.DO_CAP, `${booked.length} of ${cap} DOs booked`);

      // 4-6. Teams and trucks free in this session (B.4).
      // Crews per crewSpec: a delivery team with its own unblocked truck; an
      // installation needs one with an installer member who is not on leave.
      const freeTrucks = trucks.filter(t => !truckBlock(t, date, session, blockoffs));
      const deliveryTeams = crewsForSession(teams, date, session, blockoffs);
      const installerCrews = deliveryTeams.filter(t => t.has_installer);

      if (deliveryTeams.length) pass(CHECK.TEAM, `${deliveryTeams.length} free`);
      else fail(CHECK.TEAM, 'Every delivery team is blocked off or has no free truck');

      if (job.requires_installer) {
        if (installerCrews.length) pass(CHECK.INSTALLER, `${installerCrews.length} free with an installer`);
        else fail(CHECK.INSTALLER, 'No free delivery team has an installer');
      }

      if (freeTrucks.length) pass(CHECK.TRUCK, `${freeTrucks.length} free`);
      else fail(CHECK.TRUCK, 'Every truck is blocked off');

      // 7. Truck load: preliminary, across the free fleet. Unknown volumes are skipped.
      const volumes = freeTrucks.map(t => t.volume_cm3).filter(v => Number.isFinite(v) && v > 0);
      if (job.volume_cm3 === null || !volumes.length) {
        checks[CHECK.TRUCK_LOAD] = {
          ok: true, unchecked: true,
          detail: job.volume_cm3 === null ? 'Item sizes unknown; not checked' : 'Truck sizes unknown; not checked',
        };
      } else {
        const fleet = volumes.reduce((s, v) => s + v, 0);
        const used = booked.reduce((s, b) => s + (Number.isFinite(b.volume_cm3) ? b.volume_cm3 : 0), 0);
        if (job.volume_cm3 > Math.max(...volumes)) fail(CHECK.TRUCK_LOAD, 'Larger than any free truck');
        else if (used + job.volume_cm3 > fleet) fail(CHECK.TRUCK_LOAD, `${Math.round(((used) / fleet) * 100)}% of free truck space already booked`);
        else pass(CHECK.TRUCK_LOAD, `${Math.round(((used + job.volume_cm3) / fleet) * 100)}% of free truck space`);
      }

      // 8. Service time: the visit fits the session (with grace), and the
      // session's total work fits the free delivery teams' hours.
      const demand = booked.reduce((s, b) => s + (Number(b.service_minutes) || 0), 0) + job.service_minutes;
      const supply = deliveryTeams.length * (length + grace);
      if (job.service_minutes > length + grace) {
        fail(CHECK.VISIT_LENGTH, `A ${job.service_minutes}-min visit is longer than the ${length}-min session`);
      } else if (deliveryTeams.length && demand > supply) {
        fail(CHECK.SERVICE_TIME, `${demand} min of work for ${supply} team-min`);
      } else {
        pass(CHECK.SERVICE_TIME, deliveryTeams.length ? `${demand} of ${supply} team-min` : null);
      }

      // Nearby DOs (optimisation, not a hard check).
      let nearby = 0;
      let unknownDistance = 0;
      for (const b of booked) {
        const km = distanceKm.get(b.order_id);
        if (km === undefined || km === null) unknownDistance += 1;
        else if (km <= nearbyKm) nearby += 1;
      }

      const failed = Object.entries(checks).filter(([, c]) => !c.ok).map(([code]) => code);
      windows.push({
        date,
        session,
        label: SESSION_LABELS[session],
        start: APPOINTMENT_SESSIONS[session][0],
        end: APPOINTMENT_SESSIONS[session][1],
        feasible: failed.length === 0,
        failed,
        booked: booked.length,
        cap,
        nearby,
        unknown_distance: unknownDistance,
        checks,
      });
    }
  }
  return windows;
}

// ------------------------------------------------------------------ ranking

/** Earliest date first; within a date, most nearby DOs, then most room. */
const byPreference = (a, b) => (
  a.date.localeCompare(b.date)
  || (b.nearby - a.nearby)
  || (a.booked / a.cap - b.booked / b.cap)
  || SESSIONS.indexOf(a.session) - SESSIONS.indexOf(b.session)
);

function dayLabel(dateKey) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return `${weekday} ${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
}

function reasonFor(w, nearbyKm) {
  const parts = [];
  if (w.nearby) parts.push(`${w.nearby} DO${w.nearby > 1 ? 's' : ''} within ${nearbyKm} km`);
  parts.push(`${w.booked} of ${w.cap} DOs booked`);
  return parts.join(' · ');
}

/**
 * Best feasible windows, one per date (the best session of that day), plus the
 * most common reasons when nothing fits.
 */
function pickOptions(windows, { limit = MAX_OPTIONS, nearbyKm = 10 } = {}) {
  const bestPerDay = new Map();
  for (const w of windows.filter(x => x.feasible).sort(byPreference)) {
    if (!bestPerDay.has(w.date)) bestPerDay.set(w.date, w);
  }
  const options = [...bestPerDay.values()].slice(0, limit).map(w => ({
    key: `${w.date}-${w.session}`,
    date: w.date,
    session: w.session,
    label: `${dayLabel(w.date)} · ${w.label} (${w.start}–${w.end})`,
    reason: reasonFor(w, nearbyKm),
    nearby: w.nearby,
    booked: w.booked,
    cap: w.cap,
  }));

  const counts = {};
  for (const w of windows) for (const code of w.failed) counts[code] = (counts[code] ?? 0) + 1;
  const reasons = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, n]) => ({ code, label: CHECK_LABELS[code], count: n, of: windows.length }));

  return { options, reasons };
}

module.exports = {
  SESSIONS,
  HORIZON_DAYS,
  MAX_OPTIONS,
  CHECK,
  CHECK_LABELS,
  clockToMinutes,
  addDays,
  boxCm3,
  validateRequest,
  horizon,
  matchBuilding,
  accessFits,
  evaluateWindows,
  pickOptions,
};
