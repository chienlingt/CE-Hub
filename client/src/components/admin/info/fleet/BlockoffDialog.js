import React, { useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import FleetDialog from './FleetDialog';
import Button from '../../../common/Button';
import { FOCUS_RING } from '../../../common/tokens';
import {
  REASONS, SESSIONS, SESSION_IDS, matchTeam, matchTruck, plural, selectionSummary, teamStaffText, toneKey, toneLabel,
  validateSelection,
} from '../../../../utils/fleet/fleetRules';

const SEG_ON = 'bg-white font-semibold text-gray-900 shadow-sm';
const SEG_OFF = 'text-gray-700 hover:text-gray-900';
const CHIP = 'inline-flex min-h-[2.5rem] cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 text-sm';
const INPUT = `block h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-normal ${FOCUS_RING}`;

const keysOn = obj => Object.keys(obj).filter(k => obj[k]);

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
 * mode "add": block truck types, specific trucks or teams.
 * Submitting runs the impact check in the parent (onSubmit).
 */
export default function BlockoffDialog({ mode, today, trucks, teams, busy, serverError, suspended, onCancel, onSubmit }) {
  const isAll = mode === 'all';
  const defaultDate = today;
  const [scope, setScope] = useState('truck_type');
  const [types, setTypes] = useState({});
  const [pickedTrucks, setPickedTrucks] = useState({});
  const [pickedTeams, setPickedTeams] = useState({});
  const [truckSearch, setTruckSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [fullDay, setFullDay] = useState(true);
  const [sessions, setSessions] = useState({});
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [reason, setReason] = useState(isAll ? 'public_holiday' : 'maintenance');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState([]);

  const clearErrors = () => setErrors([]);
  const selection = {
    fleet: isAll,
    truckTypes: !isAll && scope === 'truck_type' ? keysOn(types) : [],
    trucks: !isAll && scope === 'truck' ? keysOn(pickedTrucks) : [],
    teams: !isAll && scope === 'team' ? keysOn(pickedTeams) : [],
    startDate, endDate,
    sessions: fullDay ? SESSION_IDS : SESSION_IDS.filter(s => sessions[s]),
    reason, note: note.trim(),
  };
  const resources = { trucks, teams };

  const toneKeys = [...new Set(trucks.map(t => toneKey(t.tone)))]
    .sort((a, b) => (a === 'unknown' ? 1 : b === 'unknown' ? -1 : Number(b) - Number(a)));
  const shownTrucks = trucks.filter(t => matchTruck(t, truckSearch));
  const allTrucksShown = shownTrucks.length > 0 && shownTrucks.every(t => pickedTrucks[t.id]);
  const teamMatches = teams.map(t => ({ team: t, match: matchTeam(t, teamSearch) })).filter(x => x.match.hit);
  const allTeamsShown = teamMatches.length > 0 && teamMatches.every(x => pickedTeams[x.team.id]);

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
    const on = Boolean(pickedTeams[team.id]);
    return (
      <label key={team.id} className={`mb-1 flex min-h-[2.75rem] cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 ${on ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
        <input
          type="checkbox" checked={on} className="mt-0.5 h-4 w-4 flex-none accent-blue-600"
          onChange={() => { setPickedTeams(p => ({ ...p, [team.id]: !p[team.id] })); clearErrors(); }}
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">{team.name}</span>
          <span className="block text-xs leading-snug text-gray-600">{teamStaffText(team)}</span>
          {match.staff.length > 0 && <span className="block text-xs text-blue-800">Matches {match.staff.join(', ')}</span>}
        </span>
      </label>
    );
  };
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
              {[['truck_type', 'Truck type'], ['truck', 'Specific trucks'], ['team', 'Team']].map(([id, label]) => (
                <button
                  key={id} type="button" aria-pressed={scope === id} onClick={() => { setScope(id); clearErrors(); }}
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
              <div className="flex flex-wrap gap-2">
                {toneKeys.map(k => (
                  <label key={k} className={CHIP}>
                    <input
                      type="checkbox" checked={Boolean(types[k])} className="h-4 w-4 accent-blue-600"
                      onChange={() => { setTypes(p => ({ ...p, [k]: !p[k] })); clearErrors(); }}
                    />
                    {toneLabel(k)} ({trucks.filter(t => toneKey(t.tone) === k).length})
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {scope === 'truck' && (
            <fieldset className="space-y-2">
              <legend className="sr-only">Trucks</legend>
              <div className="flex flex-wrap items-end gap-3">
                <SearchBox label="Search car plate or tonnage" value={truckSearch} onChange={setTruckSearch} placeholder="e.g. WXA or 3-ton" />
                <SelectAll
                  checked={allTrucksShown}
                  label={`${truckSearch.trim() ? 'Select all matches' : 'Select all'} (${shownTrucks.length})`}
                  onChange={() => {
                    setPickedTrucks(p => { const n = { ...p }; shownTrucks.forEach(t => { n[t.id] = !allTrucksShown; }); return n; });
                    clearErrors();
                  }}
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200 p-2">
                {shownTrucks.length === 0 && <p className="p-2 text-sm text-gray-600">No trucks match.</p>}
                <div className="flex flex-wrap gap-1">
                  {shownTrucks.map(t => (
                    <label key={t.id} className="inline-flex min-h-[2.25rem] w-40 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-gray-50">
                      <input
                        type="checkbox" checked={Boolean(pickedTrucks[t.id])} className="h-4 w-4 accent-blue-600"
                        onChange={() => { setPickedTrucks(p => ({ ...p, [t.id]: !p[t.id] })); clearErrors(); }}
                      />
                      {t.plate} <span className="text-gray-500">· {t.tone ? `${t.tone}t` : '?'}</span>
                    </label>
                  ))}
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
                  label={`${teamSearch.trim() ? 'Select all matches' : 'Select all teams'} (${teamMatches.length})`}
                  onChange={() => {
                    setPickedTeams(p => { const n = { ...p }; teamMatches.forEach(x => { n[x.team.id] = !allTeamsShown; }); return n; });
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
        </div>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-gray-900">Session</legend>
        <div className="flex flex-wrap gap-2">
          <label className={`${CHIP} font-semibold`}>
            <input
              type="checkbox" checked={fullDay} className="h-4 w-4 accent-blue-600"
              onChange={() => { setFullDay(f => !f); setSessions({}); clearErrors(); }}
            />
            Full day
          </label>
          {SESSIONS.map(s => (
            <label key={s.id} className={CHIP}>
              <input type="checkbox" checked={!fullDay && Boolean(sessions[s.id])} onChange={() => toggleSession(s.id)} className="h-4 w-4 accent-blue-600" />
              {s.label} <span className="text-gray-600">{s.start}–{s.end}</span>
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
