import React from 'react';
import KpiTile from './KpiTile';
import DaySummaryCard from './DaySummaryCard';
import WeekCapacityChart from './WeekCapacityChart';
import ConstraintPressurePanel from './ConstraintPressurePanel';

/**
 * The top-down architectural dashboard. Four bands, read top-to-bottom like a
 * spreadsheet: totals block, per-day columns, then the analysis.
 *
 * Layout only — it receives view models and computes nothing.
 */
export default function ExecDashboard({
  summaries = [],
  kpis = [],
  constraintPressure = [],
  selectedDateKey = null,
  onDrillDown,
  onSelectSlot,
  onKpiAction,
  onSelectCode,
}) {
  return (
    <div className="space-y-4">
      {/* Band 1 — totals */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map(kpi => (
          <KpiTile key={kpi.id} kpi={kpi} onSelect={onKpiAction} />
        ))}
      </div>

      {/* Band 2 — the 7-day working calendar. Scroll-snaps on narrow screens,
          following the date-strip pattern in driver/DriverDashboard.js. */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          Working calendar
        </h3>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory lg:overflow-visible lg:snap-none">
          {summaries.map(summary => (
            <div
              key={summary.dateKey}
              className={summary.isWorkingDay
                ? 'w-[78%] flex-shrink-0 snap-start sm:w-[46%] lg:w-auto lg:flex-1 lg:snap-align-none'
                : 'flex-shrink-0'}
            >
              <DaySummaryCard
                summary={summary}
                selected={summary.dateKey === selectedDateKey}
                onSelect={onDrillDown}
                onSelectSlot={onSelectSlot}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Bands 3 and 4 — side by side on wide screens, stacked below. */}
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <WeekCapacityChart summaries={summaries} onSelectDay={onDrillDown} />
        <ConstraintPressurePanel rows={constraintPressure} onSelectCode={onSelectCode} />
      </div>
    </div>
  );
}
