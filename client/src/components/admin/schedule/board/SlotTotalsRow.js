import React from 'react';
import Meter from '../../../common/Meter';

/**
 * The shared DO cap, under the slots rather than inside any lorry row: DOs in
 * each window summed across ALL lorries, against `maxDOsPerSlot`. Red at the
 * cap (drops are refused), ▲ over it so greyscale print survives.
 */
export function slotTotalPct(total) {
  if (!total.doCap) return null;
  // At the cap the window refuses drops, so it reads red; Meter turns red
  // only above 100%, hence the nudge.
  return total.full && !total.over ? 1.0001 : total.doCount / total.doCap;
}

export default function SlotTotalsRow({ totals, dayTotal }) {
  return (
    <tfoot className="sticky bottom-0 z-20">
      <tr className="bg-gray-100">
        <th
          scope="row"
          className="sticky left-0 z-30 border border-gray-200 bg-gray-100 px-2 py-1.5 text-left align-top"
        >
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-700">Slot total</span>
          <span className="block text-[11px] tabular-nums text-gray-600">
            Day {dayTotal.doCount} / {dayTotal.doCap}
          </span>
        </th>
        {totals.map(total => (
          <td key={total.windowId} className="border border-gray-200 px-2 py-1.5 align-top">
            {total.capped ? (
              <Meter
                pct={slotTotalPct(total)}
                label={total.label}
                value={`${total.doCount} / ${total.doCap}${total.full && !total.over ? ' full' : ''}`}
              />
            ) : (
              // NIGHT has no cap: a plain count, and each DO adds one to the day.
              <p className="flex justify-between text-[11px] text-gray-500">
                <span>{total.label}</span>
                <span className="tabular-nums font-medium text-gray-700">{total.doCount || '—'}</span>
              </p>
            )}
          </td>
        ))}
      </tr>
    </tfoot>
  );
}
