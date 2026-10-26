import React, { useState } from 'react';
import { Info } from 'lucide-react';
import SlideOver from '../../../common/SlideOver';
import Button from '../../../common/Button';
import RecommendationCard from './RecommendationCard';
import { FOCUS_RING } from '../../../common/tokens';

const FIELD = `w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 ${FOCUS_RING}`;

/**
 * Slide-over form for "Find a slot". Inputs: delivery address, installation,
 * optional not-before date (CE Hub has no item master data). Nothing is saved.
 *
 * `onRecommend(input)` should resolve to `{ options, notCounted }` or
 * `{ options: [], reasons }`. Until the gateway method exists it is omitted and
 * the panel says so.
 */
export default function RecommendSlotPanel({ open, onClose, bands, onRecommend, onShowOnBoard }) {
  const [address, setAddress] = useState('');
  const [sizeKey, setSizeKey] = useState('');
  const [installation, setInstallation] = useState(false);
  const [notBefore, setNotBefore] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);

  const canSubmit = address.trim().length > 0 && Boolean(sizeKey) && status !== 'loading';

  const submit = async event => {
    event.preventDefault();
    if (!canSubmit) return;
    if (!onRecommend) { setStatus('error'); setResult({ message: 'The recommendation engine is not connected yet.' }); return; }
    setStatus('loading');
    try {
      const res = await onRecommend({
        address: address.trim(),
        sizeBand: sizeKey,
        installation,
        notBefore: notBefore || null,
      });
      setResult(res);
      setStatus('done');
    } catch (err) {
      setResult({ message: err?.message || 'Could not get a recommendation.' });
      setStatus('error');
    }
  };

  const reset = () => { setStatus('idle'); setResult(null); };

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
          <textarea
            id="rec-address" rows={3} className={FIELD}
            placeholder="e.g. 12 Jln Kiara 1, Bukit Jalil, Kuala Lumpur"
            value={address}
            onChange={e => { setAddress(e.target.value); reset(); }}
          />
        </div>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-gray-700">Order size</legend>
          <div className="grid grid-cols-3 gap-2">
            {bands.map(b => (
              <label
                key={b.key}
                className={[
                  'flex cursor-pointer flex-col rounded-md border p-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500',
                  sizeKey === b.key ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
                ].join(' ')}
              >
                <input
                  type="radio" name="rec-size" value={b.key} className="sr-only"
                  checked={sizeKey === b.key}
                  onChange={() => { setSizeKey(b.key); reset(); }}
                />
                <span className="font-medium">{b.label}</span>
                <span className="mt-0.5 text-[11px] leading-tight text-gray-500">{b.hint}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">Approximate — there is no item master data to measure from.</p>
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={installation}
            onChange={e => { setInstallation(e.target.checked); reset(); }}
            className={`h-4 w-4 rounded border-gray-300 ${FOCUS_RING}`}
          />
          Installation needed
        </label>

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
        {status === 'done' && result && (result.options?.length ? (
          <>
            <ul className="space-y-2">
              {result.options.map((option, i) => (
                <RecommendationCard key={option.key ?? i} option={option} rank={i + 1} onShowOnBoard={onShowOnBoard} />
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-amber-700">
              Size is approximate — confirm with the warehouse before promising a date.
            </p>
            <p className="mt-1 text-[11px] text-gray-500">
              {result.addressMatched
                ? `Matched to ${result.building}; its access window was checked.`
                : 'Address not matched to a known building — access window not checked.'}
            </p>
            {result.notCounted > 0 && (
              <p className="mt-2 text-[11px] text-gray-500">{result.notCounted} unscheduled DOs not counted.</p>
            )}
          </>
        ) : (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-900">No slot found in the next 14 days</p>
            {result.reasons?.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs text-gray-600">
                {result.reasons.map(r => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </SlideOver>
  );
}
