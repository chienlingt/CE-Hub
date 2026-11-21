import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import SlideOver from '../../../common/SlideOver';
import Button from '../../../common/Button';
import { FOCUS_RING } from '../../../common/tokens';
import {
  REASONS, SESSION_IDS, blockText, formatDay, matchTeam, matchTruck, plural, sessionLabel, sessionTime,
  teamBlock, toneKey, toneLabel, truckBlock,
} from '../../../../utils/fleet/fleetRules';

const SEG_ON = 'bg-white font-semibold text-gray-900 shadow-sm';
const SEG_OFF = 'text-gray-700 hover:text-gray-900';
const TILE = 'group relative inline-flex w-40 min-h-[3.5rem] flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left align-top';

function Segmented({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md bg-gray-200 p-1">
      {options.map(o => (
        <button
          key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={`min-h-[2rem] rounded px-3 text-sm ${value === o.id ? SEG_ON : SEG_OFF} ${FOCUS_RING}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Tile({ tile, canEdit, onToggle }) {
  const blocked = Boolean(tile.block);
  const pickable = canEdit && !blocked;
  const tone = blocked ? 'border border-dashed border-gray-400 bg-gray-100 text-gray-600'
    : tile.picked ? 'border-2 border-blue-600 bg-blue-50 text-blue-900'
      : 'border border-gray-300 bg-white text-gray-900';
  const statusTone = blocked ? 'text-red-700' : (tile.picked || tile.orders) ? 'text-blue-700' : 'text-green-700';
  const status = blocked ? blockText(tile.block)
    : tile.picked ? 'Selected to block'
      : tile.orders ? `${plural(tile.orders, 'order')} booked` : 'Available';

  const body = (
    <>
      <span className={`text-sm font-semibold ${blocked ? 'line-through' : ''}`}>{tile.label}</span>
      <span className={`text-xs ${statusTone}`}>{status}</span>
      {blocked && tile.orders > 0 && <span className="text-xs font-semibold text-red-800">{plural(tile.orders, 'order')} to reschedule</span>}
      {tile.matchedStaff && <span className="text-xs text-gray-700">Staff: {tile.matchedStaff}</span>}
      {tile.tip && (
        <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 hidden w-max max-w-[16rem] whitespace-pre-line rounded-md bg-gray-900 px-2.5 py-2 text-xs font-normal leading-relaxed text-white shadow-lg group-hover:block group-focus-visible:block">
          {tile.tip}
        </span>
      )}
    </>
  );

  if (pickable) {
    return (
      <button
        type="button" onClick={onToggle} aria-pressed={tile.picked}
        aria-label={`${tile.picked ? 'Unselect' : 'Select'} ${tile.label}${tile.tip ? ` (${tile.tip.replace(/\n/g, ', ')})` : ''} to block`}
        className={`${TILE} ${tone} cursor-pointer ${FOCUS_RING}`}
      >
        {body}
      </button>
    );
  }
  // Not pickable: still focusable when it has staff to show, so keyboard users get the tooltip.
  return (
    <span className={`${TILE} ${tone} ${tile.tip ? FOCUS_RING : ''}`} tabIndex={tile.tip ? 0 : undefined}>
      {body}
    </span>
  );
}

function Group({ title, tiles, availableCount, total, canEdit, selectLabel, onSelectAll, onToggle }) {
  if (!tiles.length) return null;
  return (
    <div className="mb-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">
          {title} <span className="font-normal text-gray-600">· {availableCount} of {total} available</span>
        </p>
        {canEdit && onSelectAll && (
          <button type="button" onClick={onSelectAll} className={`rounded px-2 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50 ${FOCUS_RING}`}>
            {selectLabel}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {tiles.map(t => <Tile key={t.id} tile={t} canEdit={canEdit} onToggle={() => onToggle(t.id)} />)}
      </div>
    </div>
  );
}

const teamTip = team => {
  const lines = team.kind === 'installer'
    ? [team.members.length ? `Installers: ${team.members.map(m => m.name).join(', ')}` : 'No installers assigned']
    : (team.members.length ? team.members.map(m => `${m.role}: ${m.name}`) : ['No staff assigned']);
  if (team.truck?.plate) lines.push(`Truck: ${team.truck.plate}`);
  return lines.join('\n');
};

/**
 * Every truck and team in one date + session: available, booked or blocked.
 * An admin ticks available ones and blocks them for this session or the whole day.
 */
export default function SlotPanel({ date, session, trucks, teams, rows, bookings, canEdit, busy, serverError, suspended, onClose, onBlock }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState({ trucks: {}, teams: {} });
  const [wholeDay, setWholeDay] = useState(false);
  const [reason, setReason] = useState('maintenance');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState([]);

  const slotBookings = useMemo(
    () => bookings.filter(b => b.date === date && b.session === session),
    [bookings, date, session],
  );

  const show = blocked => filter === 'all' || (filter === 'blocked' ? blocked : !blocked);

  const truckItems = trucks.map(t => ({
    id: t.id, label: t.plate, toneKey: toneKey(t.tone), block: truckBlock(t, date, session, rows),
    orders: slotBookings.filter(b => b.truckId === t.id).length, picked: Boolean(picked.trucks[t.id]),
    hit: matchTruck(t, search),
  }));
  const teamItems = teams.map(t => {
    const m = matchTeam(t, search);
    return {
      id: t.id, label: t.name, kind: t.kind, block: teamBlock(t.id, date, session, rows),
      orders: slotBookings.filter(b => b.teamId === t.id).length, picked: Boolean(picked.teams[t.id]),
      hit: m.hit, matchedStaff: m.staff.join(', '), tip: teamTip(t),
    };
  });

  const toggle = (bag, id) => {
    setPicked(p => ({ ...p, [bag]: { ...p[bag], [id]: !p[bag][id] } }));
    setErrors([]);
  };

  const groupProps = (bag, items) => {
    const visible = items.filter(i => i.hit && show(Boolean(i.block)));
    const selectable = items.filter(i => i.hit && !i.block);
    const allPicked = selectable.length > 0 && selectable.every(i => i.picked);
    return {
      tiles: visible,
      availableCount: items.filter(i => !i.block).length,
      total: items.length,
      selectLabel: allPicked ? 'Clear' : (search.trim() ? 'Select all matches' : 'Select all available'),
      onSelectAll: selectable.length && filter !== 'blocked'
        ? () => setPicked(p => {
          const next = { ...p[bag] };
          selectable.forEach(i => { next[i.id] = !allPicked; });
          return { ...p, [bag]: next };
        })
        : null,
      onToggle: id => toggle(bag, id),
    };
  };

  const tones = [...new Set(trucks.map(t => toneKey(t.tone)))]
    .sort((a, b) => (a === 'unknown' ? 1 : b === 'unknown' ? -1 : Number(b) - Number(a)));
  const truckGroups = tones.map(k => ({ key: k, title: toneLabel(k), ...groupProps('trucks', truckItems.filter(i => i.toneKey === k)) }));
  const teamGroups = [['delivery', 'Delivery teams'], ['installer', 'Installer teams']]
    .map(([kind, title]) => ({ key: kind, title, ...groupProps('teams', teamItems.filter(i => i.kind === kind)) }));
  const nothingShown = ![...truckGroups, ...teamGroups].some(g => g.tiles.length);

  const trucksAvailable = truckItems.filter(i => !i.block).length;
  const teamsAvailable = teamItems.filter(i => !i.block).length;
  const pickedTrucks = Object.keys(picked.trucks).filter(id => picked.trucks[id]);
  const pickedTeams = Object.keys(picked.teams).filter(id => picked.teams[id]);
  const pickCount = pickedTrucks.length + pickedTeams.length;
  const pickSummary = `Block ${[pickedTrucks.length && plural(pickedTrucks.length, 'truck'), pickedTeams.length && plural(pickedTeams.length, 'team')].filter(Boolean).join(' and ')} · ${formatDay(date)} · ${wholeDay ? 'Full day' : `${sessionLabel(session)} (${sessionTime(session)})`}`;

  const submit = () => {
    if (reason === 'other' && !note.trim()) { setErrors(['Add a note when the reason is Other.']); return; }
    onBlock({
      fleet: false, truckTypes: [], trucks: pickedTrucks, teams: pickedTeams,
      startDate: date, endDate: date, sessions: wholeDay ? SESSION_IDS : [session], reason, note: note.trim(),
    }, pickSummary, () => { setPicked({ trucks: {}, teams: {} }); setNote(''); });
  };

  const footer = canEdit && pickCount > 0 ? (
    <div className="space-y-3">
      <p aria-live="polite" className="text-sm font-semibold text-gray-900">{pickSummary}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-gray-700">Block for</p>
          <Segmented
            label="Block for" value={wholeDay ? 'whole' : 'only'} onChange={v => setWholeDay(v === 'whole')}
            options={[{ id: 'only', label: `Only ${sessionLabel(session)}` }, { id: 'whole', label: 'Whole day' }]}
          />
        </div>
        <label className="text-xs font-medium text-gray-700">
          Reason
          <select
            value={reason} onChange={e => { setReason(e.target.value); setErrors([]); }}
            className={`mt-1 block h-10 rounded-md border border-gray-300 bg-white px-2 text-sm font-normal ${FOCUS_RING}`}
          >
            {REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label className="min-w-[10rem] flex-1 text-xs font-medium text-gray-700">
          {reason === 'other' ? 'Note (required)' : 'Note (optional)'}
          <input
            type="text" value={note} maxLength={300} onChange={e => { setNote(e.target.value); setErrors([]); }}
            placeholder="e.g. Tyre change"
            className={`mt-1 block h-10 w-full rounded-md border border-gray-300 px-3 text-sm font-normal ${FOCUS_RING}`}
          />
        </label>
      </div>
      {(errors[0] || serverError) && <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{errors[0] || serverError}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => setPicked({ trucks: {}, teams: {} })} disabled={busy}>Clear selection</Button>
        <Button onClick={submit} disabled={busy}>{busy ? 'Checking…' : 'Block selected'}</Button>
      </div>
    </div>
  ) : null;

  return (
    <SlideOver
      open={!suspended}
      onClose={onClose}
      title={`${formatDay(date)} · ${sessionLabel(session)}`}
      subtitle={`${sessionTime(session)} · ${trucksAvailable} of ${trucks.length} trucks · ${teamsAvailable} of ${teams.length} teams available`}
      width="sm:w-[640px]"
      footer={footer}
    >
      <div className="space-y-3 pb-2">
        {trucks.length > 0 && trucksAvailable === 0 && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">No trucks left. This session is closed in Odoo.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented
            label="Show" value={filter} onChange={setFilter}
            options={[{ id: 'all', label: 'All' }, { id: 'available', label: 'Available' }, { id: 'blocked', label: 'Blocked' }]}
          />
          {canEdit && <span className="text-xs text-gray-600">Tap available trucks or teams to block them.</span>}
        </div>
        <label className="block text-xs font-medium text-gray-700">
          Search
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Car plate, team or staff name"
              className={`block h-10 w-full rounded-md border border-gray-300 pl-9 pr-3 text-sm font-normal ${FOCUS_RING}`}
            />
          </span>
        </label>
        <p className="text-xs text-gray-600">Hover over or focus a team to see its staff.</p>
      </div>

      {truckGroups.some(g => g.tiles.length) && <h3 className="mb-2 mt-2 text-sm font-bold text-gray-900">Trucks</h3>}
      {truckGroups.map(({ key, ...g }) => <Group key={key} canEdit={canEdit} {...g} />)}
      {teamGroups.some(g => g.tiles.length) && <h3 className="mb-2 mt-2 text-sm font-bold text-gray-900">Teams</h3>}
      {teamGroups.map(({ key, ...g }) => <Group key={key} canEdit={canEdit} {...g} />)}
      {nothingShown && (
        <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
          {search.trim() ? `No truck, team or staff matches “${search.trim()}”.`
            : filter === 'blocked' ? 'Nothing is blocked in this session.' : 'Nothing is available in this session.'}
        </p>
      )}
    </SlideOver>
  );
}
