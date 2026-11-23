import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings2 } from 'lucide-react';
import Button from '../../common/Button';
import { badgeClass, FOCUS_RING } from '../../common/tokens';
import ItemTypesDialog from './ItemTypesDialog';
import {
  getItemRates, updateItem, acceptItemSuggestions, getServiceTimeSettings, saveServiceTimeSettings,
} from '../../../services/performanceApi';
import { adminSessionHeaders } from '../../../utils/adminSessionHeaders';
import { ITEM_REVIEW_CHANGED } from '../../../hooks/usePendingItemReviews';

// Information > Item. One row per product name found on Odoo order lines,
// assigned to an item type. The type supplies the install time, dismantle time
// and installer flag the scheduler uses; a product can have its own install or
// dismantle time (null = follow the type). Each order's service time is base
// delivery + install + dismantle (server/services/serviceTime.js).
//
// A new product starts unclassified ("Needs review"): the scheduler uses the
// fallback install time and it earns 0 points. Keyword matches are suggested
// but nothing is assigned until an admin accepts. Points are edited per
// product once it has a type; giving it a type fills in the type's default
// points if it has none yet. Points changes apply to orders completed from now
// on; points already earned never change.

const control = `rounded-md border border-gray-300 bg-white px-2 py-1 text-sm ${FOCUS_RING} disabled:bg-gray-100`;
const Blank = () => <span className="text-gray-400">—</span>;
const notifyChanged = () => window.dispatchEvent(new Event(ITEM_REVIEW_CHANGED));

function ServiceTimeStrip({ canEdit }) {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState({});
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    getServiceTimeSettings()
      .then(settings => { if (live) setSaved(settings); })
      .catch(err => { if (live) setNotice({ tone: 'red', text: `Could not load service time settings: ${err.message}` }); });
    return () => { live = false; };
  }, []);

  if (!saved) return notice ? <p className={`border-b border-gray-200 px-4 py-3 text-sm ${badgeClass(notice.tone)}`}>{notice.text}</p> : null;

  const value = key => draft[key] ?? saved[key];
  const range = (key, fallback) => saved.ranges?.[key] ?? fallback;
  const dirty = Object.keys(draft).some(key => draft[key] !== saved[key]);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const body = Object.fromEntries(Object.entries(draft).map(([key, v]) => [key, v === '' ? v : Number(v)]));
      const { config } = await saveServiceTimeSettings(body);
      setSaved(prev => ({ ...prev, base_delivery_minutes: config.base_delivery_minutes, fallback_install_minutes: config.fallback_install_minutes }));
      setDraft({});
      setNotice({ tone: 'green', text: 'Saved. Applies to the next scheduling run.' });
    } catch (err) {
      setNotice({ tone: 'red', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, hint, fallbackRange) => {
    const r = range(key, fallbackRange);
    return (
      <label className="block">
        <span className="block text-sm font-medium text-gray-700">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
        <span className="mt-1 flex items-center gap-2">
          <input id={`service-${key}`} type="number" min={r.min} max={r.max} step="1" className={`${control} w-20 tabular-nums`}
            value={value(key) ?? ''} disabled={!canEdit || saving}
            onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value === '' ? '' : Number(e.target.value) }))} />
          <span className="text-xs text-gray-500">min · {r.min}–{r.max}</span>
        </span>
      </label>
    );
  };

  return (
    <div className="border-b border-gray-200 px-4 py-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {field('base_delivery_minutes', 'Base delivery time', 'Added once per order.', { min: 1, max: 120 })}
        {field('fallback_install_minutes', 'Fallback install time', 'Unclassified products, and types with no install time.', { min: 0, max: 480 })}
        {canEdit && (
          <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        )}
        <p className="min-w-[200px] flex-1 text-xs text-gray-500">Service time per order = base delivery + install + dismantle.</p>
      </div>
      {notice && <p role="status" className={`mt-2 rounded px-3 py-1.5 text-xs ${badgeClass(notice.tone)}`}>{notice.text}</p>}
    </div>
  );
}

function PointsInput({ item, onSave, disabled }) {
  const [value, setValue] = useState(String(item.points_per_item));
  useEffect(() => { setValue(String(item.points_per_item)); }, [item.points_per_item]);
  const commit = () => {
    if (value.trim() === '' || Number(value) === item.points_per_item) { setValue(String(item.points_per_item)); return; }
    onSave(item, value);
  };
  return (
    <input type="number" min="0" step="0.01" className={`${control} w-20 tabular-nums`} aria-label={`Points per item for ${item.item_name}`}
      id={`points-${item.id}`} value={value} disabled={disabled}
      onChange={e => setValue(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setValue(String(item.points_per_item)); }} />
  );
}

// A product's own install or dismantle time. Shows the item type's value until
// the admin types a different one; that row then keeps its own ("custom"), and
// the reset button (or clearing the box) goes back to following the type.
function MinutesInput({ item, field, typeValue, onSave, disabled }) {
  const own = item[field] ?? null;
  const shown = own ?? typeValue;
  const [value, setValue] = useState(shown ?? '');
  useEffect(() => { setValue(shown ?? ''); }, [shown]);
  const label = field === 'install_minutes' ? 'Install' : 'Dismantle';

  const commit = () => {
    const text = String(value).trim();
    if (text === '') {
      if (own !== null) onSave(item, field, null);
      else setValue(shown ?? '');
      return;
    }
    const n = Number(text);
    if (n === shown) return;
    onSave(item, field, n === typeValue ? null : n);
  };

  return (
    <span className="flex items-center gap-1.5">
      <input type="number" min="0" max="480" step="1" placeholder="—" id={`${field}-${item.id}`}
        aria-label={`${label} minutes for ${item.item_name}`} className={`${control} w-16 tabular-nums`}
        value={value} disabled={disabled}
        onChange={e => setValue(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setValue(shown ?? ''); }} />
      {own !== null && (
        <span className="flex items-center gap-0.5 text-xs text-blue-700">
          custom
          <button type="button" disabled={disabled} onClick={() => onSave(item, field, null)}
            aria-label={`Use the item type's ${label.toLowerCase()} time for ${item.item_name}`}
            title={`Use the item type's time (${typeValue ?? 'fallback'}${typeValue != null ? ' min' : ''})`}
            className={`rounded px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 ${FOCUS_RING}`}>↺</button>
        </span>
      )}
    </span>
  );
}

function TypePicker({ item, activeTypes, onChange, disabled }) {
  const current = item.item_type;
  const options = current && !current.active ? [current, ...activeTypes] : activeTypes;
  return (
    <select className={`${control} max-w-[220px]`} aria-label={`Item type for ${item.item_name}`} id={`type-${item.id}`}
      value={current?.id ?? ''} disabled={disabled} onChange={e => e.target.value && onChange(item, e.target.value)}>
      {!current && <option value="">{item.suggested_item_type ? 'Choose another…' : '— Choose type —'}</option>}
      {options.map(type => <option key={type.id} value={type.id}>{type.name}{type.active ? '' : ' (inactive)'}</option>)}
    </select>
  );
}

export default function ItemPoints() {
  const [items, setItems] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [typesOpen, setTypesOpen] = useState(false);
  const canEdit = Boolean(adminSessionHeaders().Authorization);

  const load = useCallback(async () => {
    try {
      const data = await getItemRates();
      setItems(data.items || []);
      setItemTypes(data.item_types || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (action, success) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      await load();
      notifyChanged();
      if (success) setNotice({ tone: 'green', text: typeof success === 'function' ? success(result) : success });
    } catch (err) {
      setNotice({ tone: 'red', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const activeTypes = useMemo(() => itemTypes.filter(t => t.active), [itemTypes]);
  const pending = items.filter(i => i.needs_review).length;
  const suggested = items.filter(i => i.needs_review && i.suggested_item_type).length;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(i => !q || i.item_name.toLowerCase().includes(q) || i.item_type?.name.toLowerCase().includes(q))
      .sort((a, b) => (b.needs_review - a.needs_review) || a.item_name.localeCompare(b.item_name));
  }, [items, search]);

  const assign = (item, typeId) => run(() => updateItem(item.id, { item_type_id: typeId }), `"${item.item_name}" classified.`);
  const savePoints = (item, value) => run(() => updateItem(item.id, { points_per_item: Number(value) }), `Points saved for "${item.item_name}".`);
  const saveMinutes = (item, field, value) => run(
    () => updateItem(item.id, { [field]: value }),
    `${field === 'install_minutes' ? 'Install' : 'Dismantle'} time ${value === null ? 'now follows the item type' : 'saved'} for "${item.item_name}".`,
  );
  const accept = item => run(() => acceptItemSuggestions([item.id]), `"${item.item_name}" classified as ${item.suggested_item_type.name}.`);
  const acceptAll = () => run(() => acceptItemSuggestions(), r => `${r.accepted} product${r.accepted === 1 ? '' : 's'} classified.`);
  const disabled = busy || !canEdit;

  return (
    <div className="rounded-lg bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-4 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-800">
            Item Management
            {pending > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass('amber')}`}>{pending} need review</span>}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" id="item-search" aria-label="Search products" placeholder="Search products"
            className={`${control} w-56`} value={search} onChange={e => setSearch(e.target.value)} />
          <Button variant="secondary" size="sm" icon={Settings2} onClick={() => setTypesOpen(true)} disabled={!canEdit}>Manage item types</Button>
          <Button size="sm" onClick={acceptAll} disabled={disabled || suggested === 0}>Accept all suggestions ({suggested})</Button>
        </div>
      </div>

      <ServiceTimeStrip canEdit={canEdit} />

      {!canEdit && (
        <p className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-600">
          View only. Changing items needs an Admin login; sign in again as an Admin if your session expired.
        </p>
      )}
      {notice && <p role="status" className={`mx-4 mt-3 rounded px-3 py-2 text-sm ${badgeClass(notice.tone)}`}>{notice.text}</p>}
      {error && <p role="alert" className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Could not load items: {error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-600">
            <tr>
              <th scope="col" className="px-4 py-2">Product name</th>
              <th scope="col" className="px-4 py-2">Item type</th>
              <th scope="col" className="border-l border-gray-200 px-4 py-2">Install</th>
              <th scope="col" className="px-4 py-2">Dismantle</th>
              <th scope="col" className="px-4 py-2">Installer</th>
              <th scope="col" className="border-l border-gray-200 px-4 py-2">Points / item</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Loading items…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                {search ? 'No products match your search.' : 'No products yet. They appear here once they are on an order.'}
              </td></tr>
            )}
            {rows.map(item => {
              const type = item.item_type;
              return (
                <tr key={item.id} className={item.needs_review ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-2">
                    <span className="text-gray-900">{item.item_name}</span>
                    {item.needs_review && <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass('amber')}`}>Needs review</span>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.needs_review && item.suggested_item_type && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-blue-400 bg-blue-50 py-0.5 pl-2.5 pr-1 text-xs text-blue-700">
                          Suggested: <b className="font-semibold">{item.suggested_item_type.name}</b>
                          <button type="button" onClick={() => accept(item)} disabled={disabled}
                            className={`rounded-full bg-blue-600 px-2 py-0.5 font-medium text-white hover:bg-blue-700 disabled:bg-blue-300 ${FOCUS_RING}`}>
                            Accept
                          </button>
                        </span>
                      )}
                      <TypePicker item={item} activeTypes={activeTypes} onChange={assign} disabled={disabled} />
                      {item.needs_review && !item.suggested_item_type && <span className="text-xs text-gray-500">no match</span>}
                    </div>
                  </td>
                  <td className="border-l border-gray-100 px-4 py-2 tabular-nums">
                    {type
                      ? <MinutesInput item={item} field="install_minutes" typeValue={type.install_minutes} onSave={saveMinutes} disabled={disabled} />
                      : <Blank />}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {type
                      ? <MinutesInput item={item} field="dismantle_minutes" typeValue={type.dismantle_minutes} onSave={saveMinutes} disabled={disabled} />
                      : <Blank />}
                  </td>
                  <td className="px-4 py-2">{type ? (type.requires_installer ? 'Required' : 'No') : <Blank />}</td>
                  <td className="border-l border-gray-100 px-4 py-2 tabular-nums">
                    {type
                      ? <PointsInput item={item} onSave={savePoints} disabled={disabled} />
                      : <span title="Choose an item type before setting points">{item.points_per_item}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* <p className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
        Install and Dismantle follow the item type until you change them on a product (marked custom; ↺ goes back to the type).
        Installer comes from the item type. A blank install time means the scheduler uses the fallback install time. Dismantle
        counts only when the order asks for it. Giving a product a type fills in the type's default points if it has none yet.
        Points changes apply to orders completed from now on.
      </p> */}

      <ItemTypesDialog show={typesOpen} onClose={() => setTypesOpen(false)} itemTypes={itemTypes} onChanged={load} />
    </div>
  );
}
