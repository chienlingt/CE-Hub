import React, { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Inbox, ChevronDown, ChevronUp } from 'lucide-react';
import OrderCard from '../week/OrderCard';
import { requiresInstaller } from '../../../../utils/schedule/skillRules';
import { FOCUS_RING } from '../../../common/tokens';

export const UNASSIGNED_DROPPABLE_ID = '__unassigned__';

/**
 * The pool of orders with no slot. Also a drop target, so an order can be
 * pulled back out of a trip.
 */
export default function UnassignedTray({
  orders = [],
  entities,
  stagedOrderIds = new Set(),
  onOpenOrder,
  collapsed = false,
  onToggle,
}) {
  const [search, setSearch] = useState('');
  const { setNodeRef, isOver } = useDroppable({
    id: UNASSIGNED_DROPPABLE_ID,
    data: { type: 'slot', slotId: null },
  });

  const cards = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders
      .filter((order) => {
        if (!term) return true;
        const customer = order.customerId ? entities.customers.byId[order.customerId] : null;
        const building = order.buildingId ? entities.buildings.byId[order.buildingId] : null;
        return [order.doNo, customer?.name, building?.name, order.deliveryAddress]
          .some(v => String(v ?? '').toLowerCase().includes(term));
      })
      .map((order) => {
        const customer = order.customerId ? entities.customers.byId[order.customerId] : null;
        const building = order.buildingId ? entities.buildings.byId[order.buildingId] : null;
        return {
          order,
          customerName: customer?.name ?? null,
          buildingName: building?.name ?? null,
          needsInstaller: requiresInstaller(order, entities.products.byId),
          permitRequired: Boolean(building?.permitRequired),
          accessWindow: building?.accessStart && building?.accessEnd
            ? `${building.accessStart}–${building.accessEnd}`
            : null,
        };
      });
  }, [orders, entities, search]);

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex flex-col rounded-md border bg-white',
        isOver ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={`flex items-center justify-between gap-2 border-b border-gray-200 px-2 py-1.5 text-left ${FOCUS_RING}`}
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
          Unassigned
          <span className="rounded-full bg-gray-100 px-1.5 py-px tabular-nums text-[10px] text-gray-700">
            {orders.length}
          </span>
        </span>
        {collapsed
          ? <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
          : <ChevronUp className="h-4 w-4 text-gray-400" aria-hidden="true" />}
      </button>

      {!collapsed && (
        <>
          {orders.length > 6 && (
            <div className="px-2 pt-1.5">
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter by DO, customer, building"
                aria-label="Filter unassigned orders"
                className={`w-full rounded border border-gray-300 px-2 py-1 text-xs ${FOCUS_RING}`}
              />
            </div>
          )}

          <div className="max-h-[420px] min-h-[80px] flex-1 space-y-1 overflow-y-auto p-2">
            <SortableContext
              items={cards.map(c => c.order.id)}
              strategy={verticalListSortingStrategy}
            >
              {cards.length === 0 ? (
                <p className="py-6 text-center text-[11px] text-gray-400">
                  {orders.length ? 'No matches.' : 'Every order is assigned.'}
                </p>
              ) : cards.map(card => (
                <OrderCard
                  key={card.order.id}
                  {...card}
                  locked={false}
                  staged={stagedOrderIds.has(card.order.id)}
                  onOpen={onOpenOrder}
                />
              ))}
            </SortableContext>
          </div>
        </>
      )}
    </div>
  );
}
