// ScheduleWorkspace — the Schedule page, which is now one screen: the Board.
//
// One day, every lorry x slot, DO blocks, the unscheduled tray, approve and
// drag (plan B0); each slot's header shows the room left. Grid (Excel) and
// Exec were retired: the Board covers their daily use. The scheduler is run
// from the Engine page, never from here.
//
// Salespeople see it read-only — they set the expected date in Odoo. Editing
// (drag, approve, reject, move) needs the `schedule_edit` permission.
//
// Every piece of demo state is URL-addressable (?date, ?slot, ?order, ?lorry,
// ?exceptions, ?scenario, ?data), following the LiveDeliveries.js precedent,
// so a walkthrough is reproducible from bookmarks.

import React, { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ShieldAlert, RefreshCw, Eye } from 'lucide-react';

import ScheduleProvider, { useScheduleState, useScheduleActions } from './ScheduleProvider';
import TodayBoard from './board/TodayBoard';

import Button from '../../common/Button';
import EmptyState from '../../common/EmptyState';
import { badgeClass } from '../../common/tokens';
import { useAuth } from '../../../contexts/AuthContext';

import { todayLocalDateKey } from '../../../utils/dateKey';
import { selectTrayBlocks } from '../../../utils/schedule/scheduleSelectors';

export const SCHEDULE_EDIT_PERMISSION = 'schedule_edit';

/**
 * Admins and roles granted `schedule_edit` may change the schedule. Rendered
 * outside an AuthProvider (unit tests, isolated demos) it stays editable.
 */
export function useCanEditSchedule() {
  const auth = useAuth();
  if (!auth) return true;
  const role = auth.employeeData?.role;
  const roleName = String((typeof role === 'object' ? role?.name : role) ?? '').trim().toLowerCase();
  return roleName === 'admin' || auth.hasPermission?.('admin') || auth.hasPermission?.(SCHEDULE_EDIT_PERMISSION);
}

function WorkspaceInner() {
  const state = useScheduleState();
  const actions = useScheduleActions();
  const canEdit = useCanEditSchedule();
  const [searchParams, setSearchParams] = useSearchParams();

  const dateKey = searchParams.get('date') || todayLocalDateKey();
  const boardParams = {
    order: searchParams.get('order'),
    lorry: searchParams.get('lorry'),
    slot: searchParams.get('slot'),
  };
  // The unscheduled panel's URL state (kept from the old Exceptions drawer).
  const panelOpen = searchParams.get('exceptions') === '1';

  const setParams = useCallback((updates, options) => {
    const next = new URLSearchParams(searchParams);
    // Retired ?view= values (week, day, exec, grid) are simply dropped.
    next.delete('view');
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === undefined) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, options);
  }, [searchParams, setSearchParams]);

  const ready = state.status === 'ready';
  const unscheduledCount = useMemo(() => (ready ? selectTrayBlocks(state).length : 0), [state, ready]);

  let body;
  if (state.status === 'loading' || state.status === 'idle') {
    body = (
      <div className="space-y-2" aria-busy="true">
        <div className="h-16 animate-pulse rounded-md border border-gray-200 bg-gray-50" />
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
  } else {
    body = (
      <TodayBoard
        state={state}
        actions={actions}
        dateKey={dateKey}
        params={boardParams}
        setParams={setParams}
        canEdit={canEdit}
        panelOpen={panelOpen}
        onClosePanel={() => setParams({ exceptions: null })}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6">
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
          {!canEdit && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass('gray')}`}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              View only
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
            aria-pressed={panelOpen}
            onClick={() => setParams({ exceptions: panelOpen ? null : '1' })}
          >
            <span className="tabular-nums">{unscheduledCount} unscheduled</span>
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

      {body}

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
