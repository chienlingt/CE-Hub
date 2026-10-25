import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import ScheduleProvider, { useScheduleState, useScheduleActions } from './ScheduleProvider';
import ApprovalSlotCard from './approval/ApprovalSlotCard';
import RejectReasonModal from './approval/RejectReasonModal';
import EmptyState from '../../common/EmptyState';
import Button from '../../common/Button';
import ResultModal from '../../common/ResultModal';
import { selectApprovalQueue } from '../../../utils/schedule/scheduleSelectors';
import { longDateLabel } from '../../../utils/schedule/weekRange';
import { FOCUS_RING } from '../../common/tokens';

/**
 * Mr Lee's review queue — the third step of the agreed workflow
 * (Meeting_Outcomes.md §5: salesperson books -> CE Hub generates -> warehouse
 * admin approves or rejects), and the one surface nothing in the app provided.
 */

const FILTERS = [
  { id: 'awaiting_approval', label: 'Awaiting approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'draft', label: 'Draft' },
  { id: 'live', label: 'In progress' },
  { id: 'all', label: 'All' },
];

function ApprovalQueueInner() {
  const state = useScheduleState();
  const actions = useScheduleActions();
  const [searchParams, setSearchParams] = useSearchParams();

  const filter = searchParams.get('filter') ?? 'awaiting_approval';
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [result, setResult] = useState(null);

  const queue = useMemo(
    () => (state.status === 'ready' ? selectApprovalQueue(state, { filter }) : { days: [], counts: {} }),
    [state, filter],
  );

  const setFilter = useCallback((next) => {
    const params = new URLSearchParams(searchParams);
    params.set('filter', next);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleApprove = useCallback(async (orderIds) => {
    setBusy(true);
    const res = await actions.approveOrders(orderIds);
    setBusy(false);
    if (res.rejected.length) {
      setResult({
        type: 'error',
        title: 'Some orders were not approved',
        // Surface the server's own reason — e.g. it refuses an order with no
        // timeslot (routes/orders.js:1641) — rather than a generic failure.
        message: res.rejected.map(r => r.message).join(' '),
      });
    } else {
      setResult({
        type: 'success',
        title: 'Trip approved',
        message: `${res.applied.length} order(s) approved and queued for Odoo write-back.`,
      });
    }
  }, [actions]);

  const handleReject = useCallback(async (reason) => {
    if (!rejectTarget) return;
    setBusy(true);
    const res = await actions.rejectOrders(rejectTarget.orderIds, reason);
    setBusy(false);
    setRejectTarget(null);
    setResult(res.rejected.length
      ? { type: 'error', title: 'Rejection failed', message: res.rejected.map(r => r.message).join(' ') }
      : {
        type: 'info',
        title: 'Trip rejected',
        message: `${res.applied.length} order(s) returned to the unassigned pool with the reason recorded.`,
      });
  }, [actions, rejectTarget]);

  if (state.status === 'loading' || state.status === 'idle') {
    return <p className="p-6 text-sm text-gray-500">Loading schedule…</p>;
  }
  if (state.status === 'error') {
    return (
      <EmptyState
        title="Could not load the schedule"
        description={state.error}
        action={<Button icon={RefreshCw} onClick={actions.reload}>Retry</Button>}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <ClipboardCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
            Schedule approval
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            Review each generated trip and approve or reject it. Approval writes back to Odoo.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={actions.refresh}>
          Refresh
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={[
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              FOCUS_RING,
              filter === f.id
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            {f.label}
            {queue.counts[f.id] != null && (
              <span className="ml-1 tabular-nums opacity-70">{queue.counts[f.id]}</span>
            )}
          </button>
        ))}
      </div>

      {queue.days.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing in this view"
          description={filter === 'awaiting_approval'
            ? 'Every generated trip has been decided. New trips appear after the Engine runs.'
            : 'Try another filter.'}
        />
      ) : (
        <div className="space-y-5">
          {queue.days.map(day => (
            <section key={day.dateKey}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                {longDateLabel(day.dateKey)}
                <span className="ml-2 font-normal normal-case text-gray-400">
                  {day.lanes.length} trip{day.lanes.length === 1 ? '' : 's'}
                </span>
              </h2>
              <div className="space-y-2">
                {day.lanes.map(lane => (
                  <ApprovalSlotCard
                    key={lane.id}
                    lane={lane}
                    entities={state.entities}
                    config={state.config}
                    busy={busy}
                    onApprove={handleApprove}
                    onReject={(orderIds) => setRejectTarget({ orderIds, lane })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <RejectReasonModal
        open={Boolean(rejectTarget)}
        lane={rejectTarget?.lane}
        orderCount={rejectTarget?.orderIds.length ?? 0}
        busy={busy}
        onCancel={() => setRejectTarget(null)}
        onConfirm={handleReject}
      />

      <ResultModal
        open={Boolean(result)}
        type={result?.type}
        title={result?.title}
        message={result?.message}
        onClose={() => setResult(null)}
      />
    </div>
  );
}

export default function ScheduleApproval() {
  return (
    <ScheduleProvider>
      <ApprovalQueueInner />
    </ScheduleProvider>
  );
}
