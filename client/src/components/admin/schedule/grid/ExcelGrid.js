// The Excel-mirror grid. Dr Chiew asked that CE Hub mirror Mr Lee's layout,
// and Mrs Sally's transition concern rests on this screen more than any other.
//
// Shape: columns = days, row blocks = lorries, sub-rows = time windows,
// cells = DO numbers. Properties that make it read as his spreadsheet:
//
//   - a real <table>, so Ctrl+C into Excel, screen readers and print all work
//   - frozen panes (sticky first column + sticky header), as Excel's Freeze Panes
//   - dense, flat, bordered, tabular-nums — NOT the rounded-2xl/gradient idiom
//   - per-cell footers carrying the lorry's DO count and load
//   - a day-totals row (against the shared per-window DO cap) and a
//     per-lorry totals column: his SUM()
//   - arrow-key cell navigation
//   - print stylesheet, because today he prints it and pins it on the wall

import React, { useCallback, useMemo, useRef } from 'react';
import { Lock } from 'lucide-react';
import GridOrderChip from './GridOrderChip';
import { weekdayLabel, shortDateLabel } from '../../../../utils/schedule/weekRange';
import { cm3ToM3, kgToTonnes } from '../../../../utils/schedule/capacityRules';
import { requiresInstaller } from '../../../../utils/schedule/skillRules';
import { pctTone } from '../../../common/tokens';

const CELL_BORDER = 'border border-gray-200';

/**
 * Amber over 85%, red over 100% — and a glyph, so greyscale printing survives.
 * Only volume and weight: the DO cap is per window across lorries, not per cell.
 */
function cellTone(lane) {
  if (!lane || lane.capacity.doCount === 0) return '';
  const worst = Math.max(
    lane.capacity.volumePct ?? 0,
    lane.capacity.weightPct ?? 0,
  );
  const tone = pctTone(worst);
  if (tone === 'red') return 'bg-red-50';
  if (tone === 'amber') return 'bg-amber-50';
  return '';
}

function GridCell({ cell, productsById, onOpenSlot, onOpenOrder }) {
  const { lane, closed, offDay, offDayReason } = cell;

  if (closed) {
    return (
      <td className={`${CELL_BORDER} bg-gray-50 text-center align-top`}>
        <span className="text-[10px] uppercase tracking-wide text-gray-400">—</span>
      </td>
    );
  }

  if (offDay) {
    return (
      <td
        className={`${CELL_BORDER} bg-gray-50 text-center align-top`}
        title={offDayReason ?? 'Lorry unavailable'}
      >
        <span className="text-[10px] italic text-gray-400">— off —</span>
      </td>
    );
  }

  const count = lane?.capacity.doCount ?? 0;

  return (
    <td
      className={`${CELL_BORDER} align-top ${cellTone(lane)} ${lane?.locked ? 'bg-orange-50' : ''}`}
      data-grid-cell
      tabIndex={-1}
    >
      {count === 0 ? (
        <button
          type="button"
          onClick={() => lane && onOpenSlot?.(lane.id)}
          className="block h-full w-full px-1 py-1 text-left text-[10px] text-gray-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600"
          aria-label={lane ? `Empty slot, open ${lane.timeLabel}` : 'No slot'}
        >
          {lane ? '·' : ''}
        </button>
      ) : (
        <div className="px-1 py-0.5">
          {lane.locked && (
            <div className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-orange-700">
              <Lock className="h-2.5 w-2.5" aria-hidden="true" />
              <span>{lane.lockReason}</span>
            </div>
          )}

          {lane.orders.map(order => (
            <GridOrderChip
              key={order.id}
              order={order}
              locked={lane.locked}
              needsInstaller={requiresInstaller(order, productsById)}
              hasIssue={order.assignmentStatus === 'rejected'}
              onOpen={onOpenOrder}
            />
          ))}

          {/* Mr Lee's running totals, in the cell, as on his sheet. */}
          <button
            type="button"
            onClick={() => onOpenSlot?.(lane.id)}
            className="mt-0.5 block w-full border-t border-gray-200 pt-0.5 text-left text-[10px] leading-tight text-gray-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600"
          >
            <span className="tabular-nums">
              {count} DO
              {lane.capacity.volumePct !== null && ` · ${Math.round(lane.capacity.volumePct * 100)}%`}
              {lane.capacity.over.length > 0 && ' ▲'}
            </span>
            <br />
            <span className="tabular-nums text-gray-500">
              {lane.capacity.weightKnown && lane.capacity.weightCapKg
                ? `${kgToTonnes(lane.capacity.weightKg).toFixed(1)}/${kgToTonnes(lane.capacity.weightCapKg).toFixed(1)} t`
                : `${cm3ToM3(lane.capacity.volumeCm3).toFixed(1)} m³`}
            </span>
          </button>
        </div>
      )}
    </td>
  );
}

export default function ExcelGrid({
  matrix,
  productsById = {},
  onOpenSlot,
  onOpenOrder,
}) {
  const tableRef = useRef(null);

  // Arrow-key cell navigation, as in a spreadsheet.
  const handleKeyDown = useCallback((event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(event.key)) return;

    const cells = Array.from(tableRef.current?.querySelectorAll('[data-grid-cell]') ?? []);
    const current = event.target.closest('[data-grid-cell]');
    if (!current || !cells.length) return;

    const row = current.parentElement;
    const rows = Array.from(tableRef.current.querySelectorAll('tbody tr'));
    const rowIndex = rows.indexOf(row);
    const colIndex = Array.from(row.querySelectorAll('[data-grid-cell]')).indexOf(current);

    let target = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const siblings = Array.from(row.querySelectorAll('[data-grid-cell]'));
      target = siblings[colIndex + (event.key === 'ArrowRight' ? 1 : -1)];
    } else {
      const nextRow = rows[rowIndex + (event.key === 'ArrowDown' ? 1 : -1)];
      target = nextRow?.querySelectorAll('[data-grid-cell]')[colIndex];
    }

    if (target) {
      event.preventDefault();
      target.focus();
      (target.querySelector('button') ?? target).focus();
    }
  }, []);

  const { dateKeys, rowGroups, columnTotals, grandTotal } = matrix;

  const headers = useMemo(() => dateKeys.map(dateKey => ({
    dateKey,
    weekday: weekdayLabel(dateKey),
    short: shortDateLabel(dateKey),
  })), [dateKeys]);

  if (!rowGroups.length) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No lorries are rostered for this week.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-md border border-gray-200 bg-white print:overflow-visible print:border-0">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <table
        ref={tableRef}
        onKeyDown={handleKeyDown}
        className="w-full border-collapse text-xs"
      >
        <caption className="sr-only">
          Weekly delivery schedule by lorry and time window
        </caption>

        <thead>
          <tr>
            {/* The frozen corner. */}
            <th
              scope="col"
              className={`${CELL_BORDER} sticky left-0 top-0 z-30 min-w-[132px] bg-gray-100 px-2 py-1.5 text-left font-semibold text-gray-700`}
            >
              Lorry / window
            </th>
            {headers.map(h => (
              <th
                key={h.dateKey}
                scope="col"
                className={`${CELL_BORDER} sticky top-0 z-10 min-w-[84px] bg-gray-100 px-2 py-1.5 text-center font-semibold text-gray-700`}
              >
                <span className="block">{h.weekday}</span>
                <span className="block font-normal tabular-nums text-gray-500">{h.short}</span>
              </th>
            ))}
            <th
              scope="col"
              className={`${CELL_BORDER} sticky top-0 z-10 bg-gray-100 px-2 py-1.5 text-center font-semibold text-gray-700`}
            >
              Total
            </th>
          </tr>
        </thead>

        {rowGroups.map((group, groupIndex) => (
          // One tbody per lorry, so zebra striping groups by lorry block.
          <tbody key={group.truck.id} className={groupIndex % 2 ? 'bg-gray-50/40' : ''}>
            {group.rows.map((row, rowIndex) => (
              <tr key={`${group.truck.id}-${row.windowId}`}>
                <th
                  scope="row"
                  className={`${CELL_BORDER} sticky left-0 z-20 px-2 py-1 text-left align-top font-normal ${groupIndex % 2 ? 'bg-gray-50' : 'bg-white'}`}
                >
                  {rowIndex === 0 && (
                    <span className="block font-mono font-semibold text-gray-900">
                      {group.truck.plate}
                    </span>
                  )}
                  <span className="flex items-baseline gap-1">
                    <span className="font-medium text-gray-700">{row.label}</span>
                    {rowIndex === 0 && group.truck.tone && (
                      <span className="text-[10px] text-gray-400">{group.truck.tone} ton</span>
                    )}
                  </span>
                </th>

                {row.cells.map(cell => (
                  <GridCell
                    key={`${cell.dateKey}-${cell.windowId}`}
                    cell={cell}
                    productsById={productsById}
                    onOpenSlot={onOpenSlot}
                    onOpenOrder={onOpenOrder}
                  />
                ))}

                <td className={`${CELL_BORDER} px-2 py-1 text-center align-top tabular-nums text-gray-500`}>
                  {rowIndex === 0 ? <strong className="text-gray-900">{group.total}</strong> : ''}
                </td>
              </tr>
            ))}
          </tbody>
        ))}

        {/* The day-totals row: the SUM() he already has at the bottom. */}
        <tfoot>
          <tr className="bg-gray-100 font-semibold">
            <th
              scope="row"
              className={`${CELL_BORDER} sticky left-0 z-20 bg-gray-100 px-2 py-1.5 text-left text-gray-700`}
            >
              Day total
            </th>
            {columnTotals.map(total => (
              <td
                key={total.dateKey}
                className={`${CELL_BORDER} px-2 py-1.5 text-center tabular-nums ${
                  total.doCount > total.doCapacity ? 'text-red-700' : 'text-gray-800'
                }`}
              >
                {total.closed ? (
                  <span className="text-[10px] font-normal uppercase text-gray-400">Closed</span>
                ) : (
                  <>
                    {total.doCount}
                    <span className="font-normal text-gray-500">/{total.doCapacity}</span>
                    {total.doCount > total.doCapacity && ' ▲'}
                  </>
                )}
              </td>
            ))}
            <td className={`${CELL_BORDER} px-2 py-1.5 text-center tabular-nums text-gray-900`}>
              {grandTotal}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
