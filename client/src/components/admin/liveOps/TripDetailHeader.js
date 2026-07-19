import { Clock, Truck, Navigation, Users, AlertTriangle } from 'lucide-react';
import { getSlotStatusStyle, getSlotStatusLabel } from '../../../utils/slotStatusHelpers';
import { formatDateTime } from '../../../utils/orderHelpers';
import { countOverdueOrdersInTrip } from '../../../utils/liveOpsFilters';
import TripProgressBar from './TripProgressBar';

export default function TripDetailHeader({ trip }) {
  const orders = trip.orders || {};
  const slotStatus = trip.slot_status || 'scheduled';
  const overdueCount = countOverdueOrdersInTrip(trip);

  return (
    <div className={`p-5 border-b border-gray-100 ${overdueCount > 0 ? 'bg-gradient-to-r from-red-50 to-orange-50' : 'bg-gradient-to-r from-orange-50 to-amber-50'}`}>
      {/* Time window + date */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Clock className={`h-5 w-5 flex-shrink-0 ${overdueCount > 0 ? 'text-red-500' : 'text-orange-500'}`} />
        <span className="text-lg font-bold text-gray-900">
          {trip.time_window_start} – {trip.time_window_end}
        </span>
        <span className="text-sm text-gray-500">{trip.date}</span>
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            {overdueCount} overdue
          </span>
        )}
      </div>

      {overdueCount > 0 && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {overdueCount === 1
              ? 'One order is still Delivering past its slot date. Use Remind Driver below or ask the driver to update status.'
              : `${overdueCount} orders are still Delivering past their slot date. Use Remind Driver below or ask drivers to update status.`}
          </span>
        </div>
      )}

      {/* Slot status badge + departed */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${getSlotStatusStyle(slotStatus)}`}>
          {slotStatus === 'out_for_delivery' && <Navigation className="h-3 w-3" />}
          {getSlotStatusLabel(slotStatus)}
        </span>
        {trip.departed_at && (
          <span className="text-xs text-gray-500">Departed {formatDateTime(trip.departed_at)}</span>
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
