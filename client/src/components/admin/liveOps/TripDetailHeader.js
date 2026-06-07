import { Clock, Truck, Navigation, Users } from 'lucide-react';
import { getSlotStatusStyle, getSlotStatusLabel } from '../../../utils/slotStatusHelpers';
import TripProgressBar from './TripProgressBar';

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function TripDetailHeader({ trip }) {
  const orders = trip.orders || {};
  const slotStatus = trip.slot_status || 'scheduled';

  return (
    <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-amber-50">
      {/* Time window + date */}
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-5 w-5 text-orange-500 flex-shrink-0" />
        <span className="text-lg font-bold text-gray-900">
          {trip.time_window_start} – {trip.time_window_end}
        </span>
        <span className="text-sm text-gray-500">{trip.date}</span>
      </div>

      {/* Slot status badge + departed */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${getSlotStatusStyle(slotStatus)}`}>
          {slotStatus === 'out_for_delivery' && <Navigation className="h-3 w-3" />}
          {getSlotStatusLabel(slotStatus)}
        </span>
        {trip.departed_at && (
          <span className="text-xs text-gray-500">Departed {formatTime(trip.departed_at)}</span>
        )}
      </div>

      {/* Truck + team */}
      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
        {trip.truck_plate && (
          <span className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-gray-400" />
            {trip.truck_plate}
          </span>
        )}
        {trip.delivery_team?.team_type && (
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-gray-400" />
            {trip.delivery_team.team_type}
          </span>
        )}
      </div>

      {/* Progress */}
      <TripProgressBar
        delivered={orders.delivered ?? 0}
        total={orders.total ?? 0}
        remaining={orders.remaining ?? 0}
      />
    </div>
  );
}
