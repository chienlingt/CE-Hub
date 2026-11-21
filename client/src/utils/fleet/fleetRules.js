// B.4 Fleet Availability rules, client side. Mirrors the matching rules in
// server/services/fleetAvailabilitySpec.js — keep the two in step (the tests use
// the same cases).
//
// A block-off row covers, for startDate..endDate and its sessions:
//   fleet       every truck and every team, including ones added later
//   truck_type  every truck whose tonnage key (toneKey) equals scopeValue
//   truck       one truck (resourceId)
//   team        one team (resourceId), delivery or installer
//   employee    one staff member (resourceId), for leave or MC. A delivery
//               team whose driver is out is blocked; an installer team is
//               blocked when every installer is out. Otherwise the team stays
//               available but short-staffed.

export const SESSIONS = [
  { id: 'morning', label: 'Morning', start: '10:00', end: '13:00' },
  { id: 'afternoon', label: 'Afternoon', start: '14:00', end: '17:00' },
  { id: 'evening', label: 'Evening', start: '17:00', end: '19:00' },
];
export const SESSION_IDS = SESSIONS.map(s => s.id);
const SESSION_BY_ID = Object.fromEntries(SESSIONS.map(s => [s.id, s]));

export const REASONS = [
  { id: 'public_holiday', label: 'Public holiday' },
  { id: 'event', label: 'Event' },
  { id: 'leave', label: 'Leave' },
  { id: 'mc', label: 'MC' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'other', label: 'Other' },
];
const REASON_LABEL = Object.fromEntries(REASONS.map(r => [r.id, r.label]));
export const reasonLabel = id => REASON_LABEL[id] ?? 'Blocked';

export const sessionLabel = id => SESSION_BY_ID[id]?.label ?? id;

/**
 * Session of a slot window start ("HH:MM"): the first session not yet ended,
 * so 09:00 is still morning. null after 19:00 or without a start. Same rule as
 * server/services/odooAppointmentSessions.js sessionForWindow.
 */
export function sessionForStart(start) {
  if (!start) return null;
  const hhmm = String(start).slice(0, 5);
  return SESSIONS.find(s => hhmm < s.end)?.id ?? null;
}
export const sessionTime = id => (SESSION_BY_ID[id] ? `${SESSION_BY_ID[id].start}–${SESSION_BY_ID[id].end}` : '');

// ------------------------------------------------------------------ dates

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utc = key => new Date(`${key}T00:00:00Z`);

export function addDays(dateKey, days) {
  const d = utc(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const dayCount = (from, to) => Math.round((utc(to) - utc(from)) / 86400000) + 1;
export const weekday = key => utc(key).getUTCDay();
export const formatDay = key => { const d = utc(key); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const formatShort = key => { const d = utc(key); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const formatRange = (from, to) => (from === to ? formatDay(from) : `${formatShort(from)} – ${formatShort(to)}`);

// ------------------------------------------------------------------ resources

/** Tonnage key for truck_type matching: "1", "3", or "unknown" when tone is missing. */
export const toneKey = tone => (Number.isInteger(tone) ? String(tone) : 'unknown');
export const toneLabel = key => (key === 'unknown' ? 'Unknown tonnage' : `${key}-ton`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export { plural };

/** Lower-cased with spaces removed, so "wxa1234" finds "WXA 1234". */
export const normalizeSearch = text => String(text ?? '').toLowerCase().replace(/\s+/g, '');

/** Staff line for a team: "Driver A · Assistant B · WXA 1234" or "A · B" for installers. */
export function teamStaffText(team) {
  const members = team?.members ?? [];
  const names = team?.kind === 'installer'
    ? members.map(m => m.name)
    : members.map(m => (m.role === 'Driver' || m.role === 'Assistant' ? `${m.role} ${m.name}` : m.name));
  if (team?.truck?.plate) names.push(team.truck.plate);
  return names.length ? names.join(' · ') : 'No staff assigned';
}

/** Does a search match this team by its name or any staff name? Returns matched staff. */
export function matchTeam(team, query) {
  const q = normalizeSearch(query);
  if (!q) return { hit: true, staff: [] };
  const nameHit = normalizeSearch(team.name).includes(q);
  const staff = (team.members ?? []).filter(m => normalizeSearch(m.name).includes(q)).map(m => m.name);
  return { hit: nameHit || staff.length > 0, staff: nameHit ? [] : staff };
}

/**
 * Everyone on a team, once each, with the teams they are on:
 * [{ id, name, teams: [{ id, name, kind, role }] }], sorted by name.
 */
export function staffList(teams = []) {
  const byId = new Map();
  teams.forEach(team => (team.members ?? []).forEach(m => {
    if (!byId.has(m.id)) byId.set(m.id, { id: m.id, name: m.name, teams: [] });
    byId.get(m.id).teams.push({ id: team.id, name: team.name, kind: team.kind, role: m.role });
  }));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const matchStaff = (person, query) => {
  const q = normalizeSearch(query);
  return !q || normalizeSearch(person.name).includes(q) || person.teams.some(t => normalizeSearch(t.name).includes(q));
};

export const matchTruck = (truck, query) => {
  const q = normalizeSearch(query);
  return !q || normalizeSearch(truck.plate).includes(q) || normalizeSearch(toneLabel(truck.toneKey)).includes(q);
};

// ------------------------------------------------------------------ matching

const rowSessions = row => (Array.isArray(row?.sessions) && row.sessions.length ? row.sessions : SESSION_IDS);

/** Does this row apply on dateKey in session? Without a session only a full-day row counts. */
export function rowCovers(row, dateKey, session) {
  if (!row || dateKey < row.startDate || dateKey > row.endDate) return false;
  const sessions = rowSessions(row);
  return session ? sessions.includes(session) : SESSION_IDS.every(s => sessions.includes(s));
}

export function rowBlocksTruck(row, truck) {
  if (!truck) return false;
  switch (row.resourceType) {
    case 'fleet': return true;
    case 'truck_type': return row.scopeValue === toneKey(truck.tone);
    case 'truck': return row.resourceId === truck.id;
    default: return false;
  }
}

export const rowBlocksTeam = (row, teamId) =>
  Boolean(teamId) && (row.resourceType === 'fleet' || (row.resourceType === 'team' && row.resourceId === teamId));

export const truckBlock = (truck, dateKey, session, rows = []) =>
  (Array.isArray(rows) ? rows : []).find(r => rowCovers(r, dateKey, session) && rowBlocksTruck(r, truck)) ?? null;

export const rowBlocksEmployee = (row, employeeId) =>
  Boolean(employeeId) && row.resourceType === 'employee' && row.resourceId === employeeId;

/** Row putting this staff member on leave or MC on dateKey/session, or null. */
export const staffBlock = (employeeId, dateKey, session, rows = []) =>
  (Array.isArray(rows) ? rows : []).find(r => rowCovers(r, dateKey, session) && rowBlocksEmployee(r, employeeId)) ?? null;

/**
 * A team's crew from either shape: Fleet Availability teams
 * ({ kind, members: [{ id, name, role }] }) or schedule teams
 * ({ type, primaryDriverId, memberIds }). A bare id has no crew.
 */
function teamCrew(team) {
  if (!team || typeof team !== 'object') return { id: team ?? null, driver: null, installers: [], members: [] };
  if (Array.isArray(team.members)) {
    const members = team.members;
    if (team.kind === 'installer') return { id: team.id, driver: null, installers: members, members };
    return { id: team.id, driver: members.find(m => m.role === 'Driver') ?? null, installers: [], members };
  }
  const installer = team.type != null && !String(team.type).toLowerCase().includes('delivery');
  const ids = [...new Set([team.primaryDriverId, team.assistantDriverId, ...(team.memberIds ?? [])].filter(Boolean))];
  const members = ids.map(id => ({ id, name: null, role: id === team.primaryDriverId ? 'Driver' : 'Member' }));
  if (installer) return { id: team.id, driver: null, installers: members, members };
  return { id: team.id, driver: team.primaryDriverId ? members[0] : null, installers: [], members };
}

const withStaff = (row, m) => ({ ...row, staff: { id: m.id, name: m.name, role: m.role } });

/**
 * Row blocking this team on dateKey/session, or null: a fleet or team row, the
 * driver's leave/MC (delivery), or every installer's (installer). A staff row
 * comes back with `staff: { id, name, role }`. Pass the team object, not just
 * its id, for the staff rules to apply.
 */
export function teamBlock(team, dateKey, session, rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const crew = teamCrew(team);
  if (!crew.id) return null;
  const own = list.find(r => rowCovers(r, dateKey, session) && rowBlocksTeam(r, crew.id));
  if (own) return own;
  if (crew.driver) {
    const row = staffBlock(crew.driver.id, dateKey, session, list);
    if (row) return withStaff(row, crew.driver);
  }
  if (crew.installers.length) {
    const out = crew.installers.map(m => ({ m, row: staffBlock(m.id, dateKey, session, list) }));
    if (out.every(x => x.row)) return withStaff(out[0].row, out[0].m);
  }
  return null;
}

/** Staff out on dateKey/session while their team still runs: [{ member, row }]. */
export function teamShortStaff(team, dateKey, session, rows = []) {
  if (teamBlock(team, dateKey, session, rows)) return [];
  return teamCrew(team).members
    .map(member => ({ member, row: staffBlock(member.id, dateKey, session, rows) }))
    .filter(x => x.row);
}

/** "Maintenance: Gearbox service", or "MC (Driver Razif): fever" when a staff member takes the team out. */
export const blockText = row => {
  if (!row) return '';
  const who = row.staff?.name ? ` (${row.staff.role} ${row.staff.name})` : '';
  return `${reasonLabel(row.reason)}${who}${row.note ? `: ${row.note}` : ''}`;
};

/**
 * Per-session counts for the 14-day grid.
 * level: ok (nothing blocked), some (something blocked), none (no truck left — Odoo closes it).
 */
export function sessionSummary(trucks, teams, rows, dateKey, session) {
  const trucksAvailable = trucks.filter(t => !truckBlock(t, dateKey, session, rows)).length;
  const teamsAvailable = teams.filter(t => !teamBlock(t, dateKey, session, rows)).length;
  let level = 'ok';
  if (trucks.length && trucksAvailable === 0) level = 'none';
  else if (trucksAvailable < trucks.length || teamsAvailable < teams.length) level = 'some';
  return { trucksAvailable, trucksTotal: trucks.length, teamsAvailable, teamsTotal: teams.length, level };
}

export function buildGrid(trucks, teams, rows, fromKey, days = 14) {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(fromKey, i);
    return { date, sessions: SESSION_IDS.map(session => ({ session, ...sessionSummary(trucks, teams, rows, date, session) })) };
  });
}

// ------------------------------------------------------------------ window status

/** Every date × session in from..to. Empty when the range is missing, backwards or over 366 days. */
export function windowSlots(from, to, sessions) {
  if (!from || !to || to < from || !(sessions ?? []).length || dayCount(from, to) > 366) return [];
  const slots = [];
  for (let d = from; d <= to; d = addDays(d, 1)) sessions.forEach(session => slots.push({ date: d, session }));
  return slots;
}

function windowStatus(slots, blockAt, bookings, mine, shortAt) {
  let blockedSlots = 0;
  let block = null;
  slots.forEach(({ date, session }) => {
    const row = blockAt(date, session);
    if (row) { blockedSlots += 1; block = block ?? row; }
  });
  const keys = new Set(slots.map(s => `${s.date}|${s.session}`));
  const orders = (bookings ?? []).filter(b => mine(b) && keys.has(`${b.date}|${b.session}`)).length;
  const state = blockedSlots === 0 ? 'available' : blockedSlots === slots.length ? 'blocked' : 'partly';
  const short = new Map();
  if (shortAt) slots.forEach(({ date, session }) => shortAt(date, session).forEach(x => short.set(x.member.id, x)));
  const shortStaff = [...short.values()].map(({ member, row }) => ({ name: member.name, reason: row.reason }));
  return { state, blockedSlots, totalSlots: slots.length, block, orders, shortStaff };
}

/**
 * A truck's or team's status over a window of slots (see windowSlots):
 * { state: available | partly | blocked, blockedSlots, totalSlots, block (first row hit), orders }.
 */
export const truckWindowStatus = (truck, slots, rows, bookings) =>
  windowStatus(slots, (d, s) => truckBlock(truck, d, s, rows), bookings, b => b.truckId === truck.id);

/** team is the team object (for the driver/installer rules); also lists who is out while it still runs. */
export const teamWindowStatus = (team, slots, rows, bookings) =>
  windowStatus(slots, (d, s) => teamBlock(team, d, s, rows), bookings, b => b.teamId === team.id,
    (d, s) => teamShortStaff(team, d, s, rows));

export const staffWindowStatus = (employeeId, slots, rows) =>
  windowStatus(slots, (d, s) => staffBlock(employeeId, d, s, rows), [], () => false);

/** "Available", "2 orders booked", "Partly blocked · 2 of 3 sessions", "Blocked · Maintenance: Gearbox" */
export function windowStatusText(status) {
  const parts = [];
  if (status.state === 'blocked') parts.push(`Blocked · ${blockText(status.block)}`);
  else if (status.state === 'partly') parts.push(`Partly blocked · ${status.blockedSlots} of ${plural(status.totalSlots, 'session')}`);
  if (status.orders) parts.push(`${plural(status.orders, 'order')} booked`);
  if (status.state !== 'blocked' && status.shortStaff?.length) {
    parts.push(`Short-staffed: ${status.shortStaff.map(x => `${x.name} on ${reasonLabel(x.reason)}`).join(', ')}`);
  }
  return parts.join(' · ') || 'Available';
}

// ------------------------------------------------------------------ labels

export const sessionsText = sessions => {
  const list = SESSION_IDS.filter(s => (sessions ?? []).includes(s));
  if (list.length === SESSION_IDS.length) return 'Full day';
  return list.length ? list.map(sessionLabel).join(', ') : 'No session picked';
};

/**
 * Short name of a block-off group: "All trucks and teams", "3-ton (20 trucks)",
 * "WXA 1234", "3 trucks", "Delivery Team A", "2 trucks and 1 team".
 */
export function groupLabel(group, { trucks = [], teams = [] } = {}) {
  if (group.fleet) return 'All trucks and teams';
  const targets = group.targets ?? [];
  const types = targets.filter(t => t.resourceType === 'truck_type');
  const truckRows = targets.filter(t => t.resourceType === 'truck');
  const teamRows = targets.filter(t => t.resourceType === 'team');
  const staffRows = targets.filter(t => t.resourceType === 'employee');
  const parts = [];
  if (types.length) {
    const keys = types.map(t => t.scopeValue);
    const n = trucks.filter(t => keys.includes(toneKey(t.tone))).length;
    parts.push(`${keys.map(toneLabel).join(', ')} (${plural(n, 'truck')})`);
  }
  if (truckRows.length === 1 && !types.length && !teamRows.length) {
    parts.push(trucks.find(t => t.id === truckRows[0].resourceId)?.plate ?? '1 truck');
  } else if (truckRows.length) parts.push(plural(truckRows.length, 'truck'));
  if (teamRows.length === 1 && !types.length && !truckRows.length) {
    parts.push(teams.find(t => t.id === teamRows[0].resourceId)?.name ?? '1 team');
  } else if (teamRows.length) parts.push(plural(teamRows.length, 'team'));
  if (staffRows.length === 1 && !types.length && !truckRows.length && !teamRows.length) {
    parts.push(staffName(staffRows[0].resourceId, teams) ?? '1 staff member');
  } else if (staffRows.length) parts.push(plural(staffRows.length, 'staff member'));
  return parts.join(' and ') || 'Nothing';
}

const staffName = (id, teams = []) => {
  for (const team of teams) {
    const m = (team.members ?? []).find(x => x.id === id);
    if (m) return m.name;
  }
  return null;
};

/** One chip per target of a group, for the expanded list row. */
export function targetLabel(target, { trucks = [], teams = [] } = {}) {
  switch (target.resourceType) {
    case 'fleet': return 'All trucks and teams';
    case 'truck_type': return toneLabel(target.scopeValue);
    case 'truck': return trucks.find(t => t.id === target.resourceId)?.plate ?? 'Removed truck';
    case 'team': return teams.find(t => t.id === target.resourceId)?.name ?? 'Removed team';
    case 'employee': return staffName(target.resourceId, teams) ?? 'Removed staff member';
    default: return 'Unknown';
  }
}

/** Counts a submission would block: { trucks, teams, staff } (fleet counts every truck and team). */
export function selectionCounts(selection, { trucks = [], teams = [] } = {}) {
  if (selection.fleet) return { trucks: trucks.length, teams: teams.length, staff: 0 };
  const typeKeys = selection.truckTypes ?? [];
  const ids = new Set(selection.trucks ?? []);
  const blockedTrucks = trucks.filter(t => ids.has(t.id) || typeKeys.includes(toneKey(t.tone))).length;
  return { trucks: blockedTrucks, teams: (selection.teams ?? []).length, staff: (selection.staff ?? []).length };
}

/** "Blocks 20 trucks and 1 team · Morning · 2 days" */
export function selectionSummary(selection, resources) {
  const { trucks, teams, staff } = selectionCounts(selection, resources);
  let what;
  if (selection.fleet) what = `Blocks all ${plural(trucks, 'truck')} and ${plural(teams, 'team')}`;
  else if (!trucks && !teams && !staff) what = 'Nothing picked yet';
  else {
    const parts = [trucks && plural(trucks, 'truck'), teams && plural(teams, 'team'), staff && plural(staff, 'staff member')];
    what = `Blocks ${parts.filter(Boolean).join(' and ')}`;
  }
  const days = selection.startDate && selection.endDate && selection.endDate >= selection.startDate
    ? dayCount(selection.startDate, selection.endDate) : 0;
  return [what, sessionsText(selection.sessions), days ? plural(days, 'day') : null].filter(Boolean).join(' · ');
}

/** Same checks as the server, so most mistakes show before saving. */
export function validateSelection(selection, today) {
  const errors = [];
  const { startDate, endDate } = selection;
  if (!startDate || !endDate) errors.push('Pick a start and end date.');
  else {
    if (today && startDate < today) errors.push('The start date cannot be in the past.');
    if (endDate < startDate) errors.push('The end date must be on or after the start date.');
    else if (dayCount(startDate, endDate) > 366) errors.push('A block-off can cover at most 366 days.');
  }
  const anyTarget = selection.fleet
    || (selection.truckTypes ?? []).length || (selection.trucks ?? []).length || (selection.teams ?? []).length
    || (selection.staff ?? []).length;
  if (!anyTarget) errors.push('Pick at least one truck type, truck, team or staff member.');
  if (!(selection.sessions ?? []).length) errors.push('Pick Full day or at least one session.');
  if (selection.reason === 'other' && !String(selection.note ?? '').trim()) errors.push('Add a note when the reason is Other.');
  return errors;
}
