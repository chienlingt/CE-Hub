import { Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { ORDER_FILTER_DEFAULTS } from '../../utils/adminOrderFilters';

export default function OrderFilters({ filters, onChange, teams, areas, statuses, counts, total, syncAvailable }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const update = (key, value) => onChange(previous => ({ ...previous, [key]: value }));
  const activeCount = ['status', 'team', 'readiness', 'area', 'sync'].filter(key => filters[key] !== 'all').length;
  const selectClass = 'w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm';
  const active = Object.entries(filters).some(([key, value]) => value !== (key === 'date' ? 'all' : ORDER_FILTER_DEFAULTS[key]));
  return <div className="mb-4 space-y-3">
    <div className="flex flex-wrap gap-2" aria-label="Order views">
      {[['all', 'All orders', counts.all], ['scheduling', 'Needs scheduling', counts.scheduling], ['attention', 'Needs attention', counts.attention]].map(([key, label, count]) => <button key={key} aria-pressed={filters.view === key} onClick={() => update('view', key)} className={`rounded-lg px-3 py-2 text-sm ${filters.view === key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{label} <span className="ml-1 opacity-75">{count}</span></button>)}
    </div>
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative w-full lg:w-auto lg:flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input aria-label="Search orders" placeholder="Search DO, customer, phone, address or serial…" value={filters.search} onChange={event => update('search', event.target.value)} className={`${selectClass} pl-9`} />
        </div>
        <select aria-label="Delivery date" value={filters.date} onChange={event => update('date', event.target.value)} className={`${selectClass} !w-auto flex-1 lg:flex-none`}>
          <option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="custom">Date range</option><option value="all">All dates</option>
        </select>
        <button aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm lg:hidden"><SlidersHorizontal size={16} />Filters{activeCount > 0 && ` (${activeCount})`}</button>
        <div className={`${open ? 'flex' : 'hidden'} w-full flex-wrap gap-2 lg:flex lg:w-auto`}>
          <select aria-label="Order status" value={filters.status} onChange={event => update('status', event.target.value)} className={`${selectClass} !w-auto flex-1`}><option value="all">All statuses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select>
          <select aria-label="Delivery team" value={filters.team} onChange={event => update('team', event.target.value)} className={`${selectClass} !w-auto flex-1 lg:max-w-48`}><option value="all">All teams</option><option value="unassigned">Unassigned</option>{teams.map(team => <option key={team.id} value={team.id}>{team.label}</option>)}</select>
          <button aria-expanded={more} onClick={() => setMore(value => !value)} className="rounded-lg border px-3 py-2 text-sm">More{filters.area !== 'all' || filters.readiness !== 'all' || filters.sync !== 'all' ? ' •' : ''}</button>
        </div>
      </div>
      {filters.date === 'custom' && <div className="grid grid-cols-2 gap-2 max-w-lg"><label className="text-xs text-gray-500">From<input aria-label="Delivery date from" type="date" value={filters.start} max={filters.end || undefined} onChange={event => update('start', event.target.value)} className={selectClass} /></label><label className="text-xs text-gray-500">To<input aria-label="Delivery date to" type="date" value={filters.end} min={filters.start || undefined} onChange={event => update('end', event.target.value)} className={selectClass} /></label>{filters.start && filters.end && filters.start > filters.end && <p role="alert" className="col-span-2 text-xs text-red-600">End date must not be before start date.</p>}</div>}
      {more && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 border-t pt-3">
        <select aria-label="Preparation readiness" value={filters.readiness} onChange={event => update('readiness', event.target.value)} className={selectClass}><option value="all">Any preparation</option><option value="ready">Ready to load</option><option value="not_ready">Not ready</option></select>
        <select aria-label="Delivery area" value={filters.area} onChange={event => update('area', event.target.value)} className={selectClass}><option value="all">All areas</option>{areas.map(area => <option key={area}>{area}</option>)}</select>
        {syncAvailable && <select aria-label="Outgoing Odoo jobs" value={filters.sync} onChange={event => update('sync', event.target.value)} className={selectClass}><option value="all">Any outgoing sync</option><option value="pending">Queued</option><option value="dead">Failed</option><option value="processed">Processed</option><option value="none">No outgoing jobs</option></select>}
        <select aria-label="Sort orders" value={filters.sort} onChange={event => update('sort', event.target.value)} className={selectClass}><option value="created_desc">Latest first</option><option value="created_asc">Oldest first</option><option value="scheduled_asc">Delivery: earliest</option><option value="scheduled_desc">Delivery: latest</option><option value="customer">Customer name</option></select>
      </div>}
    </div>
    <div className="flex justify-between items-center text-sm text-gray-500"><span aria-live="polite">{total} {total === 1 ? 'order' : 'orders'} · Delivery date (MYT)</span>{active && <button onClick={() => onChange({ ...ORDER_FILTER_DEFAULTS, date: 'all' })} className="text-blue-600">Clear filters</button>}</div>
  </div>;
}
