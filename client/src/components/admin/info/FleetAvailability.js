import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Plus, X } from 'lucide-react';
import Button from '../../common/Button';
import { FOCUS_RING } from '../../common/tokens';
import AvailabilityGrid from './fleet/AvailabilityGrid';
import SlotPanel from './fleet/SlotPanel';
import BlockoffDialog from './fleet/BlockoffDialog';
import ImpactDialog from './fleet/ImpactDialog';
import BlockoffList from './fleet/BlockoffList';
import useFleetAdmin from './fleet/useFleetAdmin';
import {
  getResources, getBlockoffs, getBookings, previewBlockoff, createBlockoff,
  deleteBlockoffGroup, endBlockoffGroup, removeBlockoffTarget,
} from '../../../services/fleetAvailabilityApi';
import {
  addDays, buildGrid, formatRange, formatShort, groupLabel, plural, selectionSummary, sessionsText, toneKey, toneLabel,
} from '../../../utils/fleet/fleetRules';
import { todayLocalDateKey } from '../../../utils/dateKey';

const GRID_DAYS = 14;

/**
 * Information › Fleet Availability (B.4, FR-10-001..007).
 * Block every truck and team for a public holiday, block by truck type, truck
 * or team for a full day or a session, see availability for the next 14 days,
 * and block straight from one session's panel.
 */
export default function FleetAvailability() {
  const canEdit = useFleetAdmin();
  const [today, setToday] = useState(todayLocalDateKey());
  const [resources, setResources] = useState({ trucks: [], teams: [] });
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [pastGroups, setPastGroups] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [gridStart, setGridStart] = useState(null);
  const [listView, setListView] = useState('upcoming');
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(null); // 'all' | 'add'
  const [impact, setImpact] = useState(null); // { selection, summary, affected, onDone }
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null); // { text, tone, exceptions }

  const start = gridStart ?? today;

  const loadBase = useCallback(async () => {
    const [res, blk] = await Promise.all([getResources(), getBlockoffs()]);
    setToday(res.today || todayLocalDateKey());
    setResources({ trucks: res.trucks, teams: res.teams });
    setRows(blk.rows);
    setGroups(blk.groups.filter(g => g.status !== 'past'));
    setPastGroups(null);
    return res.today;
  }, []);

  const loadBookings = useCallback(async from => {
    setBookings(await getBookings({ from, to: addDays(from, GRID_DAYS - 1) }));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await loadBase();
        if (alive) await loadBookings(gridStart ?? t ?? todayLocalDateKey());
        if (alive) setLoadError(null);
      } catch (error) {
        if (alive) setLoadError(error.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loadBase, loadBookings, gridStart]);

  useEffect(() => {
    if (listView !== 'past' || pastGroups) return;
    getBlockoffs({ from: addDays(today, -365), to: addDays(today, -1) })
      .then(blk => setPastGroups(blk.groups.filter(g => g.status === 'past').reverse()))
      .catch(error => setNotice({ text: error.message, tone: 'error' }));
  }, [listView, pastGroups, today]);

  const refresh = useCallback(async () => {
    await loadBase();
    await loadBookings(start);
  }, [loadBase, loadBookings, start]);

  const grid = useMemo(
    () => buildGrid(resources.trucks, resources.teams, rows, start, GRID_DAYS),
    [resources, rows, start],
  );

  const fleetChips = useMemo(() => {
    const byTone = {};
    resources.trucks.forEach(t => { const k = toneKey(t.tone); byTone[k] = (byTone[k] ?? 0) + 1; });
    const tones = Object.keys(byTone).sort((a, b) => (a === 'unknown' ? 1 : b === 'unknown' ? -1 : Number(b) - Number(a)));
    return [
      ...tones.map(k => ({ n: byTone[k], label: k === 'unknown' ? 'unknown tonnage' : toneLabel(k) })),
      { n: resources.teams.filter(t => t.kind === 'delivery').length, label: 'delivery teams' },
      { n: resources.teams.filter(t => t.kind === 'installer').length, label: 'installer teams' },
    ];
  }, [resources]);

  // ---------------------------------------------------------------- saving

  const save = async (selection, onDone) => {
    const { group, affectedCount } = await createBlockoff(selection);
    const label = group.fleet ? 'all trucks and teams' : groupLabel(group, resources);
    setNotice({
      tone: 'success',
      exceptions: affectedCount > 0,
      text: `Blocked ${label}, ${formatRange(group.startDate, group.endDate)} · ${sessionsText(group.sessions)}. `
        + (affectedCount ? `${plural(affectedCount, 'booked order')} flagged under Exceptions › Fleet Blocked.` : 'No booked orders affected.'),
    });
    setImpact(null);
    setDialog(null);
    onDone?.();
    await refresh();
  };

  /** Impact check first; save straight away when nothing is booked. */
  const submit = async (selection, summary, onDone) => {
    setBusy(true);
    setServerError(null);
    try {
      const affected = await previewBlockoff(selection);
      const text = summary ?? `${selectionSummary(selection, resources)} · ${formatRange(selection.startDate, selection.endDate)}`;
      if (affected.length) setImpact({ selection, summary: text, affected, onDone });
      else await save(selection, onDone);
    } catch (error) {
      setServerError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmImpact = async () => {
    setBusy(true);
    setServerError(null);
    try { await save(impact.selection, impact.onDone); } catch (error) { setServerError(error.message); } finally { setBusy(false); }
  };

  const listAction = async (group, run, text) => {
    setBusyId(group.groupId);
    try {
      await run();
      setNotice({ text, tone: 'success' });
      await refresh();
    } catch (error) {
      setNotice({ text: error.message, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const listGroups = listView === 'past' ? (pastGroups ?? []) : groups;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_20rem]">
          <h2 className="text-lg font-semibold text-gray-900">Fleet Availability</h2>
          <p className="mt-1 text-sm text-gray-600">
            Block trucks or teams for public holidays, events, leave, MC or maintenance. Sessions with no truck left are not offered to customers in Odoo.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Plus} onClick={() => { setServerError(null); setDialog('add'); }}>Add block-off</Button>
            <Button icon={Ban} onClick={() => { setServerError(null); setDialog('all'); }}>Block all trucks and teams</Button>
          </div>
        )}
      </div>

      {!canEdit && (
        <p role="note" className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
          View only. Sign in as an Admin to add or remove block-offs.
        </p>
      )}

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-3 rounded-md border px-4 py-2.5 text-sm ${notice.tone === 'error' ? 'border-red-300 bg-red-50 text-red-800' : 'border-green-300 bg-green-50 text-green-900'}`}
        >
          <span className="flex-1">
            {notice.text}
            {notice.exceptions && <> <Link to="/exceptions/fleet-blocked" className="font-semibold underline">View in Exceptions</Link></>}
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className={`rounded p-0.5 hover:bg-black/5 ${FOCUS_RING}`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {loadError && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          Could not load fleet availability: {loadError}
        </p>
      )}

      <ul className="flex flex-wrap gap-2" aria-label="Fleet">
        {fleetChips.map(c => (
          <li key={c.label} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700">
            <span className="font-bold text-gray-900">{c.n}</span> × {c.label}
          </li>
        ))}
      </ul>

      <AvailabilityGrid
        grid={grid}
        loading={loading}
        selected={selected}
        onSelect={setSelected}
        rangeLabel={`${formatShort(start)} – ${formatShort(addDays(start, GRID_DAYS - 1))}`}
        canPrev={start > today}
        onPrev={() => { setSelected(null); setGridStart(addDays(start, -GRID_DAYS) < today ? today : addDays(start, -GRID_DAYS)); }}
        onNext={() => { setSelected(null); setGridStart(addDays(start, GRID_DAYS)); }}
      />

      <BlockoffList
        view={listView}
        onView={setListView}
        groups={listGroups}
        loading={loading || (listView === 'past' && !pastGroups)}
        trucks={resources.trucks}
        teams={resources.teams}
        canEdit={canEdit}
        busyId={busyId}
        onDelete={g => listAction(g, () => deleteBlockoffGroup(g.groupId), `Deleted block-off: ${groupLabel(g, resources)}, ${formatRange(g.startDate, g.endDate)}.`)}
        onEnd={g => listAction(g, () => endBlockoffGroup(g.groupId), `Ended early: ${groupLabel(g, resources)}. Everything it blocked is free from today.`)}
        onRemoveTarget={(g, t) => listAction(g, () => removeBlockoffTarget(t.id), 'Removed from the block-off.')}
      />

      {selected && (
        <SlotPanel
          key={`${selected.date}|${selected.session}`}
          date={selected.date}
          session={selected.session}
          trucks={resources.trucks}
          teams={resources.teams}
          rows={rows}
          bookings={bookings}
          canEdit={canEdit}
          busy={busy}
          serverError={dialog || impact ? null : serverError}
          suspended={Boolean(impact)}
          onClose={() => { setSelected(null); setServerError(null); }}
          onBlock={(selection, summary, onDone) => submit(selection, summary, onDone)}
        />
      )}

      {dialog && (
        <BlockoffDialog
          mode={dialog}
          today={today}
          trucks={resources.trucks}
          teams={resources.teams}
          busy={busy}
          serverError={impact ? null : serverError}
          suspended={Boolean(impact)}
          onCancel={() => { setDialog(null); setServerError(null); }}
          onSubmit={selection => submit(selection, null)}
        />
      )}

      {impact && (
        <ImpactDialog
          affected={impact.affected}
          summary={impact.summary}
          trucks={resources.trucks}
          teams={resources.teams}
          busy={busy}
          serverError={serverError}
          onBack={() => { setImpact(null); setServerError(null); }}
          onConfirm={confirmImpact}
        />
      )}
    </div>
  );
}
