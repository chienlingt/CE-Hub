import { Clock, Truck } from 'lucide-react';
import TripProgressBar from './TripProgressBar';

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Shared summary card for an active time slot.
 * Used in ActiveTripsPanel (Overview teaser) and ActiveTripsList (Live Deliveries page).
 *
 * @param {{ trip: object, onClick?: (trip: object) => void, compact?: boolean }}
 */
export default function ActiveTripCard({ trip, onClick, compact = false }) {
  const orders = trip.orders || {};
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(trip)}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick(trip); }}
      className={`border border-orange-200 rounded-lg p-4 bg-orange-50 transition-colors
        ${onClick ? 'cursor-pointer hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-400' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500 flex-shrink-0" />
            <span className="font-semibold text-gray-900 text-sm">
              {trip.time_window_start} – {trip.time_window_end}
            </span>
            <span className="text-xs text-gray-500">{trip.date}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-600 flex-wrap">
            {trip.truck_plate && (
              <span className="flex items-center gap-1">
                <Truck className="h-3 w-3" />
                {trip.truck_plate}
              </span>
            )}
            {trip.delivery_team?.team_type && (
              <span>{trip.delivery_team.team_type}</span>
            )}
            {trip.departed_at && (
              <span>Departed {formatTime(trip.departed_at)}</span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-bold text-orange-700">
            {orders.delivered ?? 0} / {orders.total ?? 0}
          </div>
          <div className="text-xs text-gray-500">delivered</div>
        </div>
      </div>
      {!compact && (
        <TripProgressBar
          delivered={orders.delivered ?? 0}
          total={orders.total ?? 0}
          remaining={orders.remaining ?? 0}
        />
      )}
    </div>
  );
}
