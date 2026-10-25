import React, { useId, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { cm3ToM3 } from '../../../../utils/schedule/capacityRules';

// Uses recharts, which was already a dependency and imported nowhere — this
// finally justifies it, and avoids adding a third charting library next to
// chart.js (used only by admin/dashboard/Overview.js).
//
// The one thing Excel does not give Mr Lee easily, so it reads as an upgrade
// rather than a replacement for his sheet.

const COLORS = {
  used: '#3b82f6',   // blue-500
  free: '#e5e7eb',   // gray-200
  count: '#ea580c',  // orange-600
};

export default function WeekCapacityChart({ summaries = [], onSelectDay }) {
  const tableId = useId();

  const data = useMemo(() => summaries
    .filter(s => s.isWorkingDay)
    .map(s => ({
      dateKey: s.dateKey,
      label: `${s.weekdayLabel} ${s.dayLabel}`,
      used: Number(cm3ToM3(s.volumeCm3).toFixed(1)),
      free: Number(Math.max(0, cm3ToM3(s.volumeCapCm3 - s.volumeCm3)).toFixed(1)),
      doCount: s.doCount,
      doCapacity: s.doCapacity,
    })), [summaries]);

  // Capacity differs by day (Thursday is far-area with two windows, so 50 not
  // 75), so the reference line uses the most common value across the week.
  const capacityLine = useMemo(() => {
    const counts = {};
    for (const d of data) counts[d.doCapacity] = (counts[d.doCapacity] ?? 0) + 1;
    return Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) || null;
  }, [data]);

  // After every hook: hooks must run in the same order on every render.
  if (!data.length) return null;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
        Weekly capacity vs demand
      </h3>

      <div className="h-56" aria-describedby={tableId}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
            onClick={(e) => {
              const dateKey = e?.activePayload?.[0]?.payload?.dateKey;
              if (dateKey) onSelectDay?.(dateKey);
            }}
          >
            <CartesianGrid strokeDasharray="2 2" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="vol" tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false} tickLine={false}
              label={{ value: 'm³', position: 'insideTopLeft', fontSize: 10, fill: '#9ca3af' }}
            />
            <YAxis
              yAxisId="count" orientation="right"
              tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
              formatter={(value, name) => [value, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="vol" dataKey="used" name="Scheduled m³" stackId="vol" fill={COLORS.used} />
            <Bar yAxisId="vol" dataKey="free" name="Free m³" stackId="vol" fill={COLORS.free} />
            <Line
              yAxisId="count" type="monotone" dataKey="doCount" name="DO count"
              stroke={COLORS.count} strokeWidth={2} dot={{ r: 3 }}
            />
            {capacityLine && (
              <ReferenceLine
                yAxisId="count" y={capacityLine} stroke={COLORS.count}
                strokeDasharray="4 3"
                label={{ value: `${capacityLine} DO cap`, fontSize: 10, fill: '#9ca3af', position: 'insideTopRight' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* recharts renders an SVG that a screen reader cannot read. The same
          numbers as a table, visually hidden, and it prints too. */}
      <table id={tableId} className="sr-only">
        <caption>Weekly capacity versus demand</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Scheduled m³</th>
            <th scope="col">Free m³</th>
            <th scope="col">Delivery orders</th>
            <th scope="col">Capacity</th>
          </tr>
        </thead>
        <tbody>
          {data.map(d => (
            <tr key={d.dateKey}>
              <th scope="row">{d.label}</th>
              <td>{d.used}</td>
              <td>{d.free}</td>
              <td>{d.doCount}</td>
              <td>{d.doCapacity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
