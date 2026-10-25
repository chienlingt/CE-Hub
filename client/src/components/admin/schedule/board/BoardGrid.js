import React from 'react';
import LorryHeader from './LorryHeader';
import BoardCell from './BoardCell';
import SlotTotalsRow from './SlotTotalsRow';

const LORRY_COL_PX = 160;
const SLOT_COL_MIN_PX = 280;

/**
 * Lorry rows x AM / PM / NIGHT for one day — the old schedule.php layout. A
 * real table, fixed layout so the three slot columns are always equal, with a
 * frozen first column, a sticky header and a sticky slot-total footer. Below
 * the minimum column width it scrolls sideways rather than squeezing blocks.
 */
export default function BoardGrid({ matrix, rows, verdicts, busy, onApprove }) {
  const minWidth = LORRY_COL_PX + matrix.columns.length * SLOT_COL_MIN_PX;

  return (
    <div className="max-h-[calc(100vh-17rem)] min-h-[320px] overflow-auto rounded-md border border-gray-200 bg-white">
      <table className="w-full table-fixed border-separate border-spacing-0 text-xs" style={{ minWidth }}>
        <caption className="sr-only">Deliveries by lorry and time slot</caption>
        <colgroup>
          <col style={{ width: LORRY_COL_PX }} />
          {matrix.columns.map(col => <col key={col.windowId} />)}
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <th scope="col" className="sticky left-0 z-30 border border-gray-200 bg-gray-100 px-2 py-1.5 text-left font-semibold text-gray-700">
              Lorry
            </th>
            {matrix.columns.map(col => (
              <th
                key={col.windowId}
                scope="col"
                className={`border border-gray-200 bg-gray-100 px-2 py-1.5 text-left font-semibold ${col.open ? 'text-gray-700' : 'text-gray-400'}`}
              >
                {col.label}
                <span className="ml-1.5 font-normal tabular-nums text-gray-500">{col.timeLabel}</span>
                {!col.open && <span className="ml-1.5 font-normal italic">on request — drop a DO to start</span>}
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
                  label={`${row.truck.plate} ${matrix.columns[i]?.label ?? ''}`}
                />
              ))}
            </tr>
          ))}
        </tbody>

        <SlotTotalsRow totals={matrix.totals} dayTotal={matrix.dayTotal} />
      </table>
    </div>
  );
}
