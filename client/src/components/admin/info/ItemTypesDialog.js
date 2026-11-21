import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import { badgeClass, FOCUS_RING } from '../../common/tokens';
import { createItemType, updateItemType } from '../../../services/performanceApi';

// Manage item types, opened from Information > Item. A type's install time,
// dismantle time and installer flag apply to every product assigned to it;
// its default points fill in a product's points when it is given the type.
// Types are deactivated, never deleted: an inactive type disappears from the
// picker and from suggestions, and products already assigned keep it.

const input = `rounded-md border border-gray-300 px-2 py-1 text-sm ${FOCUS_RING}`;
const EMPTY_FORM = { name: '', install_minutes: '', dismantle_minutes: '', default_points: '0', keywords: '', requires_installer: false };

const minutes = value => (value === null || value === undefined ? '—' : `${value} min`);
const toForm = type => ({
  name: type.name,
  install_minutes: type.install_minutes ?? '',
  dismantle_minutes: type.dismantle_minutes ?? '',
  default_points: String(type.default_points ?? 0),
  keywords: (type.keywords || []).join(', '),
  requires_installer: !!type.requires_installer,
});
const toApi = form => ({
  name: form.name,
  install_minutes: form.install_minutes === '' ? null : Number(form.install_minutes),
  dismantle_minutes: form.dismantle_minutes === '' ? null : Number(form.dismantle_minutes),
  default_points: form.default_points === '' ? 0 : Number(form.default_points),
  keywords: form.keywords,
  requires_installer: form.requires_installer,
});

function TypeForm({ editing, onDone, onCancel }) {
  const [form, setForm] = useState(editing ? toForm(editing) : EMPTY_FORM);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) await updateItemType(editing.id, toApi(form));
      else await createItemType(toApi(form));
      onDone(editing ? `Saved "${form.name.trim()}".` : `Added "${form.name.trim()}".`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
      <h3 className="text-sm font-semibold text-gray-800">{editing ? `Edit ${editing.name}` : 'Add item type'}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs font-medium text-gray-700">
          Name
          <input id="item-type-name" className={`${input} mt-1 w-full`} value={form.name} maxLength={80} required
            onChange={e => set('name', e.target.value)} placeholder="e.g. Washing machine (10 kg+)" />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Install time (min)
          <input id="item-type-install" type="number" min="0" max="480" step="1" className={`${input} mt-1 w-full`}
            value={form.install_minutes} onChange={e => set('install_minutes', e.target.value)} placeholder="Blank = use fallback" />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Dismantle time (min)
          <input id="item-type-dismantle" type="number" min="0" max="480" step="1" className={`${input} mt-1 w-full`}
            value={form.dismantle_minutes} onChange={e => set('dismantle_minutes', e.target.value)} placeholder="—" />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Default points per item
          <input id="item-type-points" type="number" min="0" step="0.01" className={`${input} mt-1 w-full`}
            value={form.default_points} onChange={e => set('default_points', e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-gray-700 sm:col-span-2">
          Keywords (comma separated)
          <input id="item-type-keywords" className={`${input} mt-1 w-full`} value={form.keywords}
            onChange={e => set('keywords', e.target.value)} placeholder="e.g. washer 10kg, washer 12kg" />
          <span className="mt-1 block font-normal text-gray-500">
            A keyword matches when all its words appear in the product name. The most specific match wins.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input id="item-type-installer" type="checkbox" checked={form.requires_installer}
            onChange={e => set('requires_installer', e.target.checked)} className={FOCUS_RING} />
          Installer required
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save item type'}</Button>
      </div>
    </form>
  );
}

export default function ItemTypesDialog({ show, onClose, itemTypes = [], onChanged }) {
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(null); // null | { editing: type|null }
  const [confirming, setConfirming] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const close = () => { setForm(null); setConfirming(null); setNotice(null); onClose(); };
  const done = message => { setForm(null); setConfirming(null); setNotice({ tone: 'green', text: message }); onChanged?.(); };

  const setActive = async (type, active) => {
    setBusy(true);
    try {
      await updateItemType(type.id, { active });
      done(active ? `Reactivated "${type.name}".` : `Deactivated "${type.name}".`);
    } catch (err) {
      setNotice({ tone: 'red', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const inactiveCount = itemTypes.filter(t => !t.active).length;
  const rows = itemTypes.filter(t => showInactive || t.active);

  return (
    <Modal show={show} onClose={close} maxWidth="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Manage item types</h2>
          <p className="text-xs text-gray-500">
            Times apply to every product assigned to the type. Default points fill in a product's points when it is given this type.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" id="show-inactive-types" checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)} className={FOCUS_RING} />
            Show inactive ({inactiveCount})
          </label>
          <Button size="sm" icon={Plus} onClick={() => { setForm({ editing: null }); setNotice(null); }}>Add item type</Button>
        </div>
      </div>

      {notice && <p role="status" className={`mt-3 rounded px-3 py-2 text-sm ${badgeClass(notice.tone)}`}>{notice.text}</p>}

      {confirming && (
        <div className="mt-3 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Deactivate "{confirming.name}"?</p>
          <p className="text-sm text-amber-900">
            It will no longer appear in the type picker or as a suggestion.
            {confirming.product_count > 0 && ` The ${confirming.product_count} product${confirming.product_count === 1 ? '' : 's'} already assigned to it keep its times and points.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirming(null)} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={() => setActive(confirming, false)} disabled={busy}>Deactivate</Button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-600">
            <tr>
              <th scope="col" className="px-3 py-2">Item type</th>
              <th scope="col" className="px-3 py-2">Install</th>
              <th scope="col" className="px-3 py-2">Dismantle</th>
              <th scope="col" className="px-3 py-2">Installer</th>
              <th scope="col" className="px-3 py-2">Default points</th>
              <th scope="col" className="px-3 py-2">Keywords</th>
              <th scope="col" className="px-3 py-2">Products</th>
              <th scope="col" className="px-3 py-2">Status</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-500">No item types yet. Add one to start classifying products.</td></tr>
            )}
            {rows.map(type => (
              <tr key={type.id} className={type.active ? '' : 'text-gray-500'}>
                <td className="px-3 py-2 font-medium">{type.name}</td>
                <td className="px-3 py-2 tabular-nums">{minutes(type.install_minutes)}</td>
                <td className="px-3 py-2 tabular-nums">{minutes(type.dismantle_minutes)}</td>
                <td className="px-3 py-2">{type.requires_installer ? 'Required' : 'No'}</td>
                <td className="px-3 py-2 tabular-nums">{type.default_points}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(type.keywords || []).map(k => <span key={k} className="rounded bg-gray-100 px-1.5 text-xs text-gray-700">{k}</span>)}
                    {!type.keywords?.length && <span className="text-xs text-gray-400">none</span>}
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums">{type.product_count}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(type.active ? 'green' : 'gray')}`}>
                    {type.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => { setForm({ editing: type }); setNotice(null); }} disabled={busy}>Edit</Button>
                    {type.active
                      ? <Button variant="secondary" size="sm" onClick={() => setConfirming(type)} disabled={busy}>Deactivate</Button>
                      : <Button variant="secondary" size="sm" onClick={() => setActive(type, true)} disabled={busy}>Reactivate</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && <TypeForm key={form.editing?.id ?? 'new'} editing={form.editing} onDone={done} onCancel={() => setForm(null)} />}

      <p className="mt-3 text-xs text-gray-500">
        A blank install time means not confirmed yet: the scheduler uses the fallback install time. Dismantle time counts only when the order asks for dismantling.
      </p>
    </Modal>
  );
}
