import React, { useEffect, useState } from 'react';
import { getIncentiveRules, saveIncentiveRule } from '../../services/performanceApi';

const FIELDS = [
  { key: 'bonus_points_per_order', label: 'Bonus points per order', hint: 'Added once per completed order' },
  { key: 'rm_per_point', label: 'RM per point', hint: 'Converts points to the incentive amount' },
];

/** FR-10-001: admins configure the incentive rules. Saving adds a new version. */
export default function RulesPanel({ onSaved }) {
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState({ bonus_points_per_order: '', rm_per_point: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => getIncentiveRules()
    .then(({ current: rule }) => {
      setCurrent(rule);
      if (rule) setForm({ bonus_points_per_order: String(rule.bonus_points_per_order), rm_per_point: String(rule.rm_per_point) });
    })
    .catch(error => setMessage({ type: 'error', text: error.message }));
  useEffect(() => { load(); }, []);

  const dirty = !current || FIELDS.some(({ key }) => Number(form[key]) !== current[key]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await saveIncentiveRule(form);
      await load();
      setMessage({ type: 'ok', text: 'Saved. The new rule applies to orders completed from now on; earlier orders keep their points. RM figures use the new rate.' });
      onSaved?.();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-gray-900">Incentive rules</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label, hint }) => (
          <label key={key} className="block text-sm">
            <span className="font-medium text-gray-700">{label}</span>
            <input type="number" min="0" step="0.01" required value={form[key]}
              onChange={event => setForm(state => ({ ...state, [key]: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200" />
            <span className="mt-1 block text-xs text-gray-500">{hint}</span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">Points per item are set for each item in Information, then Item.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || !dirty}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? 'Saving...' : 'Save rules'}
        </button>
        {current && <span className="text-xs text-gray-500">Current rule since {new Date(current.effective_from).toLocaleDateString('en-MY')}</span>}
        {message && <span role="status" className={`text-sm ${message.type === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>{message.text}</span>}
      </div>
    </form>
  );
}
