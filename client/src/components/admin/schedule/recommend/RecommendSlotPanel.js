import React, { useEffect, useId, useState } from 'react';
import { Info, Plus, X } from 'lucide-react';
import SlideOver from '../../../common/SlideOver';
import Button from '../../../common/Button';
import RecommendationCard from './RecommendationCard';
import AddressCombobox, { EMPTY_ADDRESS } from './AddressCombobox';
import { FOCUS_RING } from '../../../common/tokens';

const BOX = `rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 ${FOCUS_RING}`;
const FIELD = `w-full ${BOX}`;
const MAX_LINES = 20;
const emptyLine = () => ({ name: '', quantity: 1, dismantle: false });

/**
 * Slide-over form for "Find a slot". Inputs: delivery address, the items
 * (product name + quantity, optional dismantle of an old unit) and an optional
 * not-before date. Nothing is saved.
 *
 * `onRecommend({ address, buildingId, location, items, notBefore })` resolves to
 * `{ options, reasons, notes, addressMatched, building, job, notCounted }`.
 * `loadItems()` resolves to the Information > Item list
 * (`[{ name, itemType, requiresInstaller }]`) for the product-name suggestions.
 * `searchAddresses(query)` and `checkAddress(text)` feed the address box
 * (CE Hub suggestions, then a Google check); see AddressCombobox.
 */
export default function RecommendSlotPanel({
  open, onClose, loadItems, searchAddresses, checkAddress, onRecommend, onShowOnBoard,
}) {
  const listId = useId();
  const [items, setItems] = useState(null); // null = not loaded yet
  const [itemsError, setItemsError] = useState(null);

  useEffect(() => {
    if (!open || items !== null || !loadItems) return undefined;
    let cancelled = false;
    loadItems()
      .then(list => { if (!cancelled) { setItems(list); setItemsError(null); } })
      .catch(err => { if (!cancelled) setItemsError(err?.message || 'Could not load the item list.'); });
    return () => { cancelled = true; };
  }, [open, items, loadItems]);

  const known = new Set((items ?? []).map(i => i.name.toLowerCase()));
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [lines, setLines] = useState([emptyLine()]);
  const [notBefore, setNotBefore] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);

  const filled = lines.filter(l => l.name.trim());
  const canSubmit = address.text.trim().length > 0 && filled.length > 0 && status !== 'loading';

  const reset = () => { setStatus('idle'); setResult(null); };
  const updateLine = (index, patch) => {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    reset();
  };
  const removeLine = index => {
    setLines(prev => (prev.length === 1 ? [emptyLine()] : prev.filter((_, i) => i !== index)));
    reset();
  };

  const submit = async event => {
    event.preventDefault();
    if (!canSubmit) return;
    if (!onRecommend) { setStatus('error'); setResult({ message: 'The recommendation engine is not connected yet.' }); return; }
    setStatus('loading');
    try {
      const res = await onRecommend({
        address: address.text.trim(),
        buildingId: address.buildingId,
        location: address.location,
        items: filled.map(l => ({ name: l.name.trim(), quantity: l.quantity, dismantle: l.dismantle })),
        notBefore: notBefore || null,
      });
      setResult(res);
      setStatus('done');
    } catch (err) {
      setResult({ message: err?.message || 'Could not get a recommendation.' });
      setStatus('error');
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Find a slot"
      subtitle="Advisory only — nothing is booked. Enter the date in Odoo."
      width="sm:w-[440px]"
      footer={(
        <div className="flex items-center justify-end gap-2">
          {status === 'done' && <Button variant="ghost" onClick={reset}>Edit details</Button>}
          <Button type="submit" form="recommend-slot-form" disabled={!canSubmit}>
            {status === 'loading' ? 'Finding…' : 'Recommend slots'}
          </Button>
        </div>
      )}
    >
      <form id="recommend-slot-form" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="rec-address" className="mb-1 block text-xs font-medium text-gray-700">Delivery address</label>
          <AddressCombobox
            id="rec-address"
            value={address}
            search={searchAddresses}
            check={checkAddress}
            onChange={next => { setAddress(next); reset(); }}
          />
        </div>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-gray-700">Items</legend>
          <datalist id={listId}>
            {(items ?? []).map(i => (
              <option key={i.name} value={i.name}>
                {[i.itemType ?? 'Unclassified', i.requiresInstaller ? 'installer' : null].filter(Boolean).join(' · ')}
              </option>
            ))}
          </datalist>
          <ul className="space-y-2">
            {lines.map((line, i) => (
              <li key={i} className="rounded-md border border-gray-200 p-2">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Item ${i + 1} product name`}
                    list={listId}
                    className={`${BOX} min-w-0 flex-1`}
                    placeholder="Product name"
                    value={line.name}
                    onChange={e => updateLine(i, { name: e.target.value })}
                  />
                  <input
                    aria-label={`Item ${i + 1} quantity`}
                    type="number" min={1} max={99}
                    className={`${BOX} w-16 shrink-0`}
                    value={line.quantity}
                    onChange={e => updateLine(i, { quantity: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    aria-label={`Remove item ${i + 1}`}
                    className={`rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 ${FOCUS_RING}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <label className="mt-1.5 flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={line.dismantle}
                    onChange={e => updateLine(i, { dismantle: e.target.checked })}
                    className={`h-3.5 w-3.5 rounded border-gray-300 ${FOCUS_RING}`}
                  />
                  Dismantle the old unit
                </label>
                {items && line.name.trim() && !known.has(line.name.trim().toLowerCase()) && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Not on Information &gt; Item, so the fallback install time is used.
                  </p>
                )}
              </li>
            ))}
          </ul>
          {lines.length < MAX_LINES && (
            <Button
              type="button" variant="ghost" size="sm" icon={Plus} className="mt-1"
              onClick={() => { setLines(prev => [...prev, emptyLine()]); reset(); }}
            >
              Add item
            </Button>
          )}
          <p className="mt-1 text-[11px] text-gray-500">
            Suggestions are the products on Information &gt; Item; their item types set install time and installer need.
          </p>
          {itemsError && <p className="mt-1 text-[11px] text-amber-700">{itemsError}</p>}
        </fieldset>

        <div>
          <label htmlFor="rec-not-before" className="mb-1 block text-xs font-medium text-gray-700">
            Not before <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input id="rec-not-before" type="date" className={FIELD} value={notBefore} onChange={e => { setNotBefore(e.target.value); reset(); }} />
        </div>
      </form>

      <div className="mt-5" aria-live="polite">
        {status === 'error' && (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            {result?.message}
          </p>
        )}
        {status === 'done' && result && (
          <>
            {result.job && (
              <p className="mb-2 text-xs text-gray-700">
                Estimated visit <strong className="font-semibold">{result.job.serviceMinutes} min</strong>
                {result.job.requiresInstaller ? ' · needs an installer team' : ''}
              </p>
            )}
            {result.options?.length ? (
              <ul className="space-y-2">
                {result.options.map((option, i) => (
                  <RecommendationCard key={option.key ?? i} option={option} rank={i + 1} onShowOnBoard={onShowOnBoard} />
                ))}
              </ul>
            ) : (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-medium text-gray-900">No slot found in the next 14 days</p>
                {result.reasons?.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-gray-600">
                    {result.reasons.map(r => <li key={r}>{r}</li>)}
                  </ul>
                )}
              </div>
            )}
            {result.locatedAs && (
              <p className="mt-2 text-[11px] text-gray-500">Located as: {result.locatedAs}</p>
            )}
            <p className="mt-1 text-[11px] text-gray-500">
              {result.addressMatched
                ? `Matched to ${result.building}; its access hours were checked.`
                : 'Address not matched to a known building — access hours not checked.'}
            </p>
            {result.notes?.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[11px] text-amber-700">
                {result.notes.map(n => <li key={n}>{n}</li>)}
              </ul>
            )}
            {result.notCounted > 0 && (
              <p className="mt-1 text-[11px] text-gray-500">{result.notCounted} unscheduled DOs not counted.</p>
            )}
          </>
        )}
      </div>
    </SlideOver>
  );
}
