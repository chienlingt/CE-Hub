import React from 'react';
import { ArrowRight, TrendingDown, TrendingUp, Minus } from 'lucide-react';

/**
 * What a config change actually does, computed live.
 *
 * This is what makes the grace-period control more than a number box: set it
 * from 15 to 30 and the access-window conflict count visibly drops. Honest
 * because validation is pure and client-side, so the preview runs the same
 * rules the board does.
 */
export default function ConfigImpactPreview({ before, after }) {
  if (!before || !after) return null;

  const rows = [
    { id: 'blocking', label: 'Blocking issues', a: before.blocking, b: after.blocking, lowerIsBetter: true },
    { id: 'access', label: 'Access-window conflicts', a: before.access, b: after.access, lowerIsBetter: true },
    { id: 'overtime', label: 'Slots running past their window', a: before.overtime, b: after.overtime, lowerIsBetter: true },
    { id: 'capacity', label: 'Slots over capacity', a: before.capacity, b: after.capacity, lowerIsBetter: true },
  ];

  const changed = rows.some(r => r.a !== r.b);

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
        Impact of these settings
      </h4>

      {!changed ? (
        <p className="py-2 text-[11px] text-gray-500">
          These settings produce the same plan as the saved ones.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => {
            const delta = row.b - row.a;
            const better = row.lowerIsBetter ? delta < 0 : delta > 0;
            const Icon = delta === 0 ? Minus : better ? TrendingDown : TrendingUp;
            const tone = delta === 0 ? 'text-gray-400' : better ? 'text-green-700' : 'text-red-700';

            return (
              <li key={row.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-gray-700">{row.label}</span>
                <span className="tabular-nums text-gray-500">{row.a}</span>
                <ArrowRight className="h-3 w-3 text-gray-300" aria-hidden="true" />
                <span className={`tabular-nums font-semibold ${tone}`}>{row.b}</span>
                <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
