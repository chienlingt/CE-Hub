import { useState } from 'react';
import { CheckCircle2, MapPinCheck, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../../utils/apiBaseUrl';
import { canMarkArrived } from '../../utils/driverStatusMap';

const api = path => `${API_BASE_URL.replace(/\/$/, '')}/api/${path}`;

// One size for every action button on a delivery card (Mark arrived, Arrived, Navigate): a fixed,
// compact width and a border on all of them, so a tinted button is not bigger than a plain one.
export const actionSize = (compact = false) =>
  `inline-flex min-h-11 w-[7.5rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-xs font-semibold ${compact ? 'lg:min-h-9' : ''}`;
// Tinted: only for the next stop. Everything else stays plain.
export const ACTION_PLAIN = 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100';

export const arrivalTime = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false });
};

// Best-effort position for the arrival record. It must never delay the tap, so it
// gives up quickly and the arrival is saved without a position.
const currentPosition = () => new Promise(resolve => {
  if (!navigator.geolocation) { resolve(null); return; }
  navigator.geolocation.getCurrentPosition(
    position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    () => resolve(null),
    { timeout: 2500, maximumAge: 60000 },
  );
});

/**
 * "Mark arrived" for one order. While the order is out for delivery it is a button;
 * once pressed it becomes "Arrived 10:42", the time the server saved. Without `onArrived`
 * (admin view) it only shows the time, if there is one.
 *
 * `highlight`: tint it (green). Pass it only for the next stop; other orders stay plain.
 * `compact`: the shorter desktop height, matching the Navigate button beside it.
 */
export default function ArriveControl({ job, employeeId, onArrived, highlight = false, compact = false, className = '' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const arrivedAt = job.arrived_at || savedAt;

  async function mark() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const position = await currentPosition();
      const response = await fetch(api(`orders/${job.id}/arrive`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ employee_id: employeeId, ...(position || {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not mark as arrived.');
      setSavedAt(data.arrived_at);
      onArrived?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (arrivedAt) {
    return (
      <span className={`${actionSize(compact)} ${highlight ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-500'} ${className}`}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Arrived {arrivalTime(arrivedAt)}
      </span>
    );
  }
  if (!onArrived || !canMarkArrived(job)) return null;
  return (
    <span className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <button type="button" onClick={mark} disabled={busy}
        className={`${actionSize(compact)} disabled:opacity-60 ${highlight ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700' : ACTION_PLAIN}`}>
        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <MapPinCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        {busy ? 'Saving…' : 'Mark arrived'}
      </button>
      {error && <span role="alert" className="max-w-[16rem] text-right text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
