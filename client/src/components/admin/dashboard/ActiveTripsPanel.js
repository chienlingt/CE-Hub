// client/src/components/admin/dashboard/ActiveTripsPanel.js
//
// A.3.7a: Live overview of all slots currently out_for_delivery.
// Polls GET /api/time-slots/active every 30s.
// timeSlotId is the canonical trip key — no lorry_trips.id dependency.

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Clock, Navigation, RefreshCw, Truck } from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';
const POLL_INTERVAL_MS = 30_000;

export default function ActiveTripsPanel() {
  const [trips, setTrips]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError]       = useState(null);
  const timerRef                = useRef(null);

  const fetchActiveTrips = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-slots/active`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTrips(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('[ActiveTripsPanel] fetch failed:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveTrips();
    timerRef.current = setInterval(fetchActiveTrips, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, []);

  const progressPct = (trip) => {
    const total = trip.orders?.total || 0;
    if (total === 0) return 0;
    return Math.round(((trip.orders?.delivered || 0) / total) * 100);
  };

  const formatTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Trips</h2>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      </div>
    );
  }

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
            onClick={() => { setLoading(true); fetchActiveTrips(); }}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-gray-400">
          <Truck className="h-8 w-8 mb-2" />
          <p className="text-sm">No trucks currently out for delivery</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trips.map(trip => {
            const pct = progressPct(trip);
            return (
              <div key={trip.id} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* Slot time window */}
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-orange-500 flex-shrink-0" />
                      <span className="font-semibold text-gray-900 text-sm">
                        {trip.time_window_start} – {trip.time_window_end}
                      </span>
                      <span className="text-xs text-gray-500">{trip.date}</span>
                    </div>
                    {/* Truck + team */}
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
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
                  {/* Order counts */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-orange-700">
                      {trip.orders?.delivered ?? 0} / {trip.orders?.total ?? 0}
                    </div>
                    <div className="text-xs text-gray-500">delivered</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{pct}% complete</span>
                    <span>{trip.orders?.remaining ?? 0} remaining</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
