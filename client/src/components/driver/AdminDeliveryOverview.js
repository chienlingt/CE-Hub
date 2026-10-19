import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapPin, Map as MapIcon, RefreshCw, Truck, Users, ChevronDown, GripVertical, Check, X, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../utils/apiBaseUrl';
import { useGoogleMapsScript } from '../../hooks/useGoogleMapsScript';
import DriverRoute from './DriverRoute';
import { DRIVER_TABS } from '../../utils/driverStatusMap';
import { adminSlotOptions, filterAdminTeamRoutes } from '../../utils/adminDeliveryFilters';

const api = path => `${API_BASE_URL.replace(/\/$/, '')}/api/${path}`;
const duration = seconds => seconds == null ? '—' : Math.round(seconds / 60) >= 60 ? `${Math.floor(Math.round(seconds / 60) / 60)}h ${Math.round(seconds / 60) % 60}m` : `${Math.round(seconds / 60)} min`;
const distance = meters => meters == null ? '—' : `${(meters / 1000).toFixed(1)} km`;
const active = status => !['Delivered', 'Installing', 'Failed', 'Cancelled'].includes(status);

function AdminRun({ run, fullRun, date, controls, controlsRef, onRefresh, highlightNext }) {
  const [expanded, setExpanded] = useState(true);
  const allJobs = useMemo(() => fullRun.orders.map(order => ({
    id: order.id, status: order.status, customer_name: order.customer_name,
    address: order.address, odoo_order_ref: order.reference, assigned_date: date,
    time_slot_id: fullRun.id, time: order.eta,
  })), [fullRun, date]);
  const jobs = useMemo(() => allJobs.filter(job => run.orders.some(order => order.id === job.id)), [allJobs, run]);
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <button type="button" aria-expanded={expanded || controls.arranging} aria-controls={`admin-run-${run.id}`} disabled={controls.busy || controls.arranging} onClick={() => setExpanded(value => !value)} className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-blue-50 px-4 py-3 text-left text-xs transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-default">
      <div><p className="font-semibold text-gray-800">{run.start || 'Unscheduled'} – {run.end || '—'} · {run.truck_plate || 'Truck unassigned'}</p><p className="mt-1 text-gray-500">{run.pair.join(' + ') || 'Pair unassigned'}</p></div>
      <div className="flex items-center gap-3"><span className="text-gray-500">{run.orders.length} DO · {distance(run.distance_m)} · {duration(run.drive_seconds)} drive</span><span className="rounded-lg border border-blue-100 bg-white/80 p-1.5 text-blue-600"><ChevronDown size={16} className={`transition-transform ${expanded || controls.arranging ? 'rotate-180' : ''}`} /></span></div>
    </button>
    <div id={`admin-run-${run.id}`} className={expanded || controls.arranging ? '' : 'hidden'}>
      <DriverRoute slotId={run.id} jobs={jobs} allJobs={allJobs} refreshToken={allJobs} onRefresh={onRefresh} sharedControls={controls} controlsRef={controlsRef} adminView highlightNext={highlightNext} />
    </div>
  </div>;
}

function TeamMap({ teams, filtered }) {
  const { loaded, error } = useGoogleMapsScript();
  const mapRef = useRef(null);
  useEffect(() => {
    if (!loaded || !mapRef.current || typeof window.google?.maps?.Map !== 'function') return;
    const element = mapRef.current;
    const stops = teams.flatMap(team => team.runs.flatMap(run => run.orders.map(order => ({ ...order, team: team.name, plate: run.truck_plate })))).filter(order => order.latitude != null && order.longitude != null);
    if (!stops.length) return;
    const map = new window.google.maps.Map(element, { center: { lat: stops[0].latitude, lng: stops[0].longitude }, zoom: 11, disableDefaultUI: true, zoomControl: true });
    const bounds = new window.google.maps.LatLngBounds();
    const markers = stops.map((stop, index) => {
      const position = { lat: stop.latitude, lng: stop.longitude };
      bounds.extend(position);
      const marker = new window.google.maps.Marker({ map, position, label: String(index + 1), title: `${stop.team} · ${stop.plate || ''}\n${stop.reference} · ${stop.customer_name}` });
      return marker;
    });
    if (!filtered && window.google.maps.geometry?.encoding) teams.forEach((team, index) => team.runs.forEach(run => {
      if (!run.route_polyline) return;
      const path = window.google.maps.geometry.encoding.decodePath(run.route_polyline);
      new window.google.maps.Polyline({ map, path, strokeColor: ['#2563eb', '#059669', '#9333ea', '#d97706'][index % 4], strokeWeight: 4, strokeOpacity: 0.7 });
    }));
    map.fitBounds(bounds, 40);
    return () => { markers.forEach(marker => marker.setMap(null)); window.google.maps.event?.clearInstanceListeners?.(map); element.replaceChildren(); };
  }, [loaded, teams, filtered]);
  const points = teams.flatMap(team => team.runs.flatMap(run => run.orders)).filter(order => order.latitude != null && order.longitude != null);
  if (error) return <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Map unavailable: {error}</p>;
  if (!points.length) return <p className="p-3 text-sm text-gray-500">No coordinates for these deliveries.</p>;
  return <div ref={mapRef} aria-label="Delivery teams map" className="h-72 rounded-xl border border-gray-200 bg-gray-100 sm:h-96" />;
}

export default function AdminDeliveryOverview() {
  const { currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : today;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [teamSearch, setTeamSearch] = useState('');
  const [sort, setSort] = useState({ field: 'name', direction: 1 });
  const [search, setSearch] = useState('');
  const [slotFilter, setSlotFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showMap, setShowMap] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeMessage, setRouteMessage] = useState('');
  const routeRefs = useRef(new Map());
  const requestNumber = useRef(0);
  const cancelRequests = useCallback(() => { requestNumber.current++; }, []);
  const refresh = useCallback(async (silent = false) => {
    if (!currentUser?.employeeId) return;
    const request = ++requestNumber.current;
    if (!silent) setLoading(true);
    try {
      const response = await fetch(api(`driver/admin/overview?employee_id=${encodeURIComponent(currentUser.employeeId)}&date=${date}`), { headers: { 'ngrok-skip-browser-warning': '1' } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load teams');
      if (request === requestNumber.current) { setData(result); setError(''); }
    } catch (err) { if (request === requestNumber.current) setError(err.message); }
    finally { if (request === requestNumber.current) setLoading(false); }
  }, [currentUser?.employeeId, date]);
  useEffect(() => {
    setData(null); setSelected(null);
    refresh(); const timer = setInterval(() => refresh(true), 30000);
    return () => { clearInterval(timer); cancelRequests(); };
  }, [refresh, cancelRequests]);
  const teams = useMemo(() => data?.date === date ? data.teams : [], [data, date]);
  const selectedTeam = selected ?? teams.find(team => team.total_do > 0)?.id ?? teams[0]?.id ?? 'all';
  const teamRows = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    return teams.filter(team => !q || `${team.name} ${team.truck_plates.join(' ')} ${team.pairs.join(' ')} ${team.areas.map(area => area.name).join(' ')}`.toLowerCase().includes(q)).sort((a, b) => {
      const first = a[sort.field]; const second = b[sort.field];
      if (first == null) return second == null ? 0 : 1;
      if (second == null) return -1;
      return (typeof first === 'number' ? first - second : String(first).localeCompare(String(second), undefined, { numeric: true })) * sort.direction;
    });
  }, [teams, teamSearch, sort]);
  const sortBy = field => setSort(current => ({ field, direction: current.field === field ? -current.direction : 1 }));
  const slotOptions = useMemo(() => adminSlotOptions(teams, selectedTeam), [teams, selectedTeam]);
  useEffect(() => { setSlotFilter('all'); }, [date]);
  useEffect(() => {
    if (data?.date === date && !slotOptions.some(option => option.value === slotFilter)) setSlotFilter('all');
  }, [slotOptions, slotFilter, data?.date, date]);
  const visible = useMemo(() => filterAdminTeamRoutes(teams, {
    selectedTeam, search, slot: slotFilter, status: statusFilter,
  }), [teams, selectedTeam, search, slotFilter, statusFilter]);
  const editableRuns = visible.flatMap(team => team.runs).filter(run => run.orders.some(order => active(order.status)));
  useEffect(() => { setArranging(false); setRouteMessage(''); }, [selectedTeam, search, date, slotFilter, statusFilter]);
  const selectTeam = id => { if (!routeBusy) setSelected(id); };
  function beginArrange() {
    if (!editableRuns.length || editableRuns.some(run => !routeRefs.current.get(run.id)?.current?.ready)) {
      setRouteMessage('Routes are still loading. Please try again.'); return;
    }
    setRouteMessage(''); setArranging(true);
  }
  async function applyRoutes(action) {
    const controllers = editableRuns.map(run => routeRefs.current.get(run.id)?.current);
    if (!controllers.length || controllers.some(controller => !controller?.ready)) { setRouteMessage('Routes are still loading. Please try again.'); return; }
    setRouteBusy(true); setRouteMessage('');
    try {
      let success = true;
      for (const controller of controllers) if (!await controller[action]()) { success = false; break; }
      if (success) { setArranging(false); setRouteMessage(action === 'optimal' ? 'Optimal routes restored.' : 'Delivery sequence saved.'); }
      else setRouteMessage('Some changes were not saved. Review the affected slot.');
      await refresh(true);
    } finally { setRouteBusy(false); }
  }
  return <div className="mx-auto max-w-7xl space-y-3 pb-6">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-700 p-4 text-white">
      <div><h1 className="text-base font-bold">Delivery teams</h1><p className="mt-1 text-xs text-blue-100">{data?.date === date ? `${teams.filter(team => team.total_do > 0).length}/${teams.length} teams assigned · ${data.total_do} DO · ${data.total_items} items` : 'Daily overview'}</p></div>
      <div className="flex items-center gap-2"><input disabled={routeBusy} aria-label="Delivery date" type="date" value={date} onChange={event => { if (event.target.value) setParams({ date: event.target.value }); }} className="min-h-10 rounded-lg bg-white px-2 text-sm text-gray-800" /><button type="button" disabled={routeBusy} onClick={() => refresh()} aria-label="Refresh teams" className="rounded-lg bg-white/10 p-3"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></div>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading && !data && <p className="p-4 text-sm text-gray-500">Loading delivery teams…</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-gray-500">{teamRows.length} teams · select a team for its deliveries</p>
      <div className="relative w-full sm:w-72">
        <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input aria-label="Find delivery team" value={teamSearch} onChange={event => setTeamSearch(event.target.value)} placeholder="Find team, plate, pair or area" className="min-h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs" />
      </div>
    </div>
    <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white lg:block">
      <div className="max-h-[52vh] overflow-auto">
        <table className="w-full min-w-[880px] text-left text-xs">
          <caption className="sr-only">Delivery team comparison for {date}</caption>
          <thead className="sticky top-0 z-10 bg-gray-100 text-[11px] text-gray-500"><tr>
            {[['Team', 'name'], ['Truck', null], ['Delivery pair', null], ['DO', 'total_do'], ['Items', 'total_items'], ['Distance', 'distance_m'], ['Drive time', 'drive_seconds'], ['Area', null]].map(([label, field]) => <th key={label} scope="col" aria-sort={field ? sort.field === field ? sort.direction === 1 ? 'ascending' : 'descending' : 'none' : undefined} className={`whitespace-nowrap px-3 py-2 font-medium ${field === 'name' ? 'sticky left-0 z-20 bg-gray-100' : ''} ${['DO', 'Items', 'Distance', 'Drive time'].includes(label) ? 'text-right' : ''}`}>
              {field ? <button type="button" onClick={() => sortBy(field)} className="inline-flex min-h-8 items-center gap-1 hover:text-blue-700">{label}<span aria-hidden="true" className="text-gray-400">{sort.field === field ? sort.direction === 1 ? '↑' : '↓' : '↕'}</span></button> : label}
            </th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-100">{teamRows.map(team => <tr key={team.id} onClick={() => selectTeam(team.id)} className={`cursor-pointer transition-colors ${selectedTeam === team.id ? 'bg-blue-50' : 'hover:bg-gray-50'} ${!team.total_do ? 'text-gray-400' : 'text-gray-700'}`}>
            <th scope="row" className={`sticky left-0 z-0 border-l-2 px-3 py-2.5 font-normal ${selectedTeam === team.id ? 'border-blue-500 bg-blue-50' : 'border-transparent bg-white'}`}><button type="button" disabled={routeBusy} onClick={() => selectTeam(team.id)} aria-pressed={selectedTeam === team.id} className="text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{team.name}</button><p className="mt-1 text-[10px] text-gray-400">{team.delivered}/{team.total_do} delivered{team.failed ? ` · ${team.failed} failed` : ''}</p></th>
            <td className="max-w-32 px-3 py-2.5 font-medium">{team.truck_plates.join(' / ') || '—'}</td>
            <td className="max-w-44 px-3 py-2.5"><span className="line-clamp-2" title={team.pairs.join(' / ')}>{team.pairs.join(' / ') || '—'}</span></td>
            <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{team.total_do}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{team.total_items}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" title={team.distance_incomplete ? 'Incomplete route estimates' : 'Planned distance'}>{distance(team.distance_m)}{team.distance_m != null && team.distance_incomplete ? '+' : ''}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" title={team.drive_time_incomplete ? 'Incomplete route estimates' : 'Planned driving time'}>{duration(team.drive_seconds)}{team.drive_seconds != null && team.drive_time_incomplete ? '+' : ''}</td>
            <td className="max-w-48 px-3 py-2.5 text-[11px] text-gray-500"><span className="line-clamp-2" title={team.areas.map(area => area.name).join(' · ')}>{team.areas.slice(0, 2).map(area => area.name).join(' · ') || (team.total_do ? 'Unavailable' : 'No deliveries')}{team.areas.length > 2 ? ` +${team.areas.length - 2}` : ''}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    {teams.length > 0 && !teamRows.length && <p className="p-3 text-sm text-gray-500">No teams match your search.</p>}
    <div className="grid gap-3 md:grid-cols-2 lg:hidden">{teamRows.map(team => <button type="button" key={team.id} disabled={routeBusy} onClick={() => selectTeam(team.id)} aria-pressed={selectedTeam === team.id} className={`rounded-xl border bg-white p-4 text-left ${selectedTeam === team.id ? 'border-blue-400 ring-1 ring-blue-100' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-gray-800">{team.name}</h2><span className="text-xs text-gray-500">{team.delivered}/{team.total_do} delivered</span></div>
      <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-gray-700"><Truck size={15} className="mt-0.5 shrink-0" />{team.truck_plates.join(' · ') || 'Truck unassigned'}</p>
      <p className="mt-1 flex items-start gap-2 text-xs text-gray-500"><Users size={14} className="shrink-0" />{team.pairs.join(' / ') || 'Pair unassigned'}</p>
      <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-gray-100 pt-3 text-xs">{[['DO', team.total_do], ['Items', team.total_items], ['Distance', `${distance(team.distance_m)}${team.distance_m != null && team.distance_incomplete ? '+' : ''}`], ['Drive time', `${duration(team.drive_seconds)}${team.drive_seconds != null && team.drive_time_incomplete ? '+' : ''}`]].map(([label, value]) => <div key={label}><dt className="text-[10px] text-gray-400">{label}</dt><dd className="mt-1 font-semibold tabular-nums text-gray-800">{value}</dd></div>)}</dl>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-500"><MapPin size={13} className="shrink-0" /><span>{team.areas.length ? `${team.areas.slice(0, 3).map(area => area.name).join(' · ')}${team.areas.length > 3 ? ` +${team.areas.length - 3}` : ''}` : team.total_do ? 'Area unavailable' : 'No deliveries'}</span></p>
      {team.metrics_incomplete && <p className="mt-2 text-[10px] text-amber-700">Some route estimates are not calculated yet.</p>}
    </button>)}</div>
    {!loading && !teams.length && !error && <p className="p-4 text-sm text-gray-500">No delivery teams found.</p>}
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,0.75fr)_minmax(0,2.55fr)]">
      <select disabled={routeBusy} aria-label="Delivery team" value={selectedTeam} onChange={event => selectTeam(event.target.value)} className="min-h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm lg:order-1"><option value="all">All teams</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
      <div className="relative min-w-0 lg:order-4">
        <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input disabled={routeBusy} aria-label="Search deliveries" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search DO, customer or area" className="min-h-10 w-full min-w-0 rounded-lg border border-gray-200 pl-9 pr-3 text-sm" />
      </div>
      <select disabled={routeBusy} aria-label="Time slot" value={slotFilter} onChange={event => setSlotFilter(event.target.value)} className="min-h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm lg:order-2">
        {slotOptions.map(option => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}
      </select>
      <select disabled={routeBusy} aria-label="Delivery status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm lg:order-3">
        {DRIVER_TABS.map(status => <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>)}
      </select>
    </div>
    <div className="flex gap-2" aria-busy={routeBusy}>
      {arranging ? <><button type="button" disabled={routeBusy} onClick={() => setArranging(false)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"><X size={14} />Cancel</button><button type="button" disabled={routeBusy} onClick={() => applyRoutes('save')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-40"><Check size={14} />{routeBusy ? 'Saving…' : 'Save'}</button></> : <><button type="button" disabled={routeBusy || !editableRuns.length} onClick={beginArrange} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 text-xs font-semibold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"><GripVertical size={14} />Arrange</button><button type="button" disabled={routeBusy || !editableRuns.length} onClick={() => applyRoutes('optimal')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-40"><RefreshCw size={14} className={routeBusy ? 'animate-spin' : ''} />Optimal</button></>}
      <button type="button" onClick={() => setShowMap(value => !value)} aria-pressed={showMap} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-4 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${showMap ? 'border-blue-300 bg-blue-100 text-blue-800' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700'}`}><MapIcon size={14} />{showMap ? 'Hide map' : 'Map'}</button>
    </div>
    {routeMessage && <p role="status" className="text-xs text-gray-600">{routeMessage}</p>}
    </div>
    <p className="text-[10px] text-gray-400">Latest saved estimates · driving time only · cancelled DOs excluded. Replanned routes may cover remaining stops only.</p>
    {showMap && <TeamMap teams={visible} filtered={Boolean(search.trim()) || statusFilter !== 'all'} />}
    {visible.map(team => <section key={team.id} aria-label={`${team.name} routes`} className="space-y-2">
      <h2 className="flex items-center gap-2 border-t border-slate-200 px-1 pb-1 pt-4 text-sm font-semibold text-slate-700"><span aria-hidden="true" className="h-4 w-1 rounded-full bg-blue-500" />{team.name}</h2>
      {team.runs.map(run => {
        const fullTeam = teams.find(item => item.id === team.id);
        const fullRun = fullTeam.runs.find(item => item.id === run.id);
        if (!routeRefs.current.has(run.id)) routeRefs.current.set(run.id, { current: null });
        return <AdminRun key={run.id} run={run} fullRun={fullRun} date={date} controls={{ arranging, showMap: false, busy: routeBusy }} controlsRef={routeRefs.current.get(run.id)} onRefresh={() => refresh(true)} highlightNext={fullTeam.runs.find(item => item.orders.some(order => active(order.status)))?.id === run.id} />;
      })}
    </section>)}
    {!loading && teams.length > 0 && !visible.length && <p className="p-4 text-sm text-gray-500">No matching deliveries.</p>}
  </div>;
}
