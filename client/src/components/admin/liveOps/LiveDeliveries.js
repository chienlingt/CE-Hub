// client/src/components/admin/liveOps/LiveDeliveries.js
//
// A.3.7+ Live Deliveries page — full admin/dispatcher view of active trips.
// Route: /dashboard/live-ops  (tab label: "Live Deliveries")
// Deep-link: /dashboard/live-ops?trip=<timeSlotId>

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { useActiveTrips } from '../../../hooks/useActiveTrips';
import { useTripStatus } from '../../../hooks/useTripStatus';
import LiveOpsHeader from './LiveOpsHeader';
import ActiveTripsList from './ActiveTripsList';
import TripDetailDrawer from './TripDetailDrawer';

export default function LiveDeliveries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTripId = searchParams.get('trip') || null;

  // Completion banner state
  const [completedBanner, setCompletedBanner] = useState(false);

  const { trips, loading: listLoading, error: listError, lastUpdated, refresh } = useActiveTrips();

  // Auto-close handler when trip ends
  const handleTripEnded = useCallback(() => {
    setSearchParams({}, { replace: true });
    setCompletedBanner(true);
    setTimeout(() => setCompletedBanner(false), 5000);
  }, [setSearchParams]);

  const { trip, loading: tripLoading, error: tripError, refresh: refreshTrip } = useTripStatus(
    selectedTripId,
    { onTripEnded: handleTripEnded }
  );

  // Dismiss invalid ?trip param (404 caught inside hook via onTripEnded)
  useEffect(() => {
    if (!selectedTripId) return;
    // Basic UUID format check — clear param if obviously wrong
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(selectedTripId)) {
      setSearchParams({}, { replace: true });
    }
  }, [selectedTripId, setSearchParams]);

  function openTrip(trip) {
    setSearchParams({ trip: trip.id }, { replace: true });
    setCompletedBanner(false);
  }

  function closeDrawer() {
    setSearchParams({}, { replace: true });
  }

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <LiveOpsHeader
          count={trips.length}
          lastUpdated={lastUpdated}
          onRefresh={refresh}
          loading={listLoading}
        />

        {/* Trip-completed banner */}
        {completedBanner && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            Trip completed — all orders are now terminal.
          </div>
        )}

        {/* List error */}
        {listError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Failed to load active trips: {listError}
          </div>
        )}

        {/* Skeleton while loading for the first time */}
        {listLoading && trips.length === 0 && (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-28 bg-gray-200 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!listLoading || trips.length > 0 ? (
          <ActiveTripsList
            trips={trips}
            onTripClick={openTrip}
            selectedTripId={selectedTripId}
          />
        ) : null}
      </div>

      {/* Trip detail drawer */}
      {selectedTripId && (
        <TripDetailDrawer
          trip={trip}
          loading={tripLoading}
          error={tripError}
          onClose={closeDrawer}
          refresh={refreshTrip}
        />
      )}
    </div>
  );
}
