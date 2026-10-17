// client/src/components/driver/DriverDashboard.js
// A.4.1 / FR-04-001: Mobile-first driver task dashboard.
// Mirrors TBMDelivery stafflanding.tsx layout and UX.
import { useState, useMemo, useEffect } from 'react';
import { Search, RefreshCw, CalendarDays, LayoutList } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDriverJobs } from '../../hooks/useDriverJobs';
import {
  computeStats,
  enrichJobsWithAppointmentWindow,
  groupJobsBySlot,
  nextDeliverySlotId,
  filterGroupsByWindow,
  filterGroupsByTab,
  filterGroupsBySearch,
  buildWindowOptionsFromGroups,
} from '../../utils/driverOrderFilters';
import { slotDateKey } from '../../utils/driverOrderFilters';
import { toLocalDateKey, todayLocalDateKey } from '../../utils/dateKey';
import { DRIVER_TABS } from '../../utils/driverStatusMap';
import DateCalendarModal from './DateCalendarModal';
import SlotOrderGroup from './SlotOrderGroup';

/** Build a 7-day strip centred around today (or selectedDate if given). */
function buildDateStrip(selectedDate) {
  const base = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
  const strip = [];
  for (let i = -1; i <= 5; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    strip.push({
      key:   toLocalDateKey(d),
      day:   d.toLocaleDateString('en-MY', { weekday: 'short' }),
      date:  d.getDate(),
    });
  }
  return strip;
}

const TAB_LABELS = {
  all:        'All',
  Scheduled:  'Scheduled',
  Delivering: 'Delivering',
  Delivered:  'Delivered',
  Issue:      'Issue',
};

export default function DriverDashboard() {
  const { currentUser } = useAuth();
  const employeeId = currentUser?.employeeId || '';

  const today       = todayLocalDateKey();
  const [searchParams, setSearchParams] = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('date') || '') ? searchParams.get('date') : today;
  const setDate = value => setSearchParams({ date: value });
  const [tab, setTab]           = useState('all');
  const [windowFilter, setWindowFilter] = useState('all');
  const [search, setSearch]     = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { jobs, slots, loading, error, refresh } = useDriverJobs(employeeId);

  useEffect(() => {
    setWindowFilter('all');
  }, [date]);

  const dateJobsRaw = useMemo(
    () => {
      const filtered = jobs.filter(j => j.assigned_date === date);
      return filtered;
    },
    [jobs, date]
  );

  const dateJobs = useMemo(
    () => enrichJobsWithAppointmentWindow(dateJobsRaw),
    [dateJobsRaw]
  );

  const slotGroups = useMemo(
    () => groupJobsBySlot(dateJobs, slots.filter(s => slotDateKey(s.date) === date)),
    [dateJobs, slots, date]
  );

  const filteredGroups = useMemo(() => {
    const q = search.trim();
    if (q) {
      // Search across all tabs/windows for the selected date.
      return filterGroupsBySearch(slotGroups, q);
    }
    let g = filterGroupsByWindow(slotGroups, windowFilter);
    g = filterGroupsByTab(g, tab);
    return g;
  }, [slotGroups, windowFilter, tab, search]);

  // Choose from all runs, not filtered results: only one run owns "Next stop".
  const nextSlotId = nextDeliverySlotId(slotGroups);

  const windowOptions = useMemo(
    () => buildWindowOptionsFromGroups(slotGroups),
    [slotGroups]
  );

  const stats = useMemo(() => computeStats(dateJobs), [dateJobs]);
  const strip = useMemo(() => buildDateStrip(date), [date]);

  return (
    <div className="min-h-screen bg-gray-50 pb-safe">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="bg-blue-700 px-3 py-3 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold">Hello {currentUser?.name || 'Driver'}</p>
            <p className="mt-0.5 text-xs text-blue-100">{stats.completed}/{stats.total} completed · {dateJobs.filter(job => job.status === 'Failed').length} failed</p>
          </div>
          <button
            onClick={refresh}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* ── Date Strip ─────────────────────────────────────────────── */}
      <div className="bg-white border-b px-2 py-1 sm:px-4">
        <div className="grid w-full max-w-lg grid-cols-8 gap-0.5 sm:gap-1" role="group" aria-label="Delivery date">
        {strip.map(({ key, day, date: d }) => (
          <button
            key={key}
            type="button"
            onClick={() => setDate(key)}
            aria-label={`${day}, ${key}`}
            aria-pressed={key === date}
            className={`flex min-h-11 min-w-0 flex-col items-center justify-center py-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2
              ${key === date
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <span className="text-[10px]">{day}</span>
            <span className={`text-sm font-semibold ${key === today && key !== date ? 'text-blue-600' : ''}`}>{d}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          className="flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          title="Pick date"
          aria-label="Choose another delivery date"
        >
          <CalendarDays className="w-4 h-4 mx-auto" />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────── */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search deliveries"
            aria-label="Search order, product, customer or address"
            className="min-h-10 w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 px-3">
        <label className="min-w-0 text-xs text-gray-500">
          <span className="sr-only">Time slot</span>
          <select value={windowFilter} onChange={event => setWindowFilter(event.target.value)} className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800">
            {windowOptions.map(option => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs text-gray-500">
          <span className="sr-only">Status</span>
          <select value={tab} onChange={event => setTab(event.target.value)} className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800">
            {DRIVER_TABS.map(value => <option key={value} value={value}>{value === 'all' ? 'All statuses' : TAB_LABELS[value]}</option>)}
          </select>
        </label>
      </div>

      {/* ── Slot Groups ────────────────────────────────────────────── */}
      <div className="px-3 space-y-3">
        {loading && (
          <div className="flex justify-center py-12">
            <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            Failed to load jobs: {error}
          </div>
        )}

        {!loading && !error && filteredGroups.length === 0 && (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <LayoutList className="w-10 h-10 mb-3" />
            <p className="font-medium">No orders found</p>
            <p className="text-sm mt-1">
              {search.trim()
                ? `matching "${search.trim()}" on ${date}`
                : (
                  <>
                    for {date}
                    {windowFilter !== 'all' && windowOptions.find(o => o.value === windowFilter)
                      ? ` · ${windowOptions.find(o => o.value === windowFilter).label}`
                      : ''}
                    {' '}in {TAB_LABELS[tab]} tab
                  </>
                )}
            </p>
          </div>
        )}

        {filteredGroups.map((group, idx) => (
          <SlotOrderGroup
            key={group.slot?.id ?? `unassigned-${idx}`}
            slot={group.slot}
            jobs={group.jobs}
            allJobs={slotGroups.find(full => full.slot?.id === group.slot?.id)?.jobs || group.jobs}
            employeeId={employeeId}
            highlightNext={group.slot?.id === nextSlotId}
            onDeparted={refresh}
          />
        ))}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {calendarOpen && (
        <DateCalendarModal
          value={date}
          onChange={setDate}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </div>
  );
}
