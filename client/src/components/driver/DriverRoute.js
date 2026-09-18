// client/src/components/driver/DriverRoute.js
// Route tab — shows the driver today's pre-computed delivery sequence
// (Route Optimisation / B.2 output) as an ordered stop list plus an
// embedded Google Map. Never calls Google Maps itself for routing data —
// everything here was already computed once by the scheduler and is just
// being displayed (see server/services/googleRoutingService.js).

import { useState, useEffect, useMemo, useRef } from 'react';
import { MapPin, Navigation, RefreshCw, AlertTriangle, Package, Clock, Wrench, GripVertical, ArrowUp, ArrowDown, Check, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDriverJobs } from '../../hooks/useDriverJobs';
import { useGoogleMapsScript } from '../../hooks/useGoogleMapsScript';
import { todayLocalDateKey } from '../../utils/dateKey';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

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

function fmtClock(clock) {
  if (!clock) return 'Flexible';
  const [hour, minute] = clock.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return clock;
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-MY', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtAccessWindow(stop) {
  if (!stop.access_window_start && !stop.access_window_end) return 'Flexible';
  return `${fmtClock(stop.access_window_start)}–${fmtClock(stop.access_window_end)}`;
}

function googleMapsNavigationUrl(stop) {
  const destination = stop.latitude != null && stop.longitude != null
    ? `${stop.latitude},${stop.longitude}`
    : stop.address;
  if (!destination) return null;
  const params = new URLSearchParams({
    api: '1', destination, travelmode: 'driving', dir_action: 'navigate',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function openGoogleMapsNavigation(stop) {
  const url = googleMapsNavigationUrl(stop);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
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
  const [routeRefreshKey, setRouteRefreshKey] = useState(0);
  const [rerouting, setRerouting] = useState(false);
  const [rerouteMessage, setRerouteMessage] = useState(null);
  const [arranging, setArranging] = useState(false);
  const [draftStops, setDraftStops] = useState([]);
  const [draggedStopId, setDraggedStopId] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [resettingRoute, setResettingRoute] = useState(false);
  const [showFallbackNotice, setShowFallbackNotice] = useState(true);
  const [showHttpsNotice, setShowHttpsNotice] = useState(true);

  const mapDivRef = useRef(null);

  useEffect(() => {
    if (!arranging) setDraftStops(route?.stops || []);
  }, [route, arranging]);

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
  }, [selectedSlotId, employeeId, routeRefreshKey]);

  async function handleReoptimise() {
    if (!selectedSlotId || rerouting) return;
    setRerouting(true);
    setRerouteMessage(null);
    let location = {};
    if (navigator.geolocation) {
      location = await new Promise(resolve => navigator.geolocation.getCurrentPosition(
        pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve({}),
        { timeout: 8000, maximumAge: 30000 }
      ));
    }
    try {
      const res = await fetch(apiUrl(`driver/route/${selectedSlotId}/reoptimize`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ employee_id: employeeId, ...location, reason: 'driver_traffic_check' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRerouteMessage(data.applied
        ? `Route updated${data.saved_seconds > 0 ? ` — saves ${Math.round(data.saved_seconds / 60)} min` : ''}.`
        : 'Existing route kept — improvement was insignificant.');
      setRouteRefreshKey(k => k + 1);
    } catch (err) {
      setRerouteMessage(`Re-routing unavailable: ${err.message}`);
    } finally {
      setRerouting(false);
    }
  }

  async function resetOptimalRoute() {
    if (!selectedSlotId || resettingRoute) return;
    setResettingRoute(true);
    setRerouteMessage(null);
    try {
      const res = await fetch(apiUrl(`driver/route/${selectedSlotId}/reoptimize`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({
          employee_id: employeeId,
          reason: 'driver_reset_to_optimal',
          force: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRerouteMessage('System-recommended optimal route restored.');
      setRouteRefreshKey(key => key + 1);
    } catch (err) {
      setRerouteMessage(`Could not reset route: ${err.message}`);
    } finally {
      setResettingRoute(false);
    }
  }

  function moveStop(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= draftStops.length || fromIndex === toIndex) return;
    setDraftStops(current => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleDrop(targetId) {
    if (!draggedStopId || draggedStopId === targetId) return;
    const fromIndex = draftStops.findIndex(stop => stop.order_id === draggedStopId);
    const toIndex = draftStops.findIndex(stop => stop.order_id === targetId);
    moveStop(fromIndex, toIndex);
    setDraggedStopId(null);
  }

  async function saveManualOrder() {
    if (!selectedSlotId || savingOrder) return;
    setSavingOrder(true);
    setRerouteMessage(null);
    let location = {};
    if (navigator.geolocation && window.isSecureContext) {
      location = await new Promise(resolve => navigator.geolocation.getCurrentPosition(
        pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve({}),
        { timeout: 5000, maximumAge: 30000 }
      ));
    }
    try {
      let confirmedViolations = false;
      let data;
      while (true) {
        const res = await fetch(apiUrl(`driver/route/${selectedSlotId}/reorder`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
          body: JSON.stringify({
            employee_id: employeeId,
            ordered_order_ids: draftStops.map(stop => stop.order_id),
            confirm_access_window_violations: confirmedViolations,
            ...location,
          }),
        });
        data = await res.json();
        if (res.status !== 409 || !data.requires_confirmation) {
          if (!res.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
          break;
        }

        const warningLines = (data.violations || []).map(violation => {
          const stop = draftStops.find(item => item.order_id === violation.order_id);
          return `• ${stop?.customer_name || stop?.odoo_order_ref || 'Stop'}: approximately ${violation.minutes_late} min outside its access window`;
        });
        const proceed = window.confirm(
          `This manual order violates access windows:\n\n${warningLines.join('\n')}\n\nSave this route anyway?`
        );
        if (!proceed) return;
        confirmedViolations = true;
      }
      setArranging(false);
      setRerouteMessage('Manual route saved. ETAs, road legs and loading sequence were recalculated.');
      setRouteRefreshKey(key => key + 1);
    } catch (err) {
      setRerouteMessage(`Could not save route: ${err.message}`);
    } finally {
      setSavingOrder(false);
    }
  }

  // Render the map once both Google Maps and route data are ready
  useEffect(() => {
    if (!mapsLoaded || !route || !mapDivRef.current ||
        typeof window.google?.maps?.Map !== 'function' ||
        typeof window.google?.maps?.LatLngBounds !== 'function') return;

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
      const marker = new window.google.maps.Marker({
        position,
        map,
        label: String(i + 1),
        title: stop.customer_name || stop.address || `Stop ${i + 1}`,
      });
      marker.addListener('click', () => openGoogleMapsNavigation(stop));
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
    let driverMarker = null;
    let hasCenteredOnDriver = false;
    const watchId = navigator.geolocation && window.isSecureContext
      ? navigator.geolocation.watchPosition(
          ({ coords }) => {
            const position = { lat: coords.latitude, lng: coords.longitude };
            if (!driverMarker) {
              driverMarker = new window.google.maps.Marker({
                position,
                map,
                title: 'Your live location',
                zIndex: 999,
                icon: {
                  path: window.google.maps.SymbolPath.CIRCLE,
                  fillColor: '#2563eb',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 3,
                  scale: 8,
                },
              });
            } else {
              driverMarker.setPosition(position);
            }
            if (!hasCenteredOnDriver) {
              bounds.extend(position);
              map.fitBounds(bounds, 48);
              hasCenteredOnDriver = true;
            }
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
        )
      : null;

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (driverMarker) driverMarker.setMap(null);
    };
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
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 pb-6">
          <section className="mb-3 rounded-xl border border-gray-200 bg-white px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center divide-x divide-gray-200 text-sm">
                <div className="pr-3">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Stops</p>
                  <p className="font-semibold text-gray-800">{route.stops.length}</p>
                </div>
                <div className="px-3">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Distance</p>
                  <p className="font-semibold text-gray-800">{fmtDistance(route.route_distance_m) || '—'}</p>
                </div>
                <div className="pl-3">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Drive time</p>
                  <p className="font-semibold text-gray-800">{fmtDuration(route.route_duration_s) || '—'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {arranging ? (
                  <>
                    <button
                      onClick={() => { setArranging(false); setDraftStops(route.stops); }}
                      disabled={savingOrder}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                    <button
                      onClick={saveManualOrder}
                      disabled={savingOrder}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingOrder ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {savingOrder ? 'Saving' : 'Save order'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setDraftStops(route.stops); setArranging(true); }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <GripVertical className="h-3.5 w-3.5" /> Arrange
                    </button>
                    <button
                      onClick={resetOptimalRoute}
                      disabled={resettingRoute}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${resettingRoute ? 'animate-spin' : ''}`} />
                      {resettingRoute ? 'Resetting' : 'Reset optimal'}
                    </button>
                    <button
                      onClick={handleReoptimise}
                      disabled={rerouting}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${rerouting ? 'animate-spin' : ''}`} />
                      {rerouting ? 'Checking traffic' : 'Check traffic'}
                    </button>
                  </>
                )}
              </div>
            </div>
            {rerouteMessage && (
              <div className="mt-2 flex items-start justify-between gap-3 border-t border-gray-100 pt-2 text-xs text-gray-600">
                <p>{rerouteMessage}</p>
                <button onClick={() => setRerouteMessage(null)} aria-label="Close message" className="shrink-0 rounded p-0.5 hover:bg-gray-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {route.route_plan?.used_fallback && showFallbackNotice && (
              <div className="mt-2 flex items-start justify-between gap-3 border-t border-gray-100 pt-2 text-xs text-amber-700">
                <p>Road service unavailable — using straight-line estimates.</p>
                <button onClick={() => setShowFallbackNotice(false)} aria-label="Close notice" className="shrink-0 rounded p-0.5 hover:bg-amber-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start">
            <section className="md:col-span-5 lg:col-span-6 md:sticky md:top-3">
              {mapsError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  Map unavailable: {mapsError}
                </div>
              ) : (
                <div ref={mapDivRef} className="h-56 w-full rounded-xl border border-gray-200 bg-gray-100 sm:h-72 md:h-[420px] lg:h-[520px]" />
              )}
              {route.stops[0] && (
                <button
                  onClick={() => openGoogleMapsNavigation(route.stops[0])}
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  <Navigation className="h-4 w-4" /> Navigate to next stop
                </button>
              )}
              {!window.isSecureContext && showHttpsNotice && (
                <div className="mt-2 flex items-start justify-center gap-2 text-[10px] leading-4 text-gray-400">
                  <p>Live location requires HTTPS. Google Maps navigation still works.</p>
                  <button onClick={() => setShowHttpsNotice(false)} aria-label="Close instruction" className="shrink-0 rounded p-0.5 hover:bg-gray-100">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </section>

            <section className="md:col-span-7 lg:col-span-6" aria-label="Delivery stops">
              <div className="space-y-0">
                {(arranging ? draftStops : route.stops).map((stop, i) => (
                  <article
                    key={stop.order_id}
                    draggable={arranging}
                    onDragStart={event => {
                      setDraggedStopId(stop.order_id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={event => { if (arranging) event.preventDefault(); }}
                    onDrop={() => handleDrop(stop.order_id)}
                    onDragEnd={() => setDraggedStopId(null)}
                    className={`relative pl-9 sm:pl-10 ${arranging ? 'cursor-grab active:cursor-grabbing' : ''} ${draggedStopId === stop.order_id ? 'opacity-40' : ''}`}
                  >
                    {i < (arranging ? draftStops.length : route.stops.length) - 1 && (
                      <span className="absolute bottom-0 left-[13px] top-7 w-px bg-gray-200 sm:left-[15px]" aria-hidden="true" />
                    )}
                    <span className="absolute left-0 top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-900 text-[11px] font-bold text-white shadow-sm sm:h-8 sm:w-8">
                      {i + 1}
                    </span>

                    {stop.segment && !arranging && (
                      <div className="mb-1 flex min-h-7 flex-wrap items-center gap-x-1.5 text-[10px] font-medium text-gray-400 sm:text-[11px]">
                        <span>{i === 0 ? 'Warehouse' : `Stop ${i}`} → Stop {i + 1}</span>
                        <span>·</span>
                        <span>{fmtDuration(stop.segment.travel_time_s) || '—'}</span>
                        <span>·</span>
                        <span>{fmtDistance(stop.segment.distance_m) || '—'}</span>
                      </div>
                    )}

                    <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        {arranging && <GripVertical className="mt-0.5 hidden h-5 w-5 flex-shrink-0 text-gray-300 sm:block" />}
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold text-gray-900 sm:text-base">{stop.customer_name || 'Customer'}</h2>
                          <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-gray-500">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                            <span>{stop.address || '—'}</span>
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">ETA</p>
                          <p className="text-sm font-semibold text-blue-700">{fmtEta(stop.eta)}</p>
                        </div>
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-100 pt-3 text-xs sm:grid-cols-3">
                        <div>
                          <dt className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Access window</dt>
                          <dd className="mt-0.5 flex items-center gap-1 font-medium text-gray-700">
                            <Clock className="h-3 w-3" /> {fmtAccessWindow(stop)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Work</dt>
                          <dd className="mt-0.5 flex items-center gap-1 font-medium text-gray-700">
                            <Wrench className="h-3 w-3" /> {stop.work_type || 'Delivery'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Duration</dt>
                          <dd className="mt-0.5 font-medium text-gray-700">
                            {stop.work_duration_min != null ? `${stop.work_duration_min} min` : '—'}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                        <p className="font-mono text-[10px] text-gray-400">
                          {stop.odoo_order_ref || 'Not Synced'} · Load {stop.truck_loading_sequence ?? '—'}
                        </p>
                        <button
                          onClick={() => openGoogleMapsNavigation(stop)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          <Navigation className="h-3.5 w-3.5" /> Navigate
                        </button>
                        {arranging && (
                          <div className="ml-auto flex gap-1 sm:hidden">
                            <button
                              onClick={() => moveStop(i, i - 1)}
                              disabled={i === 0}
                              aria-label={`Move ${stop.customer_name || `stop ${i + 1}`} earlier`}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-25"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => moveStop(i, i + 1)}
                              disabled={i === draftStops.length - 1}
                              aria-label={`Move ${stop.customer_name || `stop ${i + 1}`} later`}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-25"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
