import React from 'react';
import SlotLane from './SlotLane';
import { badgeClass, lifecycleMeta } from '../../../common/tokens';
import { weekdayLabel, shortDateLabel } from '../../../../utils/schedule/weekRange';

/**
 * Days as columns, slots stacked within each. The drag-and-drop assignment
 * board: B.1's "assign delivery date, time slot, team and truck" made manual.
 */
export default function WeekBoard({
  summaries = [],
  entities,
  drag = {},
  stagedOrderIds = new Set(),
  onOpenSlot,
  onOpenOrder,
}) {
  const working = summaries.filter(s => s.isWorkingDay);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {working.map((summary) => {
        const lifecycle = lifecycleMeta(summary.approvalState);
        const overCap = summary.doCount > summary.doCapacity;

        return (
          <div key={summary.dateKey} className="flex w-[290px] flex-shrink-0 flex-col gap-2">
            <div
              className={[
                'rounded-md border bg-white px-2 py-1.5',
                summary.isToday ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-xs font-semibold text-gray-800">
                  {weekdayLabel(summary.dateKey)}
                  <span className="ml-1 font-normal tabular-nums text-gray-500">
                    {shortDateLabel(summary.dateKey)}
                  </span>
                </span>
                <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${badgeClass(lifecycle.tone)}`}>
                  {lifecycle.label}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1 text-[11px]">
                <span className={`tabular-nums font-medium ${overCap ? 'text-red-700' : 'text-gray-700'}`}>
                  {summary.doCount}/{summary.doCapacity} DO
                </span>
                {overCap && <span className="text-red-600" aria-hidden="true">▲</span>}
                {summary.exceptionCount > 0 && (
                  <span className="ml-auto tabular-nums text-red-600">
                    {summary.exceptionCount} issue{summary.exceptionCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>

            {summary.lanes.length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-300 py-6 text-center text-[11px] text-gray-400">
                No slots generated
              </p>
            ) : summary.lanes.map(lane => (
              <SlotLane
                key={lane.id}
                lane={lane}
                entities={entities}
                isOver={drag.overId === lane.id}
                dropVerdict={drag.overId === lane.id ? drag.verdict : null}
                stagedOrderIds={stagedOrderIds}
                onOpenSlot={onOpenSlot}
                onOpenOrder={onOpenOrder}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
