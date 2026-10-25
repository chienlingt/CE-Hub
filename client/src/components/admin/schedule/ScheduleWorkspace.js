// ScheduleWorkspace — the B.1 dispatcher workspace.
//
// Three view modes behind ?view=, because they are the same data at different
// altitudes rather than different features:
//   board the Today board — the DEFAULT: one day, every lorry x slot, DO
//         blocks, the unscheduled tray, approve and drag (plan B0)
//   exec  the top-down architectural dashboard (7-day calendar + summaries)
//   grid  the Excel-mirror grid Mr Lee knows — export and print (a week)
//
// The scheduler is run from the Engine page, never from here.
//
// Every piece of demo state is URL-addressable (?view, ?date, ?slot, ?order,
// ?lorry, ?exceptions, ?scenario, ?data), following the LiveDeliveries.js
// precedent, so a walkthrough is reproducible from bookmarks.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar, LayoutGrid, Table2, AlertTriangle, ShieldAlert,
  RefreshCw, ChevronLeft, ChevronRight, Printer,
} from 'lucide-react';

import ScheduleProvider, { useScheduleState, useScheduleActions } from './ScheduleProvider';
import ExecDashboard from './exec/ExecDashboard';
import TodayBoard from './board/TodayBoard';
import ExcelGrid from './grid/ExcelGrid';
import GridExportButton from './grid/GridExportButton';
import ExceptionDrawer from './exceptions/ExceptionDrawer';

import Button from '../../common/Button';
import EmptyState from '../../common/EmptyState';
import ResultModal from '../../common/ResultModal';
import { badgeClass, FOCUS_RING } from '../../common/tokens';

import { todayLocalDateKey } from '../../../utils/dateKey';
import { addDays, rangeLabel, startOfWorkWeek } from '../../../utils/schedule/weekRange';
import {
  selectDaySummaries, selectKpis, selectConstraintPressure,
  selectExceptionGroups, selectGridMatrix, selectTrayBlocks, effectiveSlotId,
} from '../../../utils/schedule/scheduleSelectors';

export const VIEW_MODES = [
  { id: 'board', label: 'Today',        icon: LayoutGrid },
  { id: 'exec',  label: 'Exec',         icon: Calendar   },
  { id: 'grid',  label: 'Grid (Excel)', icon: Table2     },
];

const VIEW_IDS = VIEW_MODES.map(v => v.id);
const DEFAULT_VIEW = 'board';
const VIEW_STORAGE_KEY = 'ce.schedule.view';

function readStoredView() {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return VIEW_IDS.includes(stored) ? stored : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

function writeStoredView(view) {
  try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* ignore */ }
}

function WorkspaceInner() {
  const state = useScheduleState();
  const actions = useScheduleActions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [commitResult, setCommitResult] = useState(null);

  // Retired views (week, day) land on the Board rather than a blank tab.
  const rawView = searchParams.get('view');
  const view = VIEW_IDS.includes(rawView) ? rawView : readStoredView();
  const dateKey = searchParams.get('date') || todayLocalDateKey();
  const boardParams = {
    order: searchParams.get('order'),
    lorry: searchParams.get('lorry'),
    slot: searchParams.get('slot'),
  };
  const exceptionsOpen = searchParams.get('exceptions') === '1';
  const focusCode = searchParams.get('code');

  const setParams = useCallback((updates, options) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === undefined) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, options);
  }, [searchParams, setSearchParams]);

  // Keep the URL canonical so every state is shareable. replace:true so
  // normalising the view does not add a history entry to tab back through.
  useEffect(() => {
    if (rawView !== view) setParams({ view }, { replace: true });
  }, [rawView, view, setParams]);

  const selectView = useCallback((next) => {
    writeStoredView(next);
    setParams({ view: next });
  }, [setParams]);

  const shiftWeek = useCallback((weeks) => {
    setParams({ date: addDays(startOfWorkWeek(dateKey), weeks * 7) });
  }, [dateKey, setParams]);

  // --- derived data. One pass per render, shared by every view. -------------
  const ready = state.status === 'ready';

  const summaries = useMemo(() => (ready ? selectDaySummaries(state) : []), [state, ready]);
  const kpis = useMemo(() => (ready ? selectKpis(state, summaries) : []), [state, summaries, ready]);
  const constraintPressure = useMemo(
    () => (ready ? selectConstraintPressure(state, summaries) : []), [state, summaries, ready]);
  const unscheduledCount = useMemo(() => (ready ? selectTrayBlocks(state).length : 0), [state, ready]);
  const exceptionGroups = useMemo(
    () => (ready && exceptionsOpen ? selectExceptionGroups(state) : []), [state, ready, exceptionsOpen]);
  const gridMatrix = useMemo(
    () => (ready && view === 'grid' ? selectGridMatrix(state) : null), [state, ready, view]);

  // --- handlers -------------------------------------------------------------
  // Exec and Grid drill into the Board, which hosts every drawer.
  const openOrder = useCallback(
    (orderId) => setParams({ view: 'board', order: orderId, exceptions: null }), [setParams]);

  const openSlot = useCallback((slotId) => {
    const slot = state.entities.slots.byId[slotId];
    setParams({ view: 'board', slot: slotId, date: slot?.dateKey ?? dateKey });
  }, [state.entities.slots.byId, setParams, dateKey]);

  // The exception drawer's "place here" saves at once, as a Board drop does.
  const assignNow = useCallback(async (orderId, slotId) => {
    const fromSlotId = effectiveSlotId(state, orderId);
    actions.stageMove(orderId, slotId);
    const result = await actions.commitDraft([{ orderId, fromSlotId, toSlotId: slotId, toIndex: null }]);
    if (result.rejected.length) {
      actions.unstageMove(orderId);
      setCommitResult({ type: 'error', title: 'Not placed', message: result.rejected.map(r => r.message).join(' ') });
    }
  }, [state, actions]);

  const handleKpiAction = useCallback((action) => {
    if (action === 'exceptions') setParams({ exceptions: '1' });
    else if (action === 'approval') navigate('/schedule/approval');
    else if (action === 'settings') navigate('/schedule/settings');
  }, [setParams, navigate]);

  // --- chrome ---------------------------------------------------------------
  const header = (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900">Schedule</h1>
          {state.source === 'mock' && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass('amber')}`}>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Mock data
              {state.scenario && state.scenario !== 'normal' && <span>· {state.scenario}</span>}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] tabular-nums text-gray-400">
            {state.asOf ? `as of ${new Date(state.asOf).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}` : ''}
            {state.draft.committing && <span className="ml-1 text-amber-600">· saving…</span>}
          </span>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={actions.refresh}>
            Refresh
          </Button>
          <Button
            variant="secondary" size="sm" icon={AlertTriangle}
            onClick={() => setParams({ exceptions: '1' })}
          >
            {unscheduledCount > 0 ? (
              <span className="tabular-nums">{unscheduledCount} unscheduled</span>
            ) : 'Exceptions'}
          </Button>
        </div>
      </div>

      {state.liveBlocked && (
        <div
          role="status"
          className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Live data refused.</strong> This is a demo build with
            authentication bypassed, and its API base URL points at production. Showing mock data instead.
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div role="tablist" aria-label="Schedule view" className="flex flex-wrap gap-1">
          {VIEW_MODES.map(({ id, label, icon: Icon }) => {
            const active = id === view;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectView(id)}
                className={[
                  'inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors',
                  FOCUS_RING,
                  active
                    ? 'border-blue-600 bg-blue-50 font-medium text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        {view !== 'board' && <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-md border border-gray-200 bg-white">
            <button
              type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week"
              className={`px-1.5 py-1 text-gray-500 hover:bg-gray-50 ${FOCUS_RING}`}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="px-2 text-xs tabular-nums text-gray-700">
              {rangeLabel(state.range.startDateKey, state.range.endDateKey) || '—'}
            </span>
            <button
              type="button" onClick={() => shiftWeek(1)} aria-label="Next week"
              className={`px-1.5 py-1 text-gray-500 hover:bg-gray-50 ${FOCUS_RING}`}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {view === 'grid' && gridMatrix && (
            <>
              <GridExportButton
                matrix={gridMatrix}
                rangeLabel={rangeLabel(state.range.startDateKey, state.range.endDateKey)}
              />
              <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
                Print
              </Button>
            </>
          )}

        </div>}
      </div>

    </>
  );

  // --- body ----------------------------------------------------------------
  let body;
  if (state.status === 'loading' || state.status === 'idle') {
    body = (
      <div className="space-y-2" aria-busy="true">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-md border border-gray-200 bg-gray-50" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-md border border-gray-200 bg-gray-50" />
      </div>
    );
  } else if (state.status === 'error') {
    body = (
      <EmptyState
        title="Could not load the schedule"
        description={state.error}
        action={<Button icon={RefreshCw} onClick={actions.reload}>Retry</Button>}
      />
    );
  } else if (view === 'board') {
    // The Board handles its own empty day, so it is checked before the week.
    body = (
      <TodayBoard
        state={state}
        actions={actions}
        dateKey={dateKey}
        params={boardParams}
        setParams={setParams}
      />
    );
  } else if (!state.entities.slots.allIds.length) {
    body = (
      <EmptyState
        icon={Calendar}
        title="No time slots for this week"
        description="The auto-scheduler generates slots from the Engine page."
      />
    );
  } else if (view === 'exec') {
    body = (
      <ExecDashboard
        summaries={summaries}
        kpis={kpis}
        constraintPressure={constraintPressure}
        selectedDateKey={dateKey}
        onDrillDown={key => setParams({ view: 'board', date: key, slot: null })}
        onSelectSlot={(key, slotId) => setParams({ view: 'board', date: key, slot: slotId })}
        onKpiAction={handleKpiAction}
        onSelectCode={code => setParams({ exceptions: '1', code })}
      />
    );
  } else if (view === 'grid') {
    body = (
      <div className="print-schedule">
        <ExcelGrid
          matrix={gridMatrix}
          productsById={state.entities.products.byId}
          onOpenSlot={openSlot}
          onOpenOrder={openOrder}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {header}
      {body}

      <ExceptionDrawer
        open={exceptionsOpen}
        onClose={() => setParams({ exceptions: null, code: null })}
        groups={exceptionGroups}
        focusCode={focusCode}
        autoRun={state.autoRun}
        onAssign={assignNow}
        onOpenOrder={openOrder}
      />

      <ResultModal
        open={Boolean(commitResult)}
        type={commitResult?.type}
        title={commitResult?.title}
        message={commitResult?.message}
        onClose={() => setCommitResult(null)}
      />
    </div>
  );
}

export default function ScheduleWorkspace() {
  return (
    <ScheduleProvider>
      <WorkspaceInner />
    </ScheduleProvider>
  );
}
