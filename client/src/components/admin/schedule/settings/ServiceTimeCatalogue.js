import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FOCUS_RING } from '../../../common/tokens';

const input = `rounded border border-gray-300 px-1.5 py-0.5 text-xs ${FOCUS_RING} disabled:bg-gray-100`;

const parseMinutes = (raw) => {
  const s = String(raw).trim();
  if (s === '') return null;          // blank = not confirmed yet
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
};

const parseCategories = (raw) => String(raw)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/**
 * Editable item-type service times. Keyed by Odoo product category, which Odoo
 * sends per line (FRD v1.2 §12 #15), because Cycle 2 has no product master.
 * Matching a line to a type is the new engine's job; this only stores the table.
 */
export default function ServiceTimeCatalogue({ rows = [], onChange, disabled, error, range = { min: 0, max: 480 } }) {
  const update = (index, patch) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, {
    id: '', label: '', odooCategories: [], installMinutes: null, dismantleMinutes: null, requiresInstaller: false,
  }]);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Item type</th>
              <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Odoo categories</th>
              <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Install (min)</th>
              <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Dismantle (min)</th>
              <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Installer</th>
              <th scope="col" className="px-2 py-1"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-2 text-gray-500">No item types yet.</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id || `new-${i}`} className="border-t border-gray-100">
                <td className="px-2 py-1">
                  <input
                    aria-label="Item type"
                    className={`${input} w-36`}
                    value={row.label ?? ''}
                    disabled={disabled}
                    onChange={e => update(i, { label: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    // Remount when the saved value changes (e.g. Discard), since
                    // the field is uncontrolled while typing commas.
                    key={(row.odooCategories ?? []).join('|')}
                    aria-label={`Odoo categories for ${row.label || 'item type'}`}
                    placeholder="e.g. Washing Machine"
                    className={`${input} w-40`}
                    defaultValue={(row.odooCategories ?? []).join(', ')}
                    disabled={disabled}
                    onBlur={e => update(i, { odooCategories: parseCategories(e.target.value) })}
                  />
                </td>
                {['installMinutes', 'dismantleMinutes'].map(key => (
                  <td key={key} className="px-2 py-1">
                    <input
                      type="number"
                      aria-label={`${key === 'installMinutes' ? 'Install' : 'Dismantle'} minutes for ${row.label || 'item type'}`}
                      placeholder="—"
                      min={range.min}
                      max={range.max}
                      className={`${input} w-16 tabular-nums`}
                      value={row[key] ?? ''}
                      disabled={disabled}
                      onChange={e => update(i, { [key]: parseMinutes(e.target.value) })}
                    />
                  </td>
                ))}
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    aria-label={`${row.label || 'Item type'} needs an installer`}
                    checked={Boolean(row.requiresInstaller)}
                    disabled={disabled}
                    onChange={e => update(i, { requiresInstaller: e.target.checked })}
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className={`rounded p-0.5 text-gray-400 hover:text-red-600 ${FOCUS_RING}`}
                      aria-label={`Remove ${row.label || 'item type'}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="text-[11px] text-red-600">{error}</p>}
      {!disabled && (
        <button type="button" onClick={add} className={`inline-flex items-center gap-1 rounded text-xs font-medium text-blue-700 hover:underline ${FOCUS_RING}`}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add item type
        </button>
      )}
      <p className="text-[11px] text-gray-500">
        Blank minutes mean not confirmed yet; the fallback install time is used. Separate several Odoo categories with commas.
      </p>
    </div>
  );
}
