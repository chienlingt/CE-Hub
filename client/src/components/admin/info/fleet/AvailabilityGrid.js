import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FOCUS_RING } from '../../../common/tokens';
import { SESSIONS, formatDay, sessionLabel, weekday } from '../../../../utils/fleet/fleetRules';

// Full literal class strings so Tailwind keeps them.
const CELL = {
  ok: 'border-gray-200 bg-white text-gray-900 hover:border-gray-400',
  some: 'border-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-100',
  none: 'border-red-500 bg-red-50 text-red-800 hover:bg-red-100',
};

/**
 * Next 14 days × 3 sessions: trucks (and teams) available. Selecting a cell
 * opens the session panel with every truck and team.
 */
export default function AvailabilityGrid({ grid, selected, onSelect, rangeLabel, canPrev, onPrev, onNext, loading }) {
  return (
    <section aria-labelledby="fleet-grid-title" className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="fleet-grid-title" className="text-sm font-semibold text-gray-900">Next 14 days</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Trucks available per session. Select a session to see every truck and team, and block them from there.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button" onClick={onPrev} disabled={!canPrev} aria-label="Previous 14 days"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 ${FOCUS_RING}`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-medium text-gray-900">{rangeLabel}</span>
          <button
            type="button" onClick={onNext} aria-label="Next 14 days"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 ${FOCUS_RING}`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className={`min-w-[560px] ${loading ? 'opacity-60' : ''}`} aria-busy={loading ? 'true' : 'false'}>
          <div className="mb-2 grid grid-cols-[7rem_repeat(3,minmax(8rem,1fr))] gap-2 text-xs text-gray-600">
            <span className="font-medium">Date</span>
            {SESSIONS.map(s => (
              <span key={s.id}><span className="font-semibold text-gray-900">{s.label}</span> {s.start}–{s.end}</span>
            ))}
          </div>
          {grid.map(day => (
            <div key={day.date} className="mb-2 grid grid-cols-[7rem_repeat(3,minmax(8rem,1fr))] gap-2">
              <span className={`flex items-center text-sm font-medium ${weekday(day.date) === 0 ? 'text-gray-500' : 'text-gray-900'}`}>
                {formatDay(day.date)}
              </span>
              {day.sessions.map(cell => {
                const isSelected = selected?.date === day.date && selected?.session === cell.session;
                return (
                  <button
                    key={cell.session}
                    type="button"
                    onClick={() => onSelect({ date: day.date, session: cell.session })}
                    aria-pressed={isSelected}
                    aria-label={`${formatDay(day.date)}, ${sessionLabel(cell.session)}: ${cell.trucksAvailable} of ${cell.trucksTotal} trucks and ${cell.teamsAvailable} of ${cell.teamsTotal} teams available`}
                    className={`flex min-h-[3.25rem] flex-col justify-center rounded-md border px-3 py-1.5 text-left transition-colors ${CELL[cell.level]} ${isSelected ? 'ring-2 ring-blue-600 ring-offset-1' : ''} ${FOCUS_RING}`}
                  >
                    <span className="text-sm font-bold tabular-nums">
                      {cell.trucksAvailable}/{cell.trucksTotal} <span className="text-xs font-medium">trucks</span>
                    </span>
                    <span className="text-xs tabular-nums">
                      {cell.level === 'none' ? 'Closed in Odoo' : `${cell.teamsAvailable}/${cell.teamsTotal} teams`}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-700">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-gray-400 bg-white" />All available</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-500 bg-amber-50" />Some blocked</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-red-500 bg-red-50" />No trucks left: Odoo stops offering this session</span>
      </div>
    </section>
  );
}
