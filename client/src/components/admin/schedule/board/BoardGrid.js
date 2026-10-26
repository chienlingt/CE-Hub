import React from 'react';
import LorryHeader from './LorryHeader';
import BoardCell from './BoardCell';
import Meter from '../../../common/Meter';

const LORRY_COL_PX = 160;
const SLOT_COL_MIN_PX = 280;

/** A window at its cap reads red; Meter turns red only above 100%, hence the nudge. */
const capPct = (total) => (total.full && !total.over ? 1.0001 : total.doCount / total.doCap);

/**
 * What a header says about its window across ALL lorries — the line a
 * salesperson reads to see if there is room. NIGHT is on request, uncapped.
 */
function WindowAvailability({ total, open }) {
  if (!total.capped) {
    return (
      <span className="block text-[11px] font-normal text-gray-500">
        {open ? `${total.doCount} DO${total.doCount === 1 ? '' : 's'} · no cap` : 'on request — drop a DO to start'}
      </span>
    );
  }
  const left = Math.max(0, total.doCap - total.doCount);
  return (
    <span className="mt-0.5 block font-normal">
      <span className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
        <span className="text-gray-600">{total.doCount} / {total.doCap}</span>
        {total.full
          ? <span className="font-semibold text-red-700">Full{total.over ? ' ▲' : ''}</span>
          : <span className="text-gray-700">{left} available</span>}
      </span>
      <Meter pct={capPct(total)} size="sm" className="mt-0.5" />
    </span>
  );
}

/**
 * Lorry rows x AM / PM / NIGHT for one day — the old schedule.php layout. A
 * real table, fixed layout so the three slot columns are always equal, with a
 * frozen first column and a sticky header that carries each window's
 * availability. Below the minimum column width it scrolls sideways.
 */
export default function BoardGrid({ matrix, rows, verdicts, busy, onApprove, highlightWindow = null }) {
  const minWidth = LORRY_COL_PX + matrix.columns.length * SLOT_COL_MIN_PX;

  return (
    <div className="max-h-[calc(100vh-19rem)] min-h-[320px] overflow-auto rounded-md border border-gray-200 bg-white">
      <table className="w-full table-fixed border-separate border-spacing-0 text-xs" style={{ minWidth }}>
        <caption className="sr-only">Deliveries by lorry and time slot</caption>
        <colgroup>
          <col style={{ width: LORRY_COL_PX }} />
          {matrix.columns.map(col => <col key={col.windowId} />)}
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <th scope="col" className="sticky left-0 z-30 border border-gray-200 bg-gray-100 px-2 py-1.5 text-left align-top font-semibold text-gray-700">
              Lorry
              <span className="block text-[11px] font-normal tabular-nums text-gray-500">
                Total: {matrix.dayTotal.doCount} / {matrix.dayTotal.doCap} DOs
              </span>
            </th>
            {matrix.columns.map((col, i) => (
              <th
                key={col.windowId}
                scope="col"
                aria-current={col.windowId === highlightWindow ? 'true' : undefined}
                className={[
                  'border border-gray-200 px-2 py-1.5 text-left align-top font-semibold',
                  col.windowId === highlightWindow ? 'bg-blue-100 text-blue-900' : 'bg-gray-100',
                  col.open || col.windowId === highlightWindow ? (col.windowId === highlightWindow ? '' : 'text-gray-700') : 'text-gray-400',
                ].join(' ')}
              >
                {col.label}
                <span className="ml-1.5 font-normal tabular-nums text-gray-500">{col.timeLabel}</span>
                <WindowAvailability total={matrix.totals[i]} open={col.open} />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map(row => (
            <tr key={row.truck.id}>
              <th scope="row" className="sticky left-0 z-10 border border-gray-200 bg-white p-1 text-left align-top font-normal">
                <LorryHeader row={row} dateKey={matrix.dateKey} />
              </th>
              {row.cells.map((cell, i) => (
                <BoardCell
                  key={cell.windowId}
                  cell={cell}
                  verdict={cell.slotId ? verdicts?.[cell.slotId] : null}
                  busy={busy}
                  onApprove={onApprove}
                  highlighted={cell.windowId === highlightWindow}
                  label={`${row.truck.plate} ${matrix.columns[i]?.label ?? ''}`}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
