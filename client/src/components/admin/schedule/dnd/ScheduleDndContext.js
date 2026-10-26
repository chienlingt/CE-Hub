import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { selectOrdersForSlot, selectDropVerdict } from '../../../../utils/schedule/scheduleSelectors';
import DragOverlayCard from './DragOverlayCard';

// @dnd-kit over the hand-rolled pointer-event DnD in driver/DriverRoute.js,
// because this board needs CROSS-container drags (tray -> lane, lane -> lane),
// which that implementation does not do, plus a real KeyboardSensor — the
// existing code's only a11y path is arrow buttons.
//
// Note DriverRoute.js is deliberately NOT migrated: it works, it is touch-tuned
// and it is on the critical path for the driver demo.

/**
 * Wraps the board, owns drag state, and runs validateAssignment on every hover
 * so the lane can show the consequence before the drop.
 *
 * @param {object} props
 * @param {object} props.state           schedule store
 * @param {(orderId, slotId, index) => void} props.onStageMove
 * @param {(verdict, order) => void} [props.onRejected]
 */
export default function ScheduleDndContext({
  state,
  onStageMove,
  onRejected,
  onDragStateChange,
  children,
}) {
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [verdict, setVerdict] = useState(null);

  // Cache verdicts per (order, slot) within a single drag: onDragOver fires on
  // every pointer move, and validateAssignment walks a slot's whole order list.
  const verdictCache = useRef(new Map());
  // Groupings shared by every verdict in one drag; rebuilt with the store.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectorCache = useMemo(() => ({}), [state]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // A small threshold so a click on the card body isn't swallowed as a drag.
      activationConstraint: { distance: 4 },
    }),
    // Space lifts and drops; Enter is left free to open a DO's details.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const evaluate = useCallback((orderId, slotId) => {
    if (!orderId || !slotId) return null;

    const key = `${orderId}|${slotId}`;
    const cached = verdictCache.current.get(key);
    if (cached) return cached;

    // Same verdict the Board paints on every cell: paired team, shared
    // window DO cap, past-day and no-crew refusals.
    const result = selectDropVerdict(state, orderId, slotId, selectorCache);
    if (!result) return null;

    verdictCache.current.set(key, result);
    return result;
  }, [state, selectorCache]);

  /** A drop may land on a lane or on a card inside one — resolve to the lane. */
  const resolveSlotId = useCallback((over) => {
    if (!over) return null;
    if (over.data?.current?.type === 'slot') return over.id;
    if (over.data?.current?.type === 'order') {
      const targetOrderId = over.data.current.orderId;
      return state.entities.orders.byId[targetOrderId]?.slotId
        ?? Object.keys(state.entities.slots.byId).find(
          slotId => selectOrdersForSlot(state, slotId).some(o => o.id === targetOrderId),
        )
        ?? null;
    }
    return over.id;
  }, [state]);

  const publish = useCallback((next) => {
    onDragStateChange?.(next);
  }, [onDragStateChange]);

  const handleDragStart = useCallback((event) => {
    verdictCache.current.clear();
    const id = event.active.id;
    setActiveId(id);
    publish({ activeId: id, overId: null, verdict: null });
  }, [publish]);

  const handleDragOver = useCallback((event) => {
    const slotId = resolveSlotId(event.over);
    setOverId(slotId);
    const result = evaluate(event.active.id, slotId);
    setVerdict(result);
    publish({ activeId: event.active.id, overId: slotId, verdict: result });
  }, [evaluate, resolveSlotId, publish]);

  const reset = useCallback(() => {
    setActiveId(null);
    setOverId(null);
    setVerdict(null);
    verdictCache.current.clear();
    publish({ activeId: null, overId: null, verdict: null });
  }, [publish]);

  const handleDragEnd = useCallback((event) => {
    const orderId = event.active.id;
    const slotId = resolveSlotId(event.over);
    const result = slotId ? evaluate(orderId, slotId) : null;

    if (slotId && result?.ok) {
      onStageMove?.(orderId, slotId, null);
    } else if (slotId && result && !result.ok) {
      // Refuse with the reason rather than applying and failing later.
      onRejected?.(result, state.entities.orders.byId[orderId]);
    }

    reset();
  }, [evaluate, resolveSlotId, onStageMove, onRejected, reset, state.entities.orders.byId]);

  const activeOrder = activeId ? state.entities.orders.byId[activeId] : null;
  const activeCustomer = activeOrder?.customerId
    ? state.entities.customers.byId[activeOrder.customerId]
    : null;

  const dragState = useMemo(() => ({ activeId, overId, verdict }), [activeId, overId, verdict]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up order ${active.id}. Use arrow keys to move between slots.`,
          onDragOver: ({ over }) => (over ? `Over slot ${over.id}.` : 'Not over a slot.'),
          onDragEnd: ({ over }) => (over ? `Dropped on slot ${over.id}.` : 'Drop cancelled.'),
          onDragCancel: () => 'Move cancelled.',
        },
      }}
    >
      {typeof children === 'function' ? children(dragState) : children}

      <DragOverlay dropAnimation={null}>
        {activeOrder && (
          <DragOverlayCard
            order={activeOrder}
            customerName={activeCustomer?.name ?? null}
            verdict={verdict}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
