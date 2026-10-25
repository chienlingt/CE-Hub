import React from 'react';
import { Truck, Users, AlertTriangle, Lock } from 'lucide-react';
import Meter from '../../../common/Meter';
import { badgeClass, lifecycleMeta, FOCUS_RING } from '../../../common/tokens';
import { longDateLabel } from '../../../../utils/schedule/weekRange';

/**
 * One working day. Dense shorthand visually; the aria-label carries the same
 * information as a sentence, because the card is a grid of glyphs and numbers
 * that a screen reader cannot usefully narrate on its own.
 */
function DaySummaryCard({ summary, selected, onSelect, onSelectSlot }) {
  // Weekends are rendered rather than omitted — the engine skips Sat/Sun
  // (scheduler.js:332), and a silent gap in the week looks like missing data.
  if (!summary.isWorkingDay) {
    return (
      <div className="flex min-w-[56px] flex-col items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-2 py-3 text-center">
        <span className="text-[11px] font-medium text-gray-400">{summary.weekdayLabel}</span>
        <span className="text-lg font-semibold tabular-nums text-gray-300">{summary.dayLabel}</span>
        <span className="mt-1 text-[9px] uppercase tracking-wide text-gray-400">Closed</span>
      </div>
    );
  }

  const lifecycle = lifecycleMeta(summary.approvalState);
  const overCap = summary.doCount > summary.doCapacity;

  const ariaLabel = [
    longDateLabel(summary.dateKey) + '.',
    `${summary.doCount} of ${summary.doCapacity} deliveries.`,
    summary.volumePct !== null ? `${Math.round(summary.volumePct * 100)} percent capacity.` : 'Capacity unknown.',
    `${summary.trucksUsed} of ${summary.trucksAvailable} lorries.`,
    summary.exceptionCount ? `${summary.exceptionCount} exceptions.` : 'No exceptions.',
    lifecycle.label,
  ].join(' ');

  return (
    <div
      className={[
        'flex min-w-[170px] flex-1 flex-col rounded-md border bg-white p-2.5',
        selected ? 'border-blue-400' : 'border-gray-200',
        summary.isToday ? 'ring-2 ring-blue-600 ring-offset-1' : '',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelect?.(summary.dateKey)}
        aria-label={ariaLabel}
        className={`-m-0.5 rounded p-0.5 text-left ${FOCUS_RING}`}
      >
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            {summary.weekdayLabel} {summary.dayLabel}
          </span>
          {/* Never colour alone — a literal chip too. */}
          {summary.isToday && (
            <span className="rounded-full bg-blue-600 px-1.5 py-px text-[9px] font-semibold text-white">
              TODAY
            </span>
          )}
          {!summary.isToday && summary.isFarAreaDay && (
            <span className="text-[9px] uppercase tracking-wide text-gray-400" title="Far-area deliveries only">
              far
            </span>
          )}
        </div>

        <div className="mt-1 flex items-baseline gap-1">
          <span className={`text-lg font-semibold tabular-nums ${overCap ? 'text-red-700' : 'text-gray-900'}`}>
            {summary.doCount}
          </span>
          <span className="text-xs tabular-nums text-gray-500">/{summary.doCapacity} DO</span>
          {overCap && <span className="text-xs text-red-600" aria-hidden="true">▲</span>}
        </div>

        <Meter
          className="mt-1"
          pct={summary.volumePct}
          value={summary.volumePct === null ? '—' : `${Math.round(summary.volumePct * 100)}%`}
        />
      </button>

      {/* Per-window sub-rows: the slot is the real unit of capacity, and it is
          how Mr Lee thinks — three bookable windows a day, 25 DOs each. */}
      <div className="mt-2 space-y-0.5">
        {summary.windows.map(window => (
          <button
            key={window.windowId}
            type="button"
            onClick={() => onSelectSlot?.(summary.dateKey, window.slotIds[0])}
            title={window.timeLabel}
            className={`flex w-full items-center gap-1.5 rounded px-0.5 text-left text-[10px] hover:bg-gray-50 ${FOCUS_RING}`}
          >
            <span className="w-7 flex-shrink-0 font-medium text-gray-600">{window.label}</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200">
              <span
                className={`block h-1 rounded-full ${
                  window.doPct > 1 ? 'bg-red-500' : window.doPct > 0.85 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, (window.doPct ?? 0) * 100)}%` }}
              />
            </span>
            <span className="w-11 flex-shrink-0 text-right tabular-nums text-gray-500">
              {window.doCount}{window.doCap != null ? `/${window.doCap}` : ''}
            </span>
            {window.locked && <Lock className="h-2.5 w-2.5 text-orange-500" aria-label="locked" />}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2.5 border-t border-gray-100 pt-1.5 text-[10px] text-gray-500">
        <span className="flex items-center gap-0.5" title="Lorries used / available">
          <Truck className="h-3 w-3" aria-hidden="true" />
          <span className="tabular-nums">{summary.trucksUsed}/{summary.trucksAvailable}</span>
        </span>
        <span className="flex items-center gap-0.5" title="Crews used">
          <Users className="h-3 w-3" aria-hidden="true" />
          <span className="tabular-nums">{summary.teamsUsed}</span>
        </span>
        {summary.exceptionCount > 0 && (
          <span className="flex items-center gap-0.5 text-red-600" title="Blocking issues">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            <span className="tabular-nums">{summary.exceptionCount}</span>
          </span>
        )}
        <span className={`ml-auto rounded-full px-1.5 py-px text-[9px] font-semibold ${badgeClass(lifecycle.tone)}`}>
          {lifecycle.label}
        </span>
      </div>
    </div>
  );
}

export default React.memo(DaySummaryCard);
