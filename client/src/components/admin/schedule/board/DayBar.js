import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Search, CheckCheck, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import Button from '../../../common/Button';
import { FOCUS_RING } from '../../../common/tokens';
import { addDays, parseDateKey } from '../../../../utils/schedule/weekRange';

/**
 * One date control: ‹ › step a day (weekends included); clicking the date
 * opens the calendar. Search highlights and dims; it never removes rows, so
 * the lorry/slot geometry never shifts under the eye.
 */
export default function DayBar({
  dateKey, query, onQuery, onDate, pendingCount, busy, onApproveAll, canEdit, approveSlot = null,
}) {
  const pickerRef = useRef(null);
  const d = parseDateKey(dateKey);
  const label = d ? format(d, 'EEE d MMM yyyy') : dateKey;

  const openCalendar = () => {
    const input = pickerRef.current;
    if (!input) return;
    // showPicker is the native calendar; older browsers fall back to focus.
    try { input.showPicker(); } catch { input.focus(); }
  };

  const approveButton = (
    <Button size="sm" icon={CheckCheck} disabled={!pendingCount || busy} onClick={onApproveAll}>
      Approve all ({pendingCount})
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex h-10 items-stretch rounded-md border border-gray-200 bg-white">
        <button
          type="button" onClick={() => onDate(addDays(dateKey, -1))} aria-label="Previous day"
          className={`px-1.5 py-1.5 text-gray-500 hover:bg-gray-50 ${FOCUS_RING}`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={openCalendar}
          aria-label={`${label}. Pick a date`}
          className={`inline-flex min-w-[10rem] items-center justify-center gap-1.5 px-2 py-1 text-sm font-medium tabular-nums text-gray-900 hover:bg-gray-50 ${FOCUS_RING}`}
        >
          <CalendarDays className="h-4 w-4 text-gray-400" aria-hidden="true" />
          {label}
        </button>
        <button
          type="button" onClick={() => onDate(addDays(dateKey, 1))} aria-label="Next day"
          className={`px-1.5 py-1.5 text-gray-500 hover:bg-gray-50 ${FOCUS_RING}`}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        {/* The calendar itself; kept in the layout (not display:none) so showPicker works. */}
        <input
          ref={pickerRef}
          type="date"
          value={dateKey}
          onChange={e => e.target.value && onDate(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0 opacity-0"
        />
      </div>

      <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <label className="sr-only" htmlFor="board-search">Search DO, address or customer</label>
        <input
          id="board-search"
          type="search"
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder="DO / address / customer"
          className={`h-10 w-full rounded-md border border-gray-200 bg-white pl-7 pr-2 text-xs ${FOCUS_RING}`}
        />
      </div>

      {canEdit && (approveSlot
        ? createPortal(approveButton, approveSlot)
        : <div className="ml-auto">{approveButton}</div>)}
    </div>
  );
}
