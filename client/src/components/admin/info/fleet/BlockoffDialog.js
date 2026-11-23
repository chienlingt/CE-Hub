import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import FleetDialog from './FleetDialog';
import Button from '../../../common/Button';
import { FOCUS_RING } from '../../../common/tokens';
import { getBookings } from '../../../../services/fleetAvailabilityApi';
import {
  REASONS, SESSIONS, SESSION_IDS, addDays, dayCount, matchStaff, matchTeam, matchTruck, plural, selectionSummary,
  staffList, staffWindowStatus, teamStaffText, teamWindowStatus, toneKey, toneLabel, truckWindowStatus,
  validateSelection, windowSlots, windowStatusText,
} from '../../../../utils/fleet/fleetRules';

// GET /bookings answers at most 62 days at a time; orders further out are not counted.
const BOOKING_DAYS = 62;

const SEG_ON = 'bg-white font-semibold text-gray-900 shadow-sm';
const SEG_OFF = 'text-gray-700 hover:text-gray-900';
const CHIP = 'inline-flex min-h-[2.5rem] cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 text-sm';
const INPUT = `block h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-normal ${FOCUS_RING}`;

const keysOn = obj => Object.keys(obj).filter(k => obj[k]);

const STATUS_TONE = { blocked: 'text-red-700', partly: 'text-amber-800', available: 'text-green-700' };
const statusTone = st => (st.state === 'available' && st.orders ? 'text-blue-700' : STATUS_TONE[st.state]);

/** All / Available / Blocked. Partly blocked shows under both. */
const FILTERS = [['all', 'All'], ['available', 'Available'], ['blocked', 'Blocked']];
const passesFilter = (filter, st) => filter === 'all'
  || (filter === 'available' ? st.state !== 'blocked' : st.state !== 'available');

function FilterBar({ value, onChange }) {
  return (
    <div role="group" aria-label="Show" className="inline-flex rounded-md bg-gray-200 p-1">
      {FILTERS.map(([id, label]) => (
        <button
          key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}
          className={`min-h-[2rem] rounded px-3 text-sm ${value === id ? SEG_ON : SEG_OFF} ${FOCUS_RING}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ label, value, onChange, placeholder }) {
  return (
    <label className="block flex-1 text-xs font-medium text-gray-700">
      {label}
      <span className="relative mt-1 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`${INPUT} pl-9`} />
      </span>
    </label>
  );
}

function SelectAll({ checked, onChange, label }) {
  return (
    <label className="inline-flex min-h-[2.5rem] cursor-pointer items-center gap-2 text-sm text-gray-800">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-blue-600" />
      {label}
    </label>
  );
}

/**
 * mode "all": block every truck and team (public holidays).
 * mode "add": block truck types, specific trucks, teams or staff (leave/MC). A
 * delivery team whose driver is out is blocked; an installer team is blocked
 * when every installer is out; otherwise the team is short-staffed. Each truck and team
 * shows its status (available, booked, partly or fully blocked) for the dates
 * and sessions currently picked. initialDate/initialSession prefill the window
 * when opened from a grid cell.
 * Submitting runs the impact check in the parent (onSubmit).
 */
export default function BlockoffDialog({
  mode, today, trucks, teams, rows = [], initialDate, initialSession, busy, serverError, suspended, onCancel, onSubmit,
}) {
  const isAll = mode === 'all';
  const defaultDate = initialDate ?? today;
  const [scope, setScope] = useState('truck_type');
  const [types, setTypes] = useState({});
  const [pickedTrucks, setPickedTrucks] = useState({});
  const [pickedTeams, setPickedTeams] = useState({});
  const [pickedStaff, setPickedStaff] = useState({});
  const [truckSearch, setTruckSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [fullDay, setFullDay] = useState(!initialSession);
  const [sessions, setSessions] = useState(initialSession ? { [initialSession]: true } : {});
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [reason, setReason] = useState(isAll ? 'public_holiday' : 'maintenance');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState([]);
  const [filter, setFilter] = useState('all');
  const [bookings, setBookings] = useState([]);

  const clearErrors = () => setErrors([]);
  const pickedSessions = fullDay ? SESSION_IDS : SESSION_IDS.filter(s => sessions[s]);
  const slots = useMemo(
    () => (isAll ? [] : windowSlots(startDate, endDate, pickedSessions)),
    // pickedSessions is rebuilt every render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAll, startDate, endDate, pickedSessions.join()],
  );

  // Bookings for the picked dates, so each truck and team can show its orders.
  useEffect(() => {
    if (isAll || !startDate || !endDate || endDate < startDate) { setBookings([]); return undefined; }
    let alive = true;
    const to = dayCount(startDate, endDate) > BOOKING_DAYS ? addDays(startDate, BOOKING_DAYS - 1) : endDate;
    getBookings({ from: startDate, to })
      .then(list => { if (alive) setBookings(list ?? []); })
      .catch(() => { if (alive) setBookings([]); });
    return () => { alive = false; };
  }, [isAll, startDate, endDate]);

  const truckStatus = useMemo(
    () => Object.fromEntries(trucks.map(t => [t.id, truckWindowStatus(t, slots, rows, bookings)])),
    [trucks, slots, rows, bookings],
  );
  const teamStatus = useMemo(
    () => Object.fromEntries(teams.map(t => [t.id, teamWindowStatus(t, slots, rows, bookings)])),
    [teams, slots, rows, bookings],
  );
  const staff = useMemo(() => staffList(teams), [teams]);
  const staffStatus = useMemo(
    () => Object.fromEntries(staff.map(p => [p.id, staffWindowStatus(p.id, slots, rows)])),
    [staff, slots, rows],
  );
  const fullyBlocked = st => st?.state === 'blocked';

  const selection = {
    fleet: isAll,
    truckTypes: !isAll && scope === 'truck_type' ? keysOn(types) : [],
    // A pick that the current window fully blocks is left out (nothing left to block).
    trucks: !isAll && scope === 'truck' ? keysOn(pickedTrucks).filter(id => !fullyBlocked(truckStatus[id])) : [],
    teams: !isAll && scope === 'team' ? keysOn(pickedTeams).filter(id => !fullyBlocked(teamStatus[id])) : [],
    staff: !isAll && scope === 'staff' ? keysOn(pickedStaff).filter(id => !fullyBlocked(staffStatus[id])) : [],
    startDate, endDate,
    sessions: pickedSessions,
    reason, note: note.trim(),
  };
  const resources = { trucks, teams };

  const toneKeys = [...new Set(trucks.map(t => toneKey(t.tone)))]
    .sort((a, b) => (a === 'unknown' ? 1 : b === 'unknown' ? -1 : Number(b) - Number(a)));
  const shownTrucks = trucks.filter(t => matchTruck(t, truckSearch) && passesFilter(filter, truckStatus[t.id]));
  const pickableTrucks = shownTrucks.filter(t => !fullyBlocked(truckStatus[t.id]));
  const allTrucksShown = pickableTrucks.length > 0 && pickableTrucks.every(t => pickedTrucks[t.id]);
  const teamMatches = teams.map(t => ({ team: t, match: matchTeam(t, teamSearch) }))
    .filter(x => x.match.hit && passesFilter(filter, teamStatus[x.team.id]));
  const pickableTeams = teamMatches.filter(x => !fullyBlocked(teamStatus[x.team.id]));
  const allTeamsShown = pickableTeams.length > 0 && pickableTeams.every(x => pickedTeams[x.team.id]);
  const shownStaff = staff.filter(p => matchStaff(p, staffSearch) && passesFilter(filter, staffStatus[p.id]));

  const toggleSession = id => {
    const next = { ...(fullDay ? {} : sessions), [id]: !(fullDay ? false : sessions[id]) };
    if (SESSION_IDS.every(s => next[s])) { setFullDay(true); setSessions({}); }
    else { setFullDay(false); setSessions(next); }
    clearErrors();
  };

  const submit = () => {
    const found = validateSelection(selection, today);
    if (found.length) { setErrors(found); return; }
    onSubmit(selection);
  };

  const teamOption = ({ team, match }) => {
    const st = teamStatus[team.id];
    const blocked = fullyBlocked(st);
    const on = !blocked && Boolean(pickedTeams[team.id]);
    const look = blocked ? 'cursor-not-allowed border border-dashed border-gray-400 bg-gray-100'
      : on ? 'cursor-pointer bg-blue-50' : 'cursor-pointer hover:bg-gray-50';
    return (
      <label key={team.id} className={`mb-1 flex min-h-[2.75rem] items-start gap-2.5 rounded-md px-2.5 py-2 ${look}`}>
        <input
          type="checkbox" checked={on} disabled={blocked} className="mt-0.5 h-4 w-4 flex-none accent-blue-600"
          onChange={() => { setPickedTeams(p => ({ ...p, [team.id]: !p[team.id] })); clearErrors(); }}
        />
        <span className="min-w-0">
          <span className={`block text-sm font-semibold ${blocked ? 'text-gray-600 line-through' : 'text-gray-900'}`}>{team.name}</span>
          <span className={`block text-xs ${statusTone(st)}`}>{windowStatusText(st)}</span>
          <span className="block text-xs leading-snug text-gray-600">{teamStaffText(team)}</span>
          {match.staff.length > 0 && <span className="block text-xs text-blue-800">Matches {match.staff.join(', ')}</span>}
        </span>
      </label>
    );
  };
  const truckOption = t => {
    const st = truckStatus[t.id];
    const blocked = fullyBlocked(st);
    const on = !blocked && Boolean(pickedTrucks[t.id]);
    const look = blocked ? 'cursor-not-allowed border border-dashed border-gray-400 bg-gray-100'
      : on ? 'cursor-pointer bg-blue-50' : 'cursor-pointer hover:bg-gray-50';
    return (
      <label key={t.id} className={`inline-flex min-h-[2.75rem] w-48 items-start gap-2 rounded px-2 py-1.5 text-sm ${look}`}>
        <input
          type="checkbox" checked={on} disabled={blocked} className="mt-0.5 h-4 w-4 flex-none accent-blue-600"
          onChange={() => { setPickedTrucks(p => ({ ...p, [t.id]: !p[t.id] })); clearErrors(); }}
        />
        <span className="min-w-0">
          <span className={`block ${blocked ? 'text-gray-600 line-through' : ''}`}>
            {t.plate} <span className="text-gray-500">· {t.tone ? `${t.tone}t` : '?'}</span>
          </span>
          <span className={`block text-xs ${statusTone(st)}`}>{windowStatusText(st)}</span>
        </span>
      </label>
    );
  };
  /** What blocking this person does to their team(s), so the admin knows before saving. */
  const staffEffect = person => person.teams.map(t => {
    if (t.kind === 'installer') {
      const crew = teams.find(x => x.id === t.id)?.members ?? [];
      return crew.length <= 1 ? `${t.name} is blocked (only installer)` : `${t.name} stays available unless every installer is out`;
    }
    return t.role === 'Driver' ? `Driver: ${t.name} is blocked too` : `${t.role} in ${t.name}: team stays available, short-staffed`;
  }).join(' · ') || 'Not on a team';
  const staffOption = person => {
    const st = staffStatus[person.id];
    const blocked = fullyBlocked(st);
    const on = !blocked && Boolean(pickedStaff[person.id]);
    const look = blocked ? 'cursor-not-allowed border border-dashed border-gray-400 bg-gray-100'
      : on ? 'cursor-pointer bg-blue-50' : 'cursor-pointer hover:bg-gray-50';
    return (
      <label key={person.id} className={`mb-1 flex min-h-[2.75rem] items-start gap-2.5 rounded-md px-2.5 py-2 ${look}`}>
        <input
          type="checkbox" checked={on} disabled={blocked} className="mt-0.5 h-4 w-4 flex-none accent-blue-600"
          onChange={() => { setPickedStaff(p => ({ ...p, [person.id]: !p[person.id] })); clearErrors(); }}
        />
        <span className="min-w-0">
          <span className={`block text-sm font-semibold ${blocked ? 'text-gray-600 line-through' : 'text-gray-900'}`}>{person.name}</span>
          <span className={`block text-xs ${statusTone(st)}`}>{windowStatusText(st)}</span>
          <span className="block text-xs leading-snug text-gray-600">{staffEffect(person)}</span>
        </span>
      </label>
    );
  };
  const emptyText = (what, search) => (search.trim() ? `No ${what} match.`
    : filter === 'blocked' ? `No ${what} blocked in this time.` : `No ${what} available in this time.`);
  const deliveryMatches = teamMatches.filter(x => x.team.kind === 'delivery');
  const installerMatches = teamMatches.filter(x => x.team.kind === 'installer');

  const shownErrors = errors.length ? errors : (serverError ? [serverError] : []);

  return (
    <FleetDialog
      open={!suspended}
      title={isAll ? 'Block all trucks and teams' : 'Add block-off'}
      onClose={onCancel}
      footer={(
        <div className="flex flex-wrap items-center gap-3">
          <p aria-live="polite" className="min-w-[14rem] flex-1 text-sm font-semibold text-gray-900">{selectionSummary(selection, resources)}</p>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Checking…' : 'Check impact'}</Button>
        </div>
      )}
    >
      {isAll && (
        <div role="note" className="flex gap-3 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <span>
            Blocks all {plural(trucks.length, 'truck')} and {plural(teams.length, 'team')}, installer teams included.
            Trucks and teams added later are blocked too.
          </span>
        </div>
      )}

      {!isAll && (
        <div className="space-y-3">
          <div>
            <p id="fleet-scope-label" className="mb-1.5 text-sm font-semibold text-gray-900">Block</p>
            <div role="group" aria-labelledby="fleet-scope-label" className="inline-flex flex-wrap rounded-md bg-gray-200 p-1">
              {[['truck_type', 'Truck type'], ['truck', 'Specific trucks'], ['team', 'Team'], ['staff', 'Staff']].map(([id, label]) => (
                <button
                  key={id} type="button" aria-pressed={scope === id} onClick={() => { setScope(id); if (id === 'staff' && reason === 'maintenance') setReason('mc'); clearErrors(); }}
                  className={`min-h-[2.25rem] rounded px-3 text-sm ${scope === id ? SEG_ON : SEG_OFF} ${FOCUS_RING}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {scope === 'truck_type' && (
            <fieldset>
              <legend className="mb-1.5 text-xs text-gray-600">Truck types. Trucks added later with this tonnage are included.</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {toneKeys.map(k => {
                  const ofType = trucks.filter(t => toneKey(t.tone) === k);
                  const free = ofType.filter(t => truckStatus[t.id]?.state === 'available').length;
                  return (
                    <label key={k} className={`${CHIP} py-1.5`}>
                      <input
                        type="checkbox" checked={Boolean(types[k])} className="h-4 w-4 flex-none accent-blue-600"
                        onChange={() => { setTypes(p => ({ ...p, [k]: !p[k] })); clearErrors(); }}
                      />
                      <span className="leading-tight">
                        {toneLabel(k)}
                        <span className="block text-xs text-gray-500">{free} of {ofType.length} available</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {scope !== 'truck_type' && <FilterBar value={filter} onChange={setFilter} />}

          {scope === 'truck' && (
            <fieldset className="space-y-2">
              <legend className="sr-only">Trucks</legend>
              <div className="flex flex-wrap items-end gap-3">
                <SearchBox label="Search car plate or tonnage" value={truckSearch} onChange={setTruckSearch} placeholder="e.g. WXA or 3-ton" />
                <SelectAll
                  checked={allTrucksShown}
                  label={`${truckSearch.trim() ? 'Select all matches' : 'Select all'} (${pickableTrucks.length})`}
                  onChange={() => {
                    setPickedTrucks(p => { const n = { ...p }; pickableTrucks.forEach(t => { n[t.id] = !allTrucksShown; }); return n; });
                    clearErrors();
                  }}
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200 p-2">
                {shownTrucks.length === 0 && <p className="p-2 text-sm text-gray-600">{emptyText('trucks', truckSearch)}</p>}
                <div className="flex flex-wrap gap-1">
                  {shownTrucks.map(truckOption)}
                </div>
              </div>
            </fieldset>
          )}

          {scope === 'team' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <SearchBox label="Search team or staff name" value={teamSearch} onChange={setTeamSearch} placeholder="e.g. Delivery Team A or Hafiz" />
                <SelectAll
                  checked={allTeamsShown}
                  label={`${teamSearch.trim() ? 'Select all matches' : 'Select all teams'} (${pickableTeams.length})`}
                  onChange={() => {
                    setPickedTeams(p => { const n = { ...p }; pickableTeams.forEach(x => { n[x.team.id] = !allTeamsShown; }); return n; });
                    clearErrors();
                  }}
                />
              </div>
              <div className="flex max-h-80 flex-wrap gap-4 overflow-y-auto rounded-md border border-gray-200 p-2">
                <fieldset className="min-w-0 flex-[1_1_16rem]">
                  <legend className="mb-1 px-2.5 text-xs font-semibold text-gray-700">Delivery teams</legend>
                  {deliveryMatches.length ? deliveryMatches.map(teamOption) : <p className="px-2.5 py-2 text-sm text-gray-600">No delivery team matches.</p>}
                </fieldset>
                <fieldset className="min-w-0 flex-[1_1_14rem]">
                  <legend className="mb-1 px-2.5 text-xs font-semibold text-gray-700">Installer teams</legend>
                  {installerMatches.length ? installerMatches.map(teamOption) : <p className="px-2.5 py-2 text-sm text-gray-600">No installer team matches.</p>}
                </fieldset>
              </div>
            </div>
          )}

          {scope === 'staff' && (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-xs text-gray-600">
                For leave or MC. A driver out blocks their delivery team; anyone else leaves the team short-staffed.
                An installer team is blocked when every installer is out.
              </legend>
              <SearchBox label="Search staff or team name" value={staffSearch} onChange={setStaffSearch} placeholder="e.g. Hafiz or Delivery Team A" />
              <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200 p-2">
                {shownStaff.length ? shownStaff.map(staffOption) : <p className="p-2 text-sm text-gray-600">{emptyText('staff', staffSearch)}</p>}
              </div>
            </fieldset>
          )}
        </div>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-gray-900">Session</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className={`${CHIP} font-semibold`}>
            <input
              type="checkbox" checked={fullDay} className="h-4 w-4 flex-none accent-blue-600"
              onChange={() => { setFullDay(f => !f); setSessions({}); clearErrors(); }}
            />
            Full day
          </label>
          {SESSIONS.map(s => (
            <label key={s.id} className={`${CHIP} py-1.5`}>
              <input type="checkbox" checked={!fullDay && Boolean(sessions[s.id])} onChange={() => toggleSession(s.id)} className="h-4 w-4 flex-none accent-blue-600" />
              <span className="leading-tight">
                {s.label}
                <span className="block text-xs text-gray-500">{s.start}–{s.end}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-gray-900">
          From
          <input
            type="date" min={today} value={startDate} className={`mt-1 ${INPUT}`}
            onChange={e => { const v = e.target.value; setStartDate(v); if (endDate < v) setEndDate(v); clearErrors(); }}
          />
        </label>
        <label className="text-sm font-semibold text-gray-900">
          To
          <input type="date" min={startDate || today} value={endDate} className={`mt-1 ${INPUT}`} onChange={e => { setEndDate(e.target.value); clearErrors(); }} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-gray-900">
          Reason
          <select value={reason} onChange={e => { setReason(e.target.value); clearErrors(); }} className={`mt-1 ${INPUT}`}>
            {REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-900">
          {reason === 'other' ? 'Note (required)' : 'Note (optional)'}
          <input
            type="text" value={note} maxLength={300} className={`mt-1 ${INPUT}`}
            placeholder={isAll ? 'e.g. Christmas Day' : 'e.g. Gearbox service'}
            onChange={e => { setNote(e.target.value); clearErrors(); }}
          />
        </label>
      </div>

      {shownErrors.length > 0 && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {shownErrors.map(e => <p key={e}>{e}</p>)}
        </div>
      )}
    </FleetDialog>
  );
}
