import React from 'react';
import { Route, Clock, MapPin, Info } from 'lucide-react';
import { badgeClass } from '../../../common/tokens';

// B.2 (Chien Ling's module) owns stop sequence, road travel times, ETAs and the
// loading order. This panel READS that output and never writes it — §8 of the
// design proposal gives B.1 no authority over any of it.
//
// The shape it reads is pinned in utils/schedule/b2Contract.js, because
// time_slots.route_plan is an untyped Json column written by
// server/services/intelligentRouteOptimizationService.js:243.

function RoutePlanEmptyState() {
  return (
    <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
      <Route className="mx-auto mb-1.5 h-5 w-5 text-gray-300" aria-hidden="true" />
      <p className="text-xs font-medium text-gray-600">Route not yet optimised</p>
      <p className="mt-0.5 text-[11px] text-gray-500">
        Stop sequence, arrival times and loading order come from Module B.2.
      </p>
    </div>
  );
}

function B2StatusBadge({ route }) {
  if (!route.hasPlan) {
    return (
      <span className={`rounded-full px-1.5 py-px text-[10px] font-medium ${badgeClass('gray')}`}>
        B.2 pending
      </span>
    );
  }
  return (
    <span className={`rounded-full px-1.5 py-px text-[10px] font-medium ${badgeClass('green')}`}>
      B.2 v{route.version}
    </span>
  );
}

const formatKm = (metres) => (metres ? `${(metres / 1000).toFixed(1)} km` : '—');
const formatDuration = (seconds) => {
  if (!seconds) return '—';
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
};

/**
 * @param {object} props
 * @param {object} props.route   lane.route, from selectSlotLaneVM
 * @param {object[]} props.orders  the slot's orders, in loading sequence
 */
export default function RoutePlanPanel({ route, orders = [] }) {
  const stops = Array.isArray(route?.plan?.stops) ? route.plan.stops : [];

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          Route &amp; loading plan
        </h4>
        <B2StatusBadge route={route} />
      </div>

      <div className="p-3">
        {!route?.hasPlan ? (
          <RoutePlanEmptyState />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-gray-400" aria-hidden="true" />
                <span className="tabular-nums">{formatKm(route.distanceM)}</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-gray-400" aria-hidden="true" />
                <span className="tabular-nums">{formatDuration(route.durationS)}</span>
              </span>
              {route.lastReason && (
                <span className="text-gray-500">reason: {route.lastReason}</span>
              )}
            </div>

            {stops.length > 0 ? (
              <ol className="space-y-1">
                {stops.map((stop, index) => (
                  <li key={stop.orderId ?? index} className="flex items-baseline gap-2 text-xs">
                    <span className="w-4 flex-shrink-0 text-right tabular-nums text-gray-400">
                      {index + 1}
                    </span>
                    <span className="flex-1 truncate font-mono text-[11px] text-gray-800">
                      {stop.doNo ?? stop.orderId}
                    </span>
                    <span className="tabular-nums text-gray-500">{stop.eta ?? '—'}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[11px] text-gray-500">
                A route exists but carries no stop list in this snapshot.
              </p>
            )}

            {/* Items are loaded in reverse delivery order, so the physical
                loading sequence is the delivery sequence backwards. */}
            {orders.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-2">
                <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500">
                  <Info className="h-3 w-3" aria-hidden="true" />
                  Loading order (last loaded is delivered first)
                </p>
                <p className="font-mono text-[11px] text-gray-700">
                  {[...orders].reverse().map(o => o.doNo).join(' → ')}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
