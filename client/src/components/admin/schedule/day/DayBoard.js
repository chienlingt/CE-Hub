import React, { useMemo } from 'react';
import SlotLane from '../week/SlotLane';
import CapacityMeter from '../week/CapacityMeter';
import SlotFeasibilityPanel from './SlotFeasibilityPanel';
import RoutePlanPanel from '../b2/RoutePlanPanel';
import EmptyState from '../../../common/EmptyState';
import { evaluateSlotFeasibility } from '../../../../utils/schedule/validateAssignment';
import { evaluateSlotAccessWindows } from '../../../../utils/schedule/accessWindowRules';
import { longDateLabel } from '../../../../utils/schedule/weekRange';
import { badgeClass } from '../../../common/tokens';

/**
 * One day in detail: its slots on the left, and for the selected slot the §5
 * feasibility checklist, projected arrival times and B.2's route plan.
 *
 * This is the screen that shows the eight B.1 checks being applied to a real
 * trip, which is what separates the system from a prettier calendar.
 */
export default function DayBoard({
  summary,
  entities,
  config,
  selectedSlotId,
  drag = {},
  stagedOrderIds = new Set(),
  onOpenSlot,
  onOpenOrder,
}) {
  const lane = useMemo(
    () => summary?.lanes.find(l => l.id === selectedSlotId) ?? summary?.lanes[0] ?? null,
    [summary, selectedSlotId],
  );

  const checks = useMemo(() => {
    if (!lane) return [];
    return evaluateSlotFeasibility({
      slot: { id: lane.id, dateKey: lane.dateKey, start: lane.start, end: lane.end, status: lane.status },
      orders: lane.orders,
      truck: lane.truck,
      team: lane.team,
      buildingsById: entities.buildings.byId,
      productsById: entities.products.byId,
      employeesById: entities.employees.byId,
      config,
    });
  }, [lane, entities, config]);

  const stops = useMemo(() => {
    if (!lane) return [];
    return evaluateSlotAccessWindows({
      slot: { id: lane.id, dateKey: lane.dateKey, start: lane.start, end: lane.end, routePlan: lane.route.plan },
      orders: lane.orders,
      buildingsById: entities.buildings.byId,
      productsById: entities.products.byId,
      config,
    });
  }, [lane, entities, config]);

  if (!summary) {
    return <EmptyState title="No data for this day" description="Pick another date." />;
  }

  if (!summary.isWorkingDay) {
    return (
      <EmptyState
        title={`${longDateLabel(summary.dateKey)} is closed`}
        description="Deliveries run Monday to Friday; the scheduler skips weekends."
      />
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <div className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          {longDateLabel(summary.dateKey)} · {summary.doCount}/{summary.doCapacity} DO
        </h3>
        {summary.lanes.map(l => (
          <button
            key={l.id}
            type="button"
            onClick={() => onOpenSlot?.(l.id)}
            className={`block w-full text-left ${l.id === lane?.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''} rounded-md`}
          >
            <SlotLane
              lane={l}
              entities={entities}
              isOver={drag.overId === l.id}
              dropVerdict={drag.overId === l.id ? drag.verdict : null}
              stagedOrderIds={stagedOrderIds}
              onOpenSlot={onOpenSlot}
              onOpenOrder={onOpenOrder}
            />
          </button>
        ))}
      </div>

      {lane ? (
        <div className="space-y-3">
          <div className="rounded-md border border-gray-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {lane.windowLabel} · {lane.timeLabel}
                {lane.truckPlate && (
                  <span className="ml-2 font-mono text-xs font-normal text-gray-500">
                    {lane.truckPlate}
                  </span>
                )}
              </h3>
              {lane.locked && (
                <span className={`rounded-full px-2 py-px text-[10px] font-semibold ${badgeClass('orange')}`}>
                  {lane.lockReason}
                </span>
              )}
            </div>
            <CapacityMeter capacity={lane.capacity} />
          </div>

          <SlotFeasibilityPanel checks={checks} />

          {/* Projected arrivals against each building's access window. Marked
              as B.1's estimate or B.2's real road time, so the number is never
              presented as more certain than it is. */}
          <div className="rounded-md border border-gray-200 bg-white">
            <h4 className="border-b border-gray-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              Projected stops
            </h4>
            {stops.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-gray-500">No orders in this slot.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {stops.map((stop, index) => (
                  <li key={stop.order.id} className="flex items-start gap-2 px-3 py-1.5 text-xs">
                    <span className="w-4 flex-shrink-0 text-right tabular-nums text-gray-400">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onOpenOrder?.(stop.order.id)}
                        className="truncate font-mono text-[11px] font-medium text-gray-900 hover:text-blue-700"
                      >
                        {stop.order.doNo}
                      </button>
                      <span className="block truncate text-[11px] text-gray-500">
                        {stop.building?.name ?? 'No building on record'}
                      </span>
                      {stop.issues.map(issue => (
                        <span
                          key={issue.code}
                          className={`mt-0.5 mr-1 inline-block rounded-full px-1.5 py-px text-[10px] ${badgeClass(issue.tone)}`}
                        >
                          {issue.label}
                        </span>
                      ))}
                    </span>
                    <span className="flex-shrink-0 text-right">
                      <span className="block tabular-nums text-gray-700">{stop.arrival}</span>
                      <span className="block text-[10px] text-gray-400">
                        {stop.source === 'b2' ? 'B.2 ETA' : 'estimate'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <RoutePlanPanel route={lane.route} orders={lane.orders} />
        </div>
      ) : (
        <EmptyState title="No slots on this day" description="Run the scheduler to generate them." />
      )}
    </div>
  );
}
