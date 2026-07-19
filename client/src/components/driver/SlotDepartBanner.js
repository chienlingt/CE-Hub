// client/src/components/driver/SlotDepartBanner.js
//
// Option A — Leave warehouse banner.
// Rendered once per time slot where every active order is fully loaded and the
// slot has not yet departed.  Calls POST /api/time-slots/:id/depart which runs
// the full A3 lifecycle: slot_status → out_for_delivery, lorry_trips, Odoo
// outbox, and customer on-the-way notifications.

import { useState } from 'react';
import { Truck, AlertTriangle, RefreshCw } from 'lucide-react';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';
import { slotDateKey } from '../../utils/driverOrderFilters';

function formatWindow(start, end) {
  if (start && end) return `${start} – ${end}`;
  if (start) return `from ${start}`;
  return null;
}

/**
 * @param {{
 *   slots:      Array<object>,  // from useDriverJobs
 *   employeeId: string|null,
 *   selectedDate: string,       // 'yyyy-mm-dd' — only show banners for today's slots
 *   windowFilter?: string,      // 'all' | appointment bucket — banner only when 'all'
 *   onDeparted: () => void,     // refresh callback
 * }}
 */
export default function SlotDepartBanner({ slots, employeeId, selectedDate, windowFilter = 'all', onDeparted }) {
  const [departing, setDeparting] = useState(null);
  const [errors, setErrors]       = useState({});

  // Leave warehouse is only available on "All runs" — real truck runs, not appointment buckets
  if (windowFilter !== 'all') return null;

  const readySlots = slots.filter(s => {
    if (!s.ready_to_depart) return false;
    if (selectedDate && slotDateKey(s.date) !== selectedDate) return false;
    return true;
  });


  if (readySlots.length === 0) return null;

  async function handleDepart(slot) {
    setDeparting(slot.id);
    setErrors(prev => ({ ...prev, [slot.id]: null }));

    try {
      const res = await fetch(
        `${API_BASE.replace(/\/$/, '')}/api/time-slots/${slot.id}/depart`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
          },
          body: JSON.stringify({ employee_id: employeeId }),
        }
      );
      const json = await res.json();

      if (!res.ok) {
        const msg = json.error || `HTTP ${res.status}`;
        setErrors(prev => ({ ...prev, [slot.id]: msg }));
        return;
      }

      onDeparted();
    } catch (err) {
      setErrors(prev => ({ ...prev, [slot.id]: err.message }));
    } finally {
      setDeparting(null);
    }
  }

  return (
    <div className="px-4 space-y-2 mb-3">
      {readySlots.map(slot => {
        const window = formatWindow(slot.time_window_start, slot.time_window_end);
        const isBusy = departing === slot.id;
        const err    = errors[slot.id];

        return (
          <div
            key={slot.id}
            className="rounded-2xl border border-green-200 bg-green-50 p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-green-800 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 shrink-0" />
                  All items loaded — ready to leave
                </p>
                {window && (
                  <p className="text-xs text-green-700 mt-0.5">
                    Slot window: {window}
                  </p>
                )}
                <p className="text-xs text-green-600 mt-0.5">
                  {slot.order_count} order{slot.order_count !== 1 ? 's' : ''} on this run
                </p>
              </div>

              <button
                onClick={() => handleDepart(slot)}
                disabled={isBusy}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBusy ? (
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

            {err && (
              <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {err}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
