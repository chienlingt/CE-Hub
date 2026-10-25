import React, { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { blockMeta } from './boardStates';
import { useBoard } from './BoardContext';
import useHoverCard from './useHoverCard';
import HoverCard from './HoverCard';
import DoDetails from './DoDetails';
import { FOCUS_RING } from '../../../common/tokens';

/**
 * One DO, its own section inside a cell: number and address, coloured by
 * approval state. Hover previews the details; click / Enter / tap opens them
 * pinned in the drawer. Only unapproved DOs are draggable.
 */
function BlockBody({ block, dragHandle = {}, dragging = false, hover }) {
  const { openOrder, matchesSearch, searching } = useBoard();
  const meta = blockMeta(block.state);
  const match = !searching || matchesSearch(block);

  return (
    <button
      type="button"
      onClick={() => openOrder(block.orderId)}
      {...hover?.triggerProps}
      {...dragHandle}
      aria-label={`${block.doNo}, ${block.address}. ${meta.label}${block.draggable ? ', draggable' : ''}. Open details.`}
      aria-roledescription={block.draggable ? 'draggable delivery order' : undefined}
      className={[
        // Exactly three lines for every block, so cells read as a neat grid.
        'block h-[3.75rem] w-full overflow-hidden rounded border px-1.5 py-1 text-left transition-opacity',
        FOCUS_RING,
        meta.className,
        block.draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        dragging ? 'opacity-40' : '',
        match ? '' : 'opacity-30',
        searching && match ? 'ring-2 ring-blue-500' : '',
      ].join(' ')}
    >
      <span className="flex items-baseline gap-1">
        <span className="truncate font-mono text-xs leading-4 text-gray-900">{block.doNo}</span>
        {block.dateMismatch && (
          <span
            className="flex-shrink-0 text-[10px] leading-none text-amber-600"
            title={`Expected ${block.expectedLabel ?? block.expectedDateKey}`}
          >
            ⚠<span className="sr-only">Placed on a different date from Odoo's expected date</span>
          </span>
        )}
        <span className="ml-auto flex-shrink-0 text-[10px] leading-none" aria-hidden="true">{meta.glyph}</span>
      </span>
      {/* line-clamp sets its own display; adding `block` here would cancel it. */}
      {block.state === 'rejected' && block.reason ? (
        <>
          <span className="mt-0.5 line-clamp-1 text-[11px] leading-[0.95rem] text-gray-600">{block.address}</span>
          <span className="line-clamp-1 text-[11px] font-medium leading-[0.95rem] text-red-700">✕ {block.reason}</span>
        </>
      ) : block.address && (
        <span className="mt-0.5 line-clamp-2 text-[11px] leading-[0.95rem] text-gray-600">{block.address}</span>
      )}
    </button>
  );
}

function DetailPopover({ block, hover }) {
  const { getOrderDetail } = useBoard();
  // Computed only while the card is open, so ~75 blocks cost nothing at rest.
  const detail = useMemo(
    () => (hover.open ? getOrderDetail(block.orderId) : null),
    [hover.open, getOrderDetail, block.orderId],
  );
  return (
    <HoverCard open={hover.open} anchorRect={hover.anchorRect} cardProps={hover.cardProps} label={`${block.doNo} details`}>
      <DoDetails detail={detail} />
    </HoverCard>
  );
}

function DraggableDoBlock({ block, width }) {
  const { dragActive } = useBoard();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.orderId,
    data: { type: 'order', orderId: block.orderId },
  });
  const hover = useHoverCard({ disabled: dragActive });

  // Merge, so the hover's onPointerDown and dnd-kit's both run.
  const dragHandle = {
    ...attributes,
    ...listeners,
    onPointerDown: (event) => { hover.triggerProps.onPointerDown(); listeners?.onPointerDown?.(event); },
  };

  return (
    <div ref={setNodeRef} className={width}>
      <BlockBody block={block} dragHandle={dragHandle} dragging={isDragging} hover={hover} />
      <DetailPopover block={block} hover={hover} />
    </div>
  );
}

function StaticDoBlock({ block, width }) {
  const { dragActive } = useBoard();
  const hover = useHoverCard({ disabled: dragActive });
  return (
    <div className={width}>
      <BlockBody block={block} hover={hover} />
      <DetailPopover block={block} hover={hover} />
    </div>
  );
}

/**
 * Fixed width by default, so blocks sit side by side and wrap as a tidy grid.
 * `canDrag={false}` for surfaces outside the DnD context (mobile).
 */
export default function DoBlock({ block, canDrag = true, width = 'w-[130px]' }) {
  return block.draggable && canDrag
    ? <DraggableDoBlock block={block} width={width} />
    : <StaticDoBlock block={block} width={width} />;
}
