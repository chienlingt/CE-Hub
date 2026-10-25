import React, { useMemo, useState } from 'react';
import { Truck, Users, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import Button from '../../../common/Button';
import CapacityMeter from '../week/CapacityMeter';
import SlotFeasibilityPanel from '../day/SlotFeasibilityPanel';
import { badgeClass, lifecycleMeta, FOCUS_RING } from '../../../common/tokens';
import { evaluateSlotFeasibility } from '../../../../utils/schedule/validateAssignment';

/**
 * One trip awaiting Mr Lee's decision.
 *
 * Grouped by SLOT, not by order: the agreed workflow (Meeting_Outcomes.md §5)
 * has him reviewing the generated schedule, and at 70-80 DOs a day approving
 * individually would be 80 clicks. He approves a trip.
 */
export default function ApprovalSlotCard({
  lane,
  entities,
  config,
  busy = false,
  onApprove,
  onReject,
  onOpenOrder,
}) {
  const [expanded, setExpanded] = useState(false);
  const lifecycle = lifecycleMeta(lane.lifecycle);

  const checks = useMemo(() => evaluateSlotFeasibility({
    slot: { id: lane.id, dateKey: lane.dateKey, start: lane.start, end: lane.end, status: lane.status },
    orders: lane.orders,
    windowOrders: lane.windowOrders,
    truck: lane.truck,
    team: lane.team,
    buildingsById: entities.buildings.byId,
    productsById: entities.products.byId,
    employeesById: entities.employees.byId,
    config,
  }), [lane, entities, config]);

  const failing = checks.filter(c => !c.ok);
  const orderIds = lane.orders.map(o => o.id);

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-200 px-3 py-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-gray-900">
            {lane.windowLabel}
            <span className="ml-1.5 font-normal tabular-nums text-gray-500">{lane.timeLabel}</span>
          </h4>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-600">
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3 text-gray-400" aria-hidden="true" />
              {lane.truckPlate
                ? <span className="font-mono">{lane.truckPlate}</span>
                : <span className="italic text-amber-700">no lorry</span>}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3 text-gray-400" aria-hidden="true" />
              {lane.teamName ?? <span className="italic text-amber-700">no crew</span>}
            </span>
            <span className="tabular-nums">{lane.capacity.doCount} DO</span>
          </div>
        </div>

        <span className={`rounded-full px-2 py-px text-[10px] font-semibold ${badgeClass(lifecycle.tone)}`}>
          {lifecycle.label}
        </span>
      </div>

      <div className="grid gap-3 px-3 py-2 sm:grid-cols-[1fr_200px]">
        <div>
          {/* DO numbers first: it is what he checks. */}
          <div className="flex flex-wrap gap-1">
            {lane.orders.map(order => (
              <button
                key={order.id}
                type="button"
                onClick={() => onOpenOrder?.(order.id)}
                className={`rounded border border-gray-200 px-1.5 py-0.5 font-mono text-[11px] text-gray-800 hover:bg-gray-50 ${FOCUS_RING}`}
              >
                {order.doNo}
              </button>
            ))}
          </div>

          {failing.length > 0 && (
            <p className="mt-2 text-[11px] font-medium text-red-700">
              {failing.length} failing check{failing.length === 1 ? '' : 's'}:{' '}
              <span className="font-normal">{failing.map(c => c.label).join(', ')}</span>
            </p>
          )}

          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            className={`mt-2 flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-900 ${FOCUS_RING} rounded`}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Hide' : 'Show'} feasibility checks
          </button>

          {expanded && (
            <div className="mt-2">
              <SlotFeasibilityPanel checks={checks} compact />
            </div>
          )}
        </div>

        <CapacityMeter capacity={lane.capacity} compact />
      </div>

      {lane.lifecycle === 'awaiting_approval' && (
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-3 py-2">
          <Button
            variant="secondary" size="sm" icon={X}
            onClick={() => onReject?.(orderIds, lane)}
            disabled={busy}
          >
            Reject
          </Button>
          <Button
            variant="success" size="sm" icon={Check}
            onClick={() => onApprove?.(orderIds, lane)}
            disabled={busy}
            // A failing hard constraint does not hard-block approval: Mr Lee
            // retains final authority and may know something the data does not.
            // But he is told, every time.
            title={failing.length ? `${failing.length} check(s) failing` : 'Approve this trip'}
          >
            {failing.length ? 'Approve anyway' : 'Approve trip'}
          </Button>
        </div>
      )}
    </div>
  );
}
