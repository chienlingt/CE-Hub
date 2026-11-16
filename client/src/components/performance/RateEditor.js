import React, { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { saveIncentiveRule } from '../../services/performanceApi';

/**
 * "RM 1.00 per point" with a small pencil to change it (FR-10-001). Points per
 * item are set per item in Information > Item; this is the only rate here.
 */
export default function RateEditor({ rate, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const start = () => { setValue(String(rate)); setError(null); setEditing(true); };

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveIncentiveRule({ rm_per_point: value });
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        RM {Number(rate).toFixed(2)} per point
        <button type="button" onClick={start} aria-label="Edit RM per point" title="Edit"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }
  return (
    <form onSubmit={save} className="inline-flex flex-wrap items-center gap-1 text-xs text-gray-500">
      RM
      <input type="number" min="0" step="0.01" required autoFocus value={value} onChange={e => setValue(e.target.value)}
        aria-label="RM per point"
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
        className="w-16 rounded-md border border-gray-300 px-2 py-0.5 text-right text-xs text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
      per point
      <button type="submit" disabled={busy} aria-label="Save" title="Save" className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" title="Cancel" className="rounded p-1 text-gray-400 hover:bg-gray-100">
        <X className="h-3.5 w-3.5" />
      </button>
      {error && <span role="alert" className="w-full text-red-600">{error}</span>}
    </form>
  );
}
