// client/src/components/driver/DriverDashboard.js
// A.4.1 / FR-04-001: Mobile-first driver task dashboard.
// Mirrors TBMDelivery stafflanding.tsx layout and UX.
import { useState, useMemo } from 'react';
import { Search, RefreshCw, CalendarDays, Truck, CheckCircle2, LayoutList, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDriverJobs } from '../../hooks/useDriverJobs';
import { applyDriverFilters, computeStats } from '../../utils/driverOrderFilters';
import { DRIVER_TABS } from '../../utils/driverStatusMap';
import OrderTaskCard from './OrderTaskCard';
import UpdateOrderModal from './UpdateOrderModal';
import DeliveryEvidenceModal from './DeliveryEvidenceModal';
import ContactReportModal from './ContactReportModal';
import DateCalendarModal from './DateCalendarModal';

/** Build a 7-day strip centred around today (or selectedDate if given). */
function buildDateStrip(selectedDate) {
  const base = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
  const strip = [];
  for (let i = -1; i <= 5; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    strip.push({
      key:   d.toISOString().split('T')[0],
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
  Completed:  'Completed',
  Issue:      'Issue',
};

export default function DriverDashboard() {
  const { currentUser } = useAuth();
  const employeeId = currentUser?.employeeId || '';

  const today       = new Date().toISOString().split('T')[0];
  const [date, setDate]         = useState(today);
  const [tab, setTab]           = useState('all');
  const [search, setSearch]     = useState('');
  const [updateTarget, setUpdateTarget] = useState(null);
  const [evidenceTarget, setEvidenceTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { jobs, loading, error, refresh } = useDriverJobs(employeeId);

  // Jobs for the selected date
  const dateJobs = useMemo(() => jobs.filter(j => j.assigned_date === date), [jobs, date]);
  const stats    = useMemo(() => computeStats(dateJobs), [dateJobs]);
  const strip    = useMemo(() => buildDateStrip(date), [date]);

  // Filtered list
  const displayed = useMemo(
    () => applyDriverFilters(dateJobs, { date, tab, search }),
    [dateJobs, date, tab, search]
  );

  function handleJobUpdated() {
    setUpdateTarget(null);
    refresh();
  }

  function handleEvidenceUpdated() {
    refresh();
  }

  function handleJobReported() {
    setReportTarget(null);
    refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-safe">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-blue-800 to-blue-700 pt-4 pb-6 px-4 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-blue-200">Driver Dashboard</p>
            <p className="text-lg font-bold">{currentUser?.name || 'Driver'}</p>
          </div>
          <button
            onClick={refresh}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<LayoutList className="w-4 h-4" />} label="Total"     value={stats.total}     />
          <StatCard icon={<Truck className="w-4 h-4" />}      label="Scheduled" value={stats.scheduled}  />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Completed" value={stats.completed} />
          <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Issue"   value={stats.issue}     />
        </div>
      </div>

      {/* ── Date Strip ─────────────────────────────────────────────── */}
      <div className="bg-white border-b px-2 py-2 flex gap-1 overflow-x-auto scrollbar-hide">
        {strip.map(({ key, day, date: d }) => (
          <button
            key={key}
            onClick={() => setDate(key)}
            className={`flex flex-col items-center min-w-[44px] py-1.5 rounded-xl transition-colors
              ${key === date
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <span className="text-xs">{day}</span>
            <span className={`text-base font-semibold ${key === today && key !== date ? 'text-blue-600' : ''}`}>{d}</span>
          </button>
        ))}
        {/* Full calendar button */}
        <button
          onClick={() => setCalendarOpen(true)}
          className="flex flex-col items-center min-w-[44px] py-1.5 text-gray-400 hover:text-gray-600"
          title="Pick date"
        >
          <CalendarDays className="w-5 h-5 mx-auto" />
          <span className="text-xs mt-0.5">More</span>
        </button>
      </div>

      {/* ── Search ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search order, product, customer, address…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <div className="px-4 mb-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto scrollbar-hide">
          {DRIVER_TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 min-w-max px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors
                ${tab === t
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'}`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Job List ───────────────────────────────────────────────── */}
      <div className="px-4 space-y-3">
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

        {!loading && !error && displayed.length === 0 && (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <LayoutList className="w-10 h-10 mb-3" />
            <p className="font-medium">No orders found</p>
            <p className="text-sm mt-1">for {date} in {TAB_LABELS[tab]} tab</p>
          </div>
        )}

        {displayed.map(job => (
          <OrderTaskCard
            key={job.id}
            job={job}
            onUpdate={j => setUpdateTarget(j)}
            onViewEvidence={j => setEvidenceTarget(j)}
            onReport={j => setReportTarget(j)}
          />
        ))}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {updateTarget && (
        <UpdateOrderModal
          order={updateTarget}
          employeeId={employeeId}
          onClose={() => setUpdateTarget(null)}
          onSuccess={handleJobUpdated}
        />
      )}

      {evidenceTarget && (
        <DeliveryEvidenceModal
          order={evidenceTarget}
          onClose={() => setEvidenceTarget(null)}
          onSuccess={handleEvidenceUpdated}
        />
      )}

      {reportTarget && (
        <ContactReportModal
          job={reportTarget}
          employeeId={employeeId}
          onClose={() => setReportTarget(null)}
          onSuccess={handleJobReported}
        />
      )}

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

function StatCard({ icon, label, value }) {
  return (
    <div className="bg-white/15 rounded-xl px-3 py-2 flex items-center gap-2">
      <div className="text-blue-200">{icon}</div>
      <div>
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-xs text-blue-200">{label}</p>
      </div>
    </div>
  );
}
