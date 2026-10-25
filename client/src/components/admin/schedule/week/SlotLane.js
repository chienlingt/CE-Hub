import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Truck, Users, Lock, AlertTriangle } from 'lucide-react';
import OrderCard from './OrderCard';
import CapacityMeter from './CapacityMeter';
import { badgeClass, lifecycleMeta, FOCUS_RING } from '../../../common/tokens';
import { requiresInstaller } from '../../../../utils/schedule/skillRules';

/**
 * One droppable slot.
 *
 * THE LOCK RULE: a locked lane must NOT register as a droppable at all. Passing
 * `disabled: true` to useDroppable is what stops @dnd-kit offering it as a
 * target — visually disabling it is not enough, and a dispatcher dropping onto
 * a departed trip is the exact failure the requirement is about.
 */
export default function SlotLane({
  lane,
  entities,
  dropVerdict = null,
  isOver = false,
  onOpenSlot,
  onOpenOrder,
  stagedOrderIds = new Set(),
}) {
  const { setNodeRef } = useDroppable({
    id: lane.id,
    disabled: lane.locked,
    data: { type: 'slot', slotId: lane.id },
  });

  const lifecycle = lifecycleMeta(lane.lifecycle);

  // One view model pass for the whole lane, so cards take plain props.
  const cards = useMemo(() => lane.orders.map((order, index) => {
    const customer = order.customerId ? entities.customers.byId[order.customerId] : null;
    const building = order.buildingId ? entities.buildings.byId[order.buildingId] : null;
    return {
      order,
      sequence: index + 1,
      customerName: customer?.name ?? null,
      buildingName: building?.name ?? null,
      needsInstaller: requiresInstaller(order, entities.products.byId),
      permitRequired: Boolean(building?.permitRequired),
      accessWindow: building?.accessStart && building?.accessEnd
        ? `${building.accessStart}–${building.accessEnd}`
        : null,
    };
  }), [lane.orders, entities]);

  const blocked = dropVerdict && !dropVerdict.ok;

  return (
    <div
      ref={setNodeRef}
      className={[
        'relative flex min-h-[120px] flex-col rounded-md border bg-white',
        lane.locked ? 'border-orange-200' : 'border-gray-200',
        isOver && !lane.locked && !blocked ? 'border-blue-500 ring-2 ring-blue-200' : '',
        isOver && blocked ? 'border-red-500 ring-2 ring-red-200' : '',
      ].join(' ')}
      aria-disabled={lane.locked || undefined}
    >
      {/* Hatched overlay for a locked lane, so the state is obvious at a glance
          and survives greyscale. */}
      {lane.locked && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 1px, transparent 7px)',
          }}
        />
      )}

      <button
        type="button"
        onClick={() => onOpenSlot?.(lane.id)}
        className={`rounded-t-md border-b border-gray-200 px-2 py-1.5 text-left ${FOCUS_RING}`}
      >
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[11px] font-semibold text-gray-800">
            {lane.windowLabel}
            <span className="ml-1 font-normal tabular-nums text-gray-500">{lane.timeLabel}</span>
          </span>
          <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${badgeClass(lifecycle.tone)}`}>
            {lifecycle.label}
          </span>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
          <span className="flex items-center gap-0.5">
            <Truck className="h-3 w-3" aria-hidden="true" />
            {lane.truckPlate ? (
              <span className="font-mono">{lane.truckPlate}</span>
            ) : (
              <span className="italic text-amber-700">no lorry</span>
            )}
            {lane.truckTone && <span className="text-gray-400">{lane.truckTone}t</span>}
          </span>
          <span className="flex items-center gap-0.5">
            <Users className="h-3 w-3" aria-hidden="true" />
            {lane.teamName ?? <span className="italic text-amber-700">no crew</span>}
            {lane.crew?.hasInstaller && (
              <span className="text-purple-600" title="Crew includes an installer">+inst</span>
            )}
          </span>
          {lane.locked && (
            <span className="flex items-center gap-0.5 font-medium text-orange-700">
              <Lock className="h-3 w-3" aria-hidden="true" />
              {lane.lockReason}
            </span>
          )}
        </div>
      </button>

      <div className="px-2 py-1.5">
        <CapacityMeter capacity={lane.capacity} preview={dropVerdict?.capacity ?? null} compact />
      </div>

      {/* Live drop feedback: the reason, not just a red border. */}
      {isOver && blocked && (
        <div className="mx-2 mb-1 flex items-start gap-1 rounded bg-red-50 px-1.5 py-1 text-[10px] text-red-800">
          <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span>{dropVerdict.blocking[0]?.label}{dropVerdict.blocking.length > 1 ? ` +${dropVerdict.blocking.length - 1}` : ''}</span>
        </div>
      )}
      {isOver && !blocked && dropVerdict?.warnings?.length > 0 && (
        <div className="mx-2 mb-1 rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800">
          {dropVerdict.warnings[0].label}
        </div>
      )}

      <div className="flex-1 space-y-1 px-2 pb-2">
        <SortableContext
          items={cards.map(c => c.order.id)}
          strategy={verticalListSortingStrategy}
          disabled={lane.locked}
        >
          {cards.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-gray-300">
              {lane.locked ? 'No orders' : 'Drop an order here'}
            </p>
          ) : cards.map(card => (
            <OrderCard
              key={card.order.id}
              {...card}
              locked={lane.locked}
              staged={stagedOrderIds.has(card.order.id)}
              onOpen={onOpenOrder}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
