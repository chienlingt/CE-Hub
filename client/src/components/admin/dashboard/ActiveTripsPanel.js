// client/src/components/admin/dashboard/ActiveTripsPanel.js
//
// A.3.7a: Compact teaser on Dashboard Overview (max 3 trips).
// Full list + drill-down lives at /dashboard/live-ops.

import { Navigation, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useActiveTrips } from '../../../hooks/useActiveTrips';
import ActiveTripCard from '../liveOps/ActiveTripCard';
import LiveOpsEmptyState from '../liveOps/LiveOpsEmptyState';

const MAX_PREVIEW = 3;

export default function ActiveTripsPanel() {
  const navigate = useNavigate();
  const { trips, loading, error, lastUpdated } = useActiveTrips();

  const formatTime = (date) => {
    if (!date) return null;
    return date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const preview  = trips.slice(0, MAX_PREVIEW);
  const overflow = trips.length - MAX_PREVIEW;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Navigation className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-gray-900">Active Trips</h2>
          {trips.length > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
              {trips.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {lastUpdated && <span>Updated {formatTime(lastUpdated)}</span>}
          <button
            onClick={() => navigate('/dashboard/live-ops')}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            View all →
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && trips.length === 0 && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      )}

      {!loading && trips.length === 0 && <LiveOpsEmptyState />}

      {preview.length > 0 && (
        <div className="space-y-3">
          {preview.map(trip => (
            <ActiveTripCard
              key={trip.id}
              trip={trip}
              onClick={t => navigate(`/dashboard/live-ops?trip=${t.id}`)}
            />
          ))}
          {overflow > 0 && (
            <button
              onClick={() => navigate('/dashboard/live-ops')}
              className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 font-medium text-center border border-dashed border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              +{overflow} more trip{overflow > 1 ? 's' : ''} — View all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
