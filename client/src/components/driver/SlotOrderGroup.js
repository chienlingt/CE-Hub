// client/src/components/driver/SlotOrderGroup.js
// Groups all orders belonging to one time_slot_id into a collapsible box.
// Absorbs the "Leave warehouse" departure action from SlotDepartBanner.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Truck, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';
import OrderTaskCard from './OrderTaskCard';

/** Slot status → human label + colour classes. */
const SLOT_STATUS_STYLE = {
  scheduled:        { label: 'Scheduled',       cls: 'bg-blue-100 text-blue-700' },
  out_for_delivery: { label: 'Out for delivery', cls: 'bg-green-100 text-green-700' },
  completed:        { label: 'Completed',        cls: 'bg-gray-100 text-gray-600' },
};

function slotStatusBadge(status) {
  return SLOT_STATUS_STYLE[status] || { label: status || 'Unknown', cls: 'bg-gray-100 text-gray-500' };
}

function formatWindow(start, end) {
  if (start && end) return `${start} – ${end}`;
  if (start) return `from ${start}`;
  return null;
}

/**
 * @param {{
 *   slot:           object | null,   // slot summary from useDriverJobs, or null for unassigned
 *   jobs:           Array<object>,   // enriched job objects for this slot
 *   employeeId:     string | null,
 *   onUpdate:       (job: object) => void,
 *   onViewEvidence: (job: object) => void,
 *   onReport:       (job: object) => void,
 *   onFail:         (job: object) => void,
 *   onDeparted:     () => void,
 * }}
 */
export default function SlotOrderGroup({
  slot,
  jobs,
  employeeId,
  onUpdate,
  onViewEvidence,
  onReport,
  onFail,
  onDeparted,
}) {
  const [expanded, setExpanded]     = useState(true);
  const [departing, setDeparting]   = useState(false);
  const [departError, setDepartError] = useState(null);

  // Location — captured best-effort; refreshed each render attempt
  const locationRef = useRef(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { locationRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }; },
      () => { /* silently ignore */ },
      { timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  const windowLabel = slot ? (formatWindow(slot.time_window_start, slot.time_window_end) || 'Slot') : 'Unassigned';
  const { label: statusLabel, cls: statusCls } = slotStatusBadge(slot?.slot_status);
  const orderCount = jobs.length;
  const canDepart  = Boolean(slot?.ready_to_depart);

  async function handleDepart() {
    if (!slot?.id) return;
    setDeparting(true);
    setDepartError(null);

    const loc = locationRef.current;
    const body = {
      employee_id: employeeId,
      ...(loc && { latitude: loc.latitude, longitude: loc.longitude }),
    };

    try {
      const res = await fetch(
        `${API_BASE.replace(/\/$/, '')}/api/time-slots/${slot.id}/depart`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
          },
          body: JSON.stringify(body),
        }
      );
      const json = await res.json();

      if (!res.ok) {
        setDepartError(json.error || `HTTP ${res.status}`);
        return;
      }

      onDeparted();
    } catch (err) {
      setDepartError(err.message);
    } finally {
      setDeparting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 cursor-pointer select-none"
        onClick={() => setExpanded(prev => !prev)}
        role="button"
        aria-expanded={expanded}
      >
        {/* Time window / label */}
        <Clock className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="font-semibold text-sm text-gray-800 flex-1 min-w-0 truncate">
          {windowLabel}
        </span>

        {/* Slot status badge */}
        {slot && (
          <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>
            {statusLabel}
          </span>
        )}

        {/* Order count */}
        <span className="shrink-0 text-xs text-gray-500 font-medium">
          {orderCount} order{orderCount !== 1 ? 's' : ''}
        </span>

        {/* Chevron */}
        <span className="shrink-0 text-gray-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </div>

      {/* ── Leave Warehouse (only when ready_to_depart) ──────────────── */}
      {canDepart && (
        <div className="px-4 py-3 border-b border-green-100 bg-green-50 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-green-800 flex items-center gap-1.5">
              <Truck className="w-4 h-4 shrink-0" />
              All items loaded — ready to leave
            </p>
            <button
              onClick={handleDepart}
              disabled={departing}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {departing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Leaving…
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" />
                  Leave warehouse
                </>
              )}
            </button>
          </div>

          {departError && (
            <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {departError}
            </div>
          )}
        </div>
      )}

      {/* ── Order list ──────────────────────────────────────────────────── */}
      {expanded && (
        <div className="divide-y divide-gray-100">
          {jobs.map(job => (
            <div key={job.id} className="p-4">
              <OrderTaskCard
                job={job}
                onUpdate={onUpdate}
                onViewEvidence={onViewEvidence}
                onReport={onReport}
                onFail={onFail}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
