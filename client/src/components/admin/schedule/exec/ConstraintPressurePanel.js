import React from 'react';
import { ChevronRight } from 'lucide-react';
import { badgeClass, FOCUS_RING } from '../../../common/tokens';

/**
 * Which §5 hard constraint is binding most often this week.
 *
 * This is the band that makes the dashboard more than a status page. A
 * utilisation percentage tells Mr Lee the week is full; a ranked list of what
 * blocked, and how often, tells him WHAT TO CHANGE — add an installer-capable
 * crew, release a 3-ton lorry, renegotiate a condo's access window. It is the
 * proposal's "every deferral has a stated reason" promise, aggregated to
 * management altitude.
 */
export default function ConstraintPressurePanel({ rows = [], onSelectCode }) {
  const total = rows.reduce((n, r) => n + r.count, 0);

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
        Binding constraints this week
      </h3>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-500">
          Nothing blocked this week — every booked order fits.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map(row => (
            <li key={row.constraint}>
              <div className="flex items-baseline gap-2">
                <span className="flex-1 truncate text-xs text-gray-700">{row.constraint}</span>
                <span className="tabular-nums text-xs font-semibold text-gray-900">{row.count}</span>
              </div>

              {/* Share-of-total bar, so the ranking is readable at a glance. */}
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-1 rounded-full bg-gray-400"
                  style={{ width: total ? `${(row.count / total) * 100}%` : '0%' }}
                />
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                {row.codes.map(code => (
                  <button
                    key={code.code}
                    type="button"
                    onClick={() => onSelectCode?.(code.code)}
                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium ${badgeClass(code.tone)} ${FOCUS_RING} hover:opacity-80`}
                  >
                    {code.label}
                    <span className="tabular-nums opacity-70">{code.count}</span>
                    <ChevronRight className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
