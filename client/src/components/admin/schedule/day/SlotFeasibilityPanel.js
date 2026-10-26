import React from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';

/**
 * The §5 constraint-priority table as a live pass/fail checklist for one slot.
 *
 * This is where "intelligent scheduling" stops being a word: it shows the eight
 * B.1 checks actually being applied, in priority order, with the numbers behind
 * each. It is also the proposal's "every grouping, assignment and deferral has
 * a stated reason" promise made visible rather than asserted.
 */
export default function SlotFeasibilityPanel({ checks = [], compact = false }) {
  const failed = checks.filter(c => !c.ok).length;

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex items-baseline justify-between gap-2 border-b border-gray-200 px-3 py-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          Feasibility checks
        </h4>
        <span className={`text-[11px] tabular-nums font-medium ${failed ? 'text-red-700' : 'text-green-700'}`}>
          {failed ? `${failed} failing` : 'All pass'}
        </span>
      </div>

      <ul className={compact ? 'divide-y divide-gray-100' : 'divide-y divide-gray-100'}>
        {checks.map((check, index) => (
          <li key={check.id} className="flex items-start gap-2 px-3 py-1.5">
            {/* Priority number, matching the proposal's table, so the order is
                legible as deliberate rather than arbitrary. */}
            <span className="w-3 flex-shrink-0 pt-0.5 text-right text-[10px] tabular-nums text-gray-400">
              {index + 1}
            </span>

            <span className="mt-0.5 flex-shrink-0">
              {check.ok ? (
                <Check className="h-3.5 w-3.5 text-green-600" aria-label="pass" />
              ) : (
                <X className="h-3.5 w-3.5 text-red-600" aria-label="fail" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className={`block text-xs ${check.ok ? 'text-gray-700' : 'font-medium text-red-800'}`}>
                {check.label}
              </span>
              {check.detail && (
                <span className="block text-[11px] tabular-nums text-gray-500">{check.detail}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {failed > 0 && (
        <div className="flex items-start gap-1.5 border-t border-gray-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span>
            A failing hard constraint means this trip would not complete as planned.
            Resolve it or defer an order rather than dispatching it.
          </span>
        </div>
      )}
    </div>
  );
}
