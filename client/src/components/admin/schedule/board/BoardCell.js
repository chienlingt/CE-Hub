import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Info } from 'lucide-react';
import DoBlock from './DoBlock';
import { useBoard } from './BoardContext';
import { cellMeta } from './boardStates';
import { FOCUS_RING } from '../../../common/tokens';

/** Why a cell refuses, as one short line — shown inside it while dragging. */
function refusal(verdict, cell) {
  if (!cell.droppable) return cell.reason;
  const issue = verdict?.blocking?.[0];
  if (!issue) return null;
  return issue.code === 'SLOT_DO_CAP_REACHED' ? issue.detail : issue.label;
}

/**
 * One lorry x one slot. Its state is written, not drawn: "Lorry full", "Slot
 * full", or the grey reason. Full, off, crewless, past and departed cells are
 * not droppable at all — @dnd-kit would otherwise still offer them as targets.
 */
export default function BoardCell({ cell, verdict, label, highlighted = false }) {
  const { dragActive, openSlot } = useBoard();
  const { setNodeRef, isOver } = useDroppable({
    id: cell.slotId ?? `none:${label}`,
    data: { type: 'slot' },
    disabled: !cell.droppable,
  });

  const meta = cellMeta(cell.state);
  const fits = dragActive && cell.droppable && verdict?.ok;
  const refused = dragActive && !fits;
  const reason = refused ? refusal(verdict, cell) : null;

  // The §5 checklist for this lorry-slot; sits in the footer so it never
  // takes width from the blocks.
  const slotInfo = cell.lane ? (
    <button
      type="button"
      onClick={() => openSlot(cell.slotId)}
      aria-label={`Feasibility checks for ${label}`}
      className={`rounded p-0.5 text-gray-300 opacity-0 hover:text-gray-600 focus-visible:opacity-100 group-hover:opacity-100 ${FOCUS_RING}`}
    >
      <Info className="h-3 w-3" aria-hidden="true" />
    </button>
  ) : null;

  return (
    <td
      ref={setNodeRef}
      className={[
        'group relative border border-gray-200 p-1 align-top transition-opacity',
        meta.className,
        highlighted && !dragActive ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : '',
        fits ? 'ring-2 ring-inset ring-green-500' : '',
        fits && isOver ? 'bg-green-50' : '',
        refused ? 'opacity-50' : '',
        refused && isOver ? 'ring-2 ring-inset ring-red-500' : '',
      ].join(' ')}
    >
      {reason && (
        <p className="mb-1 text-[10px] font-medium leading-tight text-red-700">✕ {reason}</p>
      )}

      {cell.blocks.length > 0 ? (
        // Side by side in loading order: as many per row as fit at 120px,
        // stretched to fill it, so a busy slot grows sideways before it grows
        // down and never leaves a block-sized gap at the end of a row.
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1">
          {cell.blocks.map(block => <DoBlock key={block.orderId} block={block} width="w-full" />)}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-1 px-1 py-2">
          {cell.state === 'open' && cell.windowFull ? (
            <p className="text-[11px] leading-tight text-red-700">
              <span className="font-medium">{cell.windowName} window full</span>
              {' '}— {cell.windowCap} DOs booked across all lorries. This lorry is empty, but no more DOs fit in this window.
            </p>
          ) : (
            <p className="text-[11px] italic text-gray-400">
              {cell.state === 'open' ? 'No DO scheduled' : (cell.reason ?? meta.label)}
            </p>
          )}
          {slotInfo}
        </div>
      )}

      {cell.blocks.length > 0 && (
        <div className="mt-1 flex min-h-[1rem] items-center justify-between gap-1">
          <span />
          {cell.state === 'full' && (
            <span className="text-[11px] font-medium text-red-700">{cell.reason ?? 'Lorry full'}</span>
          )}
          {slotInfo}
        </div>
      )}
    </td>
  );
}
