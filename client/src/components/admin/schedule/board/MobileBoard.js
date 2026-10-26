import React from 'react';
import DoBlock from './DoBlock';
import { useBoard } from './BoardContext';
import { cellMeta } from './boardStates';
import { FOCUS_RING } from '../../../common/tokens';

/**
 * Below 640px: one card per lorry, a row per slot, and a slot-total strip on
 * top. No dragging on touch — tapping a DO opens the drawer, whose "Move to…"
 * runs the same validation as a drop.
 */
export default function MobileBoard({ matrix, rows, busy, onApprove }) {
  const { openLorry, canEdit } = useBoard();

  return (
    <div className="space-y-2">
      <p className="sticky top-0 z-10 flex flex-wrap gap-x-3 rounded-md border border-gray-200 bg-gray-100 px-2 py-1.5 text-[11px] tabular-nums text-gray-700">
        {matrix.totals.map(t => (
          <span key={t.windowId} className={t.full ? 'font-semibold text-red-700' : ''}>
            {t.label} {t.capped ? `${t.doCount}/${t.doCap}${t.full ? ' ▲' : ''}` : (t.doCount || '—')}
          </span>
        ))}
        <span className="text-gray-500">Total: {matrix.dayTotal.doCount} / {matrix.dayTotal.doCap} DOs</span>
      </p>

      {rows.map(row => (
        <section key={row.truck.id} className="rounded-md border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => openLorry(row.truck.id)}
            className={`flex w-full items-baseline gap-1 border-b border-gray-100 px-2 py-1.5 text-left text-xs ${FOCUS_RING}`}
          >
            <span className="font-mono font-semibold text-gray-900">{row.truck.plate}</span>
            <span className="text-gray-500">· {row.truck.tone ? `${row.truck.tone} ton` : '—'} ·</span>
            <span className={row.teamState === 'ok' ? 'text-gray-600' : 'font-medium text-amber-700'}>
              {row.teamState === 'none' ? '⚠ No team' : row.teamState === 'unavailable' ? '⚠ Team unavailable' : row.team?.name}
            </span>
          </button>
          <ul className="divide-y divide-gray-100">
            {row.cells.map((cell, i) => (
              <li key={cell.windowId} className={`px-2 py-1 ${cellMeta(cell.state).className}`}>
                <p className="text-[11px] font-medium text-gray-600">
                  {matrix.columns[i].label} <span className="font-normal tabular-nums text-gray-400">{matrix.columns[i].timeLabel}</span>
                  {cell.blocks.length === 0 && (
                    <span className="ml-2 font-normal italic text-gray-400">
                      {cell.state === 'open' ? (cell.windowFull ? `${cell.windowName} window full (${cell.windowCap} DOs across all lorries)` : 'No DO scheduled') : (cell.reason ?? cellMeta(cell.state).label)}
                    </span>
                  )}
                </p>
                {cell.blocks.length > 0 && (
                  // Two per line on a phone.
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    {cell.blocks.map(block => <DoBlock key={block.orderId} block={block} canDrag={false} width="w-full" />)}
                  </div>
                )}
                {canEdit && cell.pendingIds.length > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onApprove(cell.pendingIds)}
                    className={`mt-1 min-h-8 rounded border border-amber-300 bg-white px-2 text-[11px] font-medium text-amber-800 ${FOCUS_RING}`}
                  >
                    Approve {cell.pendingIds.length}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
