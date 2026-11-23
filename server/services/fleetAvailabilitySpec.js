// server/services/fleetAvailabilitySpec.js
//
// B.4 Fleet Availability rules (FR-10-001..007). Pure: no Prisma, no clock.
// The client mirrors the matching rules in client/src/utils/fleet/fleetRules.js;
// keep the two in step (the tests use the same cases).
//
// A block-off row (resource_blockoffs) covers, for start_date..end_date and the
// listed sessions:
//   fleet       every truck and every team, including ones added later
//   truck_type  every truck whose tonnage key (toneKey) equals scope_value
//   truck       one truck (resource_id)
//   team        one team (resource_id), delivery or installer
//   employee    one staff member (resource_id), for leave or MC. A delivery
//               team whose driver is blocked is blocked too; an installer team
//               is blocked when every installer is. Otherwise the team stays
//               available, short of that person.
// Rows saved in one submission share group_id and are listed as one block-off.

const { APPOINTMENT_SESSIONS, sessionForWindow } = require('./odooAppointmentSessions');

const SESSIONS = Object.keys(APPOINTMENT_SESSIONS); // morning, afternoon, evening
const BLOCKOFF_REASONS = ['public_holiday', 'event', 'leave', 'mc', 'maintenance', 'other'];
const RESOURCE_TYPES = ['fleet', 'truck_type', 'truck', 'team', 'employee'];
const MAX_DAYS = 366;
const MAX_TARGETS = 500;
const NOTE_MAX = 300;
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TONE_KEY_RE = /^(\d{1,3}|unknown)$/;

// ------------------------------------------------------------------ dates

function isDateKey(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Date or 'YYYY-MM-DD…' → 'YYYY-MM-DD'. Prisma returns @db.Date as UTC midnight. */
function toDateKey(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

function addDays(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayCount(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;
}

/** Today in Kuala Lumpur, whatever the server timezone (Malaysia has no DST). */
function klToday(now = new Date()) {
  return new Date(now.getTime() + KL_OFFSET_MS).toISOString().slice(0, 10);
}

/** KL date and session of a timestamp (installation ETA), or null outside the sessions. */
function klDateSession(timestamp) {
  if (!timestamp) return null;
  const wall = new Date(new Date(timestamp).getTime() + KL_OFFSET_MS).toISOString();
  const session = sessionForWindow(wall.slice(11, 16));
  return session ? { date: wall.slice(0, 10), session } : null;
}

// ------------------------------------------------------------------ resources

/** Tonnage key for truck_type matching: "1", "3", or "unknown" when tone is null. */
function toneKey(tone) {
  return Number.isInteger(tone) ? String(tone) : 'unknown';
}

/** Delivery teams have "delivery" in team_type; every other team is an installer team. */
function teamKind(teamType) {
  return String(teamType ?? '').toLowerCase().includes('delivery') ? 'delivery' : 'installer';
}

// ------------------------------------------------------------------ validation

const uniq = list => [...new Set(list)];
const asList = v => (Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean) : null);

/**
 * Body of POST /blockoffs and /blockoffs/preview:
 *   { fleet: true }                                   → block everything
 *   { truck_types: ["3"], trucks: [id], teams: [id], employees: [id] } → any mix, at least one
 *   + start_date, end_date (YYYY-MM-DD), sessions (non-empty subset), reason, note
 * @returns {{ value: object, errors: Record<string,string> }}
 */
function validateBlockoffGroup(body = {}, today) {
  const value = {};
  const errors = {};

  if (body.fleet === true) {
    value.fleet = true;
    value.truck_types = [];
    value.trucks = [];
    value.teams = [];
    value.employees = [];
  } else {
    value.fleet = false;
    const fields = {
      truck_types: body.truck_types ?? [], trucks: body.trucks ?? [], teams: body.teams ?? [], employees: body.employees ?? [],
    };
    for (const [key, raw] of Object.entries(fields)) {
      const list = asList(raw);
      if (!list) { errors[key] = 'must be a list'; continue; }
      const bad = key === 'truck_types' ? list.find(v => !TONE_KEY_RE.test(v)) : list.find(v => !UUID_RE.test(v));
      if (bad) errors[key] = key === 'truck_types' ? `"${bad}" is not a tonnage` : `"${bad}" is not an id`;
      value[key] = uniq(list);
    }
    const total = (value.truck_types?.length ?? 0) + (value.trucks?.length ?? 0) + (value.teams?.length ?? 0)
      + (value.employees?.length ?? 0);
    if (!Object.keys(errors).length && total === 0) errors.targets = 'pick all trucks and teams, a truck type, a truck, a team or a staff member';
    if (total > MAX_TARGETS) errors.targets = `at most ${MAX_TARGETS} trucks, teams and staff at once`;
  }

  if (!isDateKey(body.start_date)) errors.start_date = 'must be a date (YYYY-MM-DD)';
  else if (today && body.start_date < today) errors.start_date = 'cannot be in the past';
  else value.start_date = body.start_date;

  if (!isDateKey(body.end_date)) errors.end_date = 'must be a date (YYYY-MM-DD)';
  else if (value.start_date && body.end_date < value.start_date) errors.end_date = 'must be on or after the start date';
  else if (value.start_date && dayCount(value.start_date, body.end_date) > MAX_DAYS) errors.end_date = `a block-off can cover at most ${MAX_DAYS} days`;
  else value.end_date = body.end_date;

  const sessions = asList(body.sessions);
  if (!sessions || !sessions.length || sessions.some(s => !SESSIONS.includes(s))) {
    errors.sessions = `pick one or more of ${SESSIONS.join(', ')}`;
  } else {
    value.sessions = SESSIONS.filter(s => sessions.includes(s));
  }

  if (!BLOCKOFF_REASONS.includes(body.reason)) errors.reason = `must be one of ${BLOCKOFF_REASONS.join(', ')}`;
  else value.reason = body.reason;

  const note = body.note == null ? '' : String(body.note).trim();
  if (note.length > NOTE_MAX) errors.note = `max ${NOTE_MAX} characters`;
  else if (value.reason === 'other' && !note) errors.note = 'required when the reason is Other';
  value.note = note || null;

  return { value, errors };
}

/** Validated group → rows for resource_blockoffs.createMany (dates as Date). */
function expandGroup(value, { groupId, createdBy = null }) {
  const common = {
    group_id: groupId,
    start_date: new Date(`${value.start_date}T00:00:00Z`),
    end_date: new Date(`${value.end_date}T00:00:00Z`),
    sessions: [...value.sessions],
    reason: value.reason,
    note: value.note,
    created_by: createdBy,
  };
  if (value.fleet) return [{ ...common, resource_type: 'fleet', resource_id: null, scope_value: null }];
  return [
    ...value.truck_types.map(t => ({ ...common, resource_type: 'truck_type', resource_id: null, scope_value: t })),
    ...value.trucks.map(id => ({ ...common, resource_type: 'truck', resource_id: id, scope_value: null })),
    ...value.teams.map(id => ({ ...common, resource_type: 'team', resource_id: id, scope_value: null })),
    ...(value.employees ?? []).map(id => ({ ...common, resource_type: 'employee', resource_id: id, scope_value: null })),
  ];
}

// ------------------------------------------------------------------ matching

function rowSessions(row) {
  return Array.isArray(row.sessions) && row.sessions.length ? row.sessions : SESSIONS;
}

/** Does this row apply on dateKey in session? Without a session: only a full-day row counts. */
function rowCovers(row, dateKey, session) {
  const from = toDateKey(row.start_date);
  const to = toDateKey(row.end_date);
  if (dateKey < from || dateKey > to) return false;
  const sessions = rowSessions(row);
  return session ? sessions.includes(session) : SESSIONS.every(s => sessions.includes(s));
}

function rowBlocksTruck(row, truck) {
  if (!truck) return false;
  switch (row.resource_type) {
    case 'fleet': return true;
    case 'truck_type': return row.scope_value === toneKey(truck.tone);
    case 'truck': return row.resource_id === truck.id;
    default: return false;
  }
}

function rowBlocksTeam(row, teamId) {
  if (!teamId) return false;
  return row.resource_type === 'fleet' || (row.resource_type === 'team' && row.resource_id === teamId);
}

/** First row blocking this truck on dateKey/session, or null. */
function truckBlock(truck, dateKey, session, rows = []) {
  return rows.find(r => rowCovers(r, dateKey, session) && rowBlocksTruck(r, truck)) ?? null;
}

function rowBlocksEmployee(row, employeeId) {
  return Boolean(employeeId) && row.resource_type === 'employee' && row.resource_id === employeeId;
}

/** First row blocking this staff member (leave, MC) on dateKey/session, or null. */
function staffBlock(employeeId, dateKey, session, rows = []) {
  return rows.find(r => rowCovers(r, dateKey, session) && rowBlocksEmployee(r, employeeId)) ?? null;
}

/**
 * A team as an id, or { id, kind, members: [{ id, name, role }] } (loadTeams).
 * Delivery: the driver is the member with role Driver. Installer: every member.
 */
function teamCrew(team) {
  if (!team || typeof team !== 'object') return { id: team ?? null, driver: null, installers: [] };
  const members = Array.isArray(team.members) ? team.members : [];
  if (team.kind === 'installer') return { id: team.id, driver: null, installers: members };
  return { id: team.id, driver: members.find(m => m.role === 'Driver') ?? null, installers: [] };
}

/**
 * Row blocking this team on dateKey/session, or null: a fleet or team row, the
 * driver's staff row (delivery), or — when every installer is out — the first
 * installer's staff row. A staff row comes back with `staff: { id, name, role }`.
 */
function teamBlock(team, dateKey, session, rows = []) {
  const crew = teamCrew(team);
  if (!crew.id) return null;
  const own = rows.find(r => rowCovers(r, dateKey, session) && rowBlocksTeam(r, crew.id));
  if (own) return own;
  if (crew.driver) {
    const row = staffBlock(crew.driver.id, dateKey, session, rows);
    if (row) return { ...row, staff: { id: crew.driver.id, name: crew.driver.name, role: crew.driver.role } };
  }
  if (crew.installers.length) {
    const out = crew.installers.map(m => ({ m, row: staffBlock(m.id, dateKey, session, rows) }));
    if (out.every(x => x.row)) return { ...out[0].row, staff: { id: out[0].m.id, name: out[0].m.name, role: out[0].m.role } };
  }
  return null;
}

/** Trucks not blocked on dateKey/session. */
function availableTruckCount(trucks, dateKey, session, rows) {
  return trucks.filter(t => !truckBlock(t, dateKey, session, rows)).length;
}

/**
 * Is the whole fleet unavailable in this session? Only true when there are
 * trucks and every one is blocked; with no trucks recorded nothing closes.
 */
function fleetClosed(trucks, dateKey, session, rows) {
  return trucks.length > 0 && availableTruckCount(trucks, dateKey, session, rows) === 0;
}

// ------------------------------------------------------------------ bookings

/**
 * Bookings that land on a blocked truck or team (a team counts as blocked when
 * its driver, or every installer, is on leave or MC — pass teams for that).
 * @param {Array<{date: string, session: string, truck_id?: string, team_id?: string}>} bookings
 * @param {Array<{id: string, tone: number|null}>} trucks
 * @param {Array<{id: string, kind: string, members: object[]}>} [teams]
 * @returns {Array<{booking: object, row: object}>}
 */
function affectedBookings(bookings, trucks, rows, teams = []) {
  const trucksById = new Map(trucks.map(t => [t.id, t]));
  const teamsById = new Map(teams.map(t => [t.id, t]));
  const out = [];
  for (const b of bookings) {
    if (!b?.date || !b?.session) continue;
    const truck = b.truck_id ? (trucksById.get(b.truck_id) ?? { id: b.truck_id, tone: null }) : null;
    const row = (truck && truckBlock(truck, b.date, b.session, rows)) || teamBlock(teamsById.get(b.team_id) ?? b.team_id, b.date, b.session, rows);
    if (row) out.push({ booking: b, row });
  }
  return out;
}

/** time_slots row → booking date/session ('YYYY-MM-DD', session id), or null. */
function slotDateSession(slot) {
  const session = sessionForWindow(slot?.time_window_start);
  const date = toDateKey(slot?.date);
  return session && isDateKey(date) ? { date, session } : null;
}

// ------------------------------------------------------------------ API shape

function rowToApi(row) {
  return {
    id: row.id,
    group_id: row.group_id,
    resource_type: row.resource_type,
    resource_id: row.resource_id ?? null,
    scope_value: row.scope_value ?? null,
    sessions: rowSessions(row),
    start_date: toDateKey(row.start_date),
    end_date: toDateKey(row.end_date),
    reason: row.reason,
    note: row.note ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? null,
  };
}

/** upcoming | started | past, relative to today (KL). */
function groupStatus(group, today) {
  if (group.end_date < today) return 'past';
  if (group.start_date <= today) return 'started';
  return 'upcoming';
}

/**
 * Rows → one entry per group_id. Dates, sessions, reason and note come from the
 * group's first row (they are the same for every row of a submission; ending a
 * group early changes all its rows together).
 */
function groupRows(rows, today) {
  const byGroup = new Map();
  for (const row of rows.map(rowToApi)) {
    if (!byGroup.has(row.group_id)) byGroup.set(row.group_id, []);
    byGroup.get(row.group_id).push(row);
  }
  return [...byGroup.entries()].map(([groupId, items]) => {
    const first = items[0];
    const group = {
      group_id: groupId,
      start_date: items.reduce((m, r) => (r.start_date < m ? r.start_date : m), first.start_date),
      end_date: items.reduce((m, r) => (r.end_date > m ? r.end_date : m), first.end_date),
      sessions: first.sessions,
      reason: first.reason,
      note: first.note,
      created_by: first.created_by,
      created_at: first.created_at,
      fleet: items.some(r => r.resource_type === 'fleet'),
      targets: items.map(r => ({ id: r.id, resource_type: r.resource_type, resource_id: r.resource_id, scope_value: r.scope_value })),
    };
    group.status = groupStatus(group, today);
    return group;
  }).sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
}

module.exports = {
  SESSIONS,
  BLOCKOFF_REASONS,
  RESOURCE_TYPES,
  MAX_DAYS,
  isDateKey,
  toDateKey,
  addDays,
  dayCount,
  klToday,
  klDateSession,
  toneKey,
  teamKind,
  validateBlockoffGroup,
  expandGroup,
  rowCovers,
  rowBlocksTruck,
  rowBlocksTeam,
  rowBlocksEmployee,
  truckBlock,
  staffBlock,
  teamBlock,
  availableTruckCount,
  fleetClosed,
  affectedBookings,
  slotDateSession,
  rowToApi,
  groupStatus,
  groupRows,
};
