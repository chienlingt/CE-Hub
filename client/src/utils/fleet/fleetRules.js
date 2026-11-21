// B.4 Fleet Availability rules, client side. Mirrors the matching rules in
// server/services/fleetAvailabilitySpec.js — keep the two in step (the tests use
// the same cases).
//
// A block-off row covers, for startDate..endDate and its sessions:
//   fleet       every truck and every team, including ones added later
//   truck_type  every truck whose tonnage key (toneKey) equals scopeValue
//   truck       one truck (resourceId)
//   team        one team (resourceId), delivery or installer

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

export const teamBlock = (teamId, dateKey, session, rows = []) =>
  (Array.isArray(rows) ? rows : []).find(r => rowCovers(r, dateKey, session) && rowBlocksTeam(r, teamId)) ?? null;

/** "Maintenance: Gearbox service" */
export const blockText = row => (row ? `${reasonLabel(row.reason)}${row.note ? `: ${row.note}` : ''}` : '');

/**
 * Per-session counts for the 14-day grid.
 * level: ok (nothing blocked), some (something blocked), none (no truck left — Odoo closes it).
 */
export function sessionSummary(trucks, teams, rows, dateKey, session) {
  const trucksAvailable = trucks.filter(t => !truckBlock(t, dateKey, session, rows)).length;
  const teamsAvailable = teams.filter(t => !teamBlock(t.id, dateKey, session, rows)).length;
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
  return parts.join(' and ') || 'Nothing';
}

/** One chip per target of a group, for the expanded list row. */
export function targetLabel(target, { trucks = [], teams = [] } = {}) {
  switch (target.resourceType) {
    case 'fleet': return 'All trucks and teams';
    case 'truck_type': return toneLabel(target.scopeValue);
    case 'truck': return trucks.find(t => t.id === target.resourceId)?.plate ?? 'Removed truck';
    case 'team': return teams.find(t => t.id === target.resourceId)?.name ?? 'Removed team';
    default: return 'Unknown';
  }
}

/** Counts a submission would block: { trucks, teams } (fleet counts everything). */
export function selectionCounts(selection, { trucks = [], teams = [] } = {}) {
  if (selection.fleet) return { trucks: trucks.length, teams: teams.length };
  const typeKeys = selection.truckTypes ?? [];
  const ids = new Set(selection.trucks ?? []);
  const blockedTrucks = trucks.filter(t => ids.has(t.id) || typeKeys.includes(toneKey(t.tone))).length;
  return { trucks: blockedTrucks, teams: (selection.teams ?? []).length };
}

/** "Blocks 20 trucks and 1 team · Morning · 2 days" */
export function selectionSummary(selection, resources) {
  const { trucks, teams } = selectionCounts(selection, resources);
  let what;
  if (selection.fleet) what = `Blocks all ${plural(trucks, 'truck')} and ${plural(teams, 'team')}`;
  else if (!trucks && !teams) what = 'Nothing picked yet';
  else what = `Blocks ${[trucks && plural(trucks, 'truck'), teams && plural(teams, 'team')].filter(Boolean).join(' and ')}`;
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
    || (selection.truckTypes ?? []).length || (selection.trucks ?? []).length || (selection.teams ?? []).length;
  if (!anyTarget) errors.push('Pick at least one truck type, truck or team.');
  if (!(selection.sessions ?? []).length) errors.push('Pick Full day or at least one session.');
  if (selection.reason === 'other' && !String(selection.note ?? '').trim()) errors.push('Add a note when the reason is Other.');
  return errors;
}
