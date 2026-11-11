import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Button from '../../../common/Button';
import { FOCUS_RING } from '../../../common/tokens';
import { todayLocalDateKey } from '../../../../utils/dateKey';

const REASON_LABELS = { leave: 'Leave', mc: 'MC', event: 'Event', maintenance: 'Maintenance', other: 'Other' };
const field = `rounded border border-gray-300 px-1.5 py-1 text-xs ${FOCUS_RING}`;

/**
 * Dated truck/team unavailability (resource_blockoffs). Saved immediately, not
 * with the settings form, because each row is its own record.
 */
export default function BlockoffEditor({
  blockoffs = [], trucks = [], teams = [], reasons = Object.keys(REASON_LABELS), onAdd, onRemove, disabled,
}) {
  const today = todayLocalDateKey();
  const empty = { resourceType: 'truck', resourceId: '', startDate: today, endDate: today, reason: 'leave', note: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const nameOf = (b) => (b.resourceType === 'truck'
    ? trucks.find(t => t.id === b.resourceId)?.plate
    : teams.find(t => t.id === b.resourceId)?.name) ?? 'Unknown';
  const options = form.resourceType === 'truck'
    ? trucks.map(t => ({ id: t.id, label: `${t.plate}${t.tone ? ` (${t.tone}t)` : ''}` }))
    : teams.map(t => ({ id: t.id, label: t.name }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await onAdd({ ...form, note: form.note.trim() || null });
      setForm(f => ({ ...empty, resourceType: f.resourceType }));
    } catch (err) {
      setErrors(err?.fieldErrors ?? { form: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setErrors({});
    try { await onRemove(id); } catch (err) { setErrors({ form: err?.message ?? String(err) }); }
  };

  const sorted = [...blockoffs].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="space-y-2">
      {sorted.length === 0 ? (
        <p className="text-xs text-gray-500">No upcoming block-offs.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded border border-gray-200">
          {sorted.map(b => (
            <li key={b.id} className="flex items-center gap-2 px-2 py-1 text-xs">
              <span className="w-10 text-gray-500">{b.resourceType === 'truck' ? 'Lorry' : 'Team'}</span>
              <span className="flex-1 font-medium text-gray-800">{nameOf(b)}</span>
              <span className="tabular-nums text-gray-700">
                {b.startDate}{b.endDate !== b.startDate ? ` → ${b.endDate}` : ''}
              </span>
              <span className="w-28 truncate text-gray-600" title={b.note ?? ''}>
                {REASON_LABELS[b.reason] ?? b.reason}{b.note ? `: ${b.note}` : ''}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(b.id)}
                  className={`rounded p-0.5 text-gray-400 hover:text-red-600 ${FOCUS_RING}`}
                  aria-label={`Remove block-off for ${nameOf(b)} from ${b.startDate}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded bg-gray-50 p-2">
          <label className="text-[11px] text-gray-600">Type
            <select className={`${field} mt-0.5 block`} value={form.resourceType}
              onChange={e => setForm(f => ({ ...f, resourceType: e.target.value, resourceId: '' }))}>
              <option value="truck">Lorry</option>
              <option value="team">Team</option>
            </select>
          </label>
          <label className="text-[11px] text-gray-600">{form.resourceType === 'truck' ? 'Lorry' : 'Team'}
            <select required className={`${field} mt-0.5 block w-36`} value={form.resourceId}
              onChange={e => setForm(f => ({ ...f, resourceId: e.target.value }))}>
              <option value="">Choose…</option>
              {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-gray-600">From
            <input type="date" required className={`${field} mt-0.5 block`} value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))} />
          </label>
          <label className="text-[11px] text-gray-600">To
            <input type="date" required min={form.startDate} className={`${field} mt-0.5 block`} value={form.endDate}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
          </label>
          <label className="text-[11px] text-gray-600">Reason
            <select className={`${field} mt-0.5 block`} value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
              {reasons.map(r => <option key={r} value={r}>{REASON_LABELS[r] ?? r}</option>)}
            </select>
          </label>
          <label className="min-w-[8rem] flex-1 text-[11px] text-gray-600">Note
            <input maxLength={300} className={`${field} mt-0.5 block w-full`} value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </label>
          <Button type="submit" size="sm" icon={Plus} disabled={busy || !form.resourceId}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </form>
      )}
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="text-[11px] text-red-600">
          {Object.entries(errors).map(([k, v]) => (k === 'form' ? v : `${k}: ${v}`)).join(' · ')}
        </p>
      )}
    </div>
  );
}
