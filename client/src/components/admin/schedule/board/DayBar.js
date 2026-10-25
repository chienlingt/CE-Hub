import React from 'react';
import { ChevronLeft, ChevronRight, Search, CheckCheck } from 'lucide-react';
import Button from '../../../common/Button';
import { FOCUS_RING } from '../../../common/tokens';
import { addDays, parseDateKey } from '../../../../utils/schedule/weekRange';
import { format } from 'date-fns';

/**
 * One day at a time, weekends included. Search highlights and dims; it never
 * removes rows, so the lorry/slot geometry never shifts under the eye.
 */
export default function DayBar({
  dateKey, isToday, query, onQuery, onDate, onToday, pendingCount, busy, onApproveAll,
}) {
  const d = parseDateKey(dateKey);
  const label = d ? format(d, 'EEE d MMM yyyy') : dateKey;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-md border border-gray-200 bg-white">
        <button
          type="button" onClick={() => onDate(addDays(dateKey, -1))} aria-label="Previous day"
          className={`px-1.5 py-1.5 text-gray-500 hover:bg-gray-50 ${FOCUS_RING}`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-[8.5rem] px-1 text-center text-sm font-medium tabular-nums text-gray-900" aria-live="polite">
          {label}
        </span>
        <button
          type="button" onClick={() => onDate(addDays(dateKey, 1))} aria-label="Next day"
          className={`px-1.5 py-1.5 text-gray-500 hover:bg-gray-50 ${FOCUS_RING}`}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <label className="sr-only" htmlFor="board-date">Pick a date</label>
      <input
        id="board-date"
        type="date"
        value={dateKey}
        onChange={e => e.target.value && onDate(e.target.value)}
        className={`min-h-9 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 ${FOCUS_RING}`}
      />
      <Button variant="secondary" size="sm" onClick={onToday} disabled={isToday}>Today</Button>

      <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <label className="sr-only" htmlFor="board-search">Search DO, address or customer</label>
        <input
          id="board-search"
          type="search"
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder="DO / address / customer"
          className={`min-h-9 w-full rounded-md border border-gray-200 bg-white pl-7 pr-2 text-xs ${FOCUS_RING}`}
        />
      </div>

      <Button
        size="sm"
        icon={CheckCheck}
        className="ml-auto"
        disabled={!pendingCount || busy}
        onClick={onApproveAll}
      >
        Approve all pending ({pendingCount})
      </Button>
    </div>
  );
}
