// client/src/components/driver/DriverRoute.js
// Route tab — shows the driver today's pre-computed delivery sequence
// (Route Optimisation / B.2 output) as an ordered stop list plus an
// embedded Google Map. Never calls Google Maps itself for routing data —
// everything here was already computed once by the scheduler and is just
// being displayed (see server/services/googleRoutingService.js).

import { useState, useEffect, useMemo, useRef } from 'react';
import { MapPin, Navigation, Phone, MessageCircle, RefreshCw, AlertTriangle, Package } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDriverJobs } from '../../hooks/useDriverJobs';
import { useGoogleMapsScript } from '../../hooks/useGoogleMapsScript';
import { todayLocalDateKey } from '../../utils/dateKey';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';
import { callCustomer, openWhatsApp } from '../../utils/phoneHelpers';

function apiUrl(path) {
  return `${API_BASE.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`;
}

function fmtEta(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
}

function fmtDistance(m) {
  return m == null ? null : `${(m / 1000).toFixed(1)} km`;
}

function fmtDuration(s) {
  return s == null ? null : `${Math.round(s / 60)} min`;
}

export default function DriverRoute() {
  const { currentUser } = useAuth();
  const employeeId = currentUser?.employeeId || '';
  const today = todayLocalDateKey();

  const { slots, loading: slotsLoading } = useDriverJobs(employeeId);
  const { loaded: mapsLoaded, error: mapsError } = useGoogleMapsScript();

  const todaysSlots = useMemo(() => slots.filter(s => s.date === today), [slots, today]);

  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [route, setRoute]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const mapDivRef = useRef(null);

  // Default to the currently-departed slot if there is one, else the first.
  useEffect(() => {
    if (!selectedSlotId && todaysSlots.length > 0) {
      const active = todaysSlots.find(s => s.slot_status === 'departed') || todaysSlots[0];
      setSelectedSlotId(active.id);
    }
  }, [todaysSlots, selectedSlotId]);

  useEffect(() => {
    if (!selectedSlotId || !employeeId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(apiUrl(`driver/route/${selectedSlotId}?employee_id=${encodeURIComponent(employeeId)}`), {
      headers: { 'ngrok-skip-browser-warning': '1' },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => { if (!cancelled) setRoute(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [selectedSlotId, employeeId]);

  // Render the map once both Google Maps and route data are ready
  useEffect(() => {
    if (!mapsLoaded || !route || !mapDivRef.current || !window.google?.maps) return;

    const stopsWithCoords = route.stops.filter(s => s.latitude != null && s.longitude != null);
    if (stopsWithCoords.length === 0) return;

    const map = new window.google.maps.Map(mapDivRef.current, {
      zoom: 12,
      center: { lat: stopsWithCoords[0].latitude, lng: stopsWithCoords[0].longitude },
      disableDefaultUI: true,
      zoomControl: true,
    });

    const bounds = new window.google.maps.LatLngBounds();

    stopsWithCoords.forEach((stop, i) => {
      const position = { lat: stop.latitude, lng: stop.longitude };
      new window.google.maps.Marker({
        position,
        map,
        label: String(i + 1),
        title: stop.customer_name || stop.address || `Stop ${i + 1}`,
      });
      bounds.extend(position);
    });

    if (route.route_polyline && window.google.maps.geometry) {
      const path = window.google.maps.geometry.encoding.decodePath(route.route_polyline);
      new window.google.maps.Polyline({
        path,
        map,
        strokeColor:   '#2563eb',
        strokeWeight:  4,
        strokeOpacity: 0.8,
      });
      path.forEach(p => bounds.extend(p));
    }

    map.fitBounds(bounds, 48);
  }, [mapsLoaded, route]);

  if (!employeeId) {
    return <div className="p-6 text-center text-gray-400">No employee profile linked to this account.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Navigation className="w-5 h-5 text-blue-500" /> Route
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Today&apos;s delivery sequence and map.</p>
      </div>

      {todaysSlots.length > 1 && (
        <div className="px-4 flex gap-2 overflow-x-auto pb-2">
          {todaysSlots.map(slot => (
            <button
              key={slot.id}
              onClick={() => setSelectedSlotId(slot.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedSlotId === slot.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {slot.time_window_start}–{slot.time_window_end}
            </button>
          ))}
        </div>
      )}

      {(slotsLoading || loading) && (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
      )}

      {!slotsLoading && todaysSlots.length === 0 && (
        <div className="flex flex-col items-center py-16 text-gray-400 px-6 text-center">
          <Package className="w-10 h-10 mb-3" />
          <p className="font-medium">No route scheduled for today</p>
        </div>
      )}

      {error && (
        <div className="mx-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {route && !loading && (
        <>
          <div className="px-4 mb-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {route.stops.length} stop{route.stops.length !== 1 ? 's' : ''}
              </span>
              <span className="font-medium text-gray-700">
                {fmtDistance(route.route_distance_m) || '—'} · {fmtDuration(route.route_duration_s) || '—'}
              </span>
            </div>
          </div>

          <div className="px-4 mb-4">
            {mapsError ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                Map unavailable: {mapsError}
              </div>
            ) : (
              <div ref={mapDivRef} className="w-full h-64 rounded-xl border border-gray-200 bg-gray-100" />
            )}
          </div>

          <div className="px-4 space-y-2">
            {route.stops.map((stop, i) => (
              <div key={stop.order_id} className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {stop.customer_name || 'Customer'}
                      </p>
                      <span className="text-xs text-gray-400 flex-shrink-0">{fmtEta(stop.eta)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-start gap-1">
                      <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {stop.address || '—'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1 font-mono">
                      {stop.odoo_order_ref || 'Not Synced'} · Load Seq {stop.truck_loading_sequence ?? '—'}
                    </p>
                  </div>
                </div>
                {stop.customer_phone && (
                  <div className="flex gap-2 mt-2 pl-9">
                    <button
                      onClick={() => callCustomer(stop.customer_phone)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-600"
                    >
                      <Phone className="w-3 h-3" /> Call
                    </button>
                    <button
                      onClick={() => openWhatsApp(stop.customer_phone, `Hi ${stop.customer_name || ''}, your delivery is on the way.`)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-green-50 hover:bg-green-100 rounded-lg text-xs text-green-700"
                    >
                      <MessageCircle className="w-3 h-3" /> WhatsApp
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
