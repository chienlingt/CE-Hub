import React, { useEffect, useId, useRef, useState } from 'react';
import { Building2, CheckCircle2, History, MapPin, Search } from 'lucide-react';
import Button from '../../../common/Button';
import { FOCUS_RING } from '../../../common/tokens';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

export const EMPTY_ADDRESS = { text: '', buildingId: null, location: null };

/**
 * Address box for Find a slot.
 *
 * 1. Type-ahead from CE Hub's own data: buildings, then past delivery addresses
 *    (`search(query)` -> `[{ key, kind, text, mainText, secondaryText, buildingId, location }]`).
 * 2. "Check address" asks Google for anything not in the list
 *    (`check(text)` -> `[{ formattedAddress, lat, lon, precise, confirmable }]`)
 *    and the user confirms one match ("Did you mean …").
 *
 * value = { text, buildingId, location: { lat, lon, label } | null }. Typing clears
 * buildingId and location.
 */
export default function AddressCombobox({ id, value, onChange, search, check }) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [checkState, setCheckState] = useState({ status: 'idle', candidates: [], message: null });
  const requestRef = useRef(0);
  const skipNextRef = useRef(false);

  const query = value.text;
  useEffect(() => {
    if (skipNextRef.current) { skipNextRef.current = false; return undefined; }
    if (!search || query.trim().length < MIN_CHARS) { setSuggestions([]); setOpen(false); return undefined; }
    const ticket = ++requestRef.current;
    const timer = setTimeout(() => {
      search(query.trim())
        .then(list => {
          if (ticket !== requestRef.current) return;
          setSuggestions(list);
          setActive(-1);
          setOpen(list.length > 0);
        })
        .catch(() => { if (ticket === requestRef.current) setSuggestions([]); });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, search]);

  const set = next => {
    setCheckState({ status: 'idle', candidates: [], message: null });
    onChange(next);
  };

  const pick = s => {
    skipNextRef.current = true;
    set({ text: s.text, buildingId: s.buildingId ?? null, location: s.location ?? null });
    setOpen(false);
    setSuggestions([]);
  };

  const runCheck = async () => {
    if (!check || value.text.trim().length < 3) return;
    setOpen(false);
    setCheckState({ status: 'loading', candidates: [], message: null });
    try {
      const candidates = await check(value.text.trim());
      setCheckState({
        status: 'done',
        candidates,
        message: candidates.length ? null : 'Google could not find this address. Check the spelling or add the postcode.',
      });
    } catch (err) {
      setCheckState({ status: 'done', candidates: [], message: err?.message || 'Address check failed.' });
    }
  };

  const confirm = c => {
    onChange({ text: value.text, buildingId: null, location: { lat: c.lat, lon: c.lon, label: c.formattedAddress } });
    setCheckState({ status: 'idle', candidates: [], message: null });
  };

  const onKeyDown = e => {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? suggestions.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  const located = Boolean(value.location || value.buildingId);
  const confirmable = checkState.candidates.filter(c => c.confirmable);
  const vague = checkState.candidates.filter(c => !c.confirmable);

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={`w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 ${FOCUS_RING}`}
        placeholder="Building name, street or postcode"
        value={value.text}
        onChange={e => set({ text: e.target.value, buildingId: null, location: null })}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(suggestions.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((s, i) => {
            const Icon = s.kind === 'building' ? Building2 : History;
            return (
              <li
                key={s.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={e => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${i === active ? 'bg-gray-100' : ''}`}
              >
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  <span className="font-medium text-gray-900">{s.mainText}</span>
                  {s.secondaryText && <span className="text-gray-500"> {s.secondaryText}</span>}
                  <span className="sr-only">{s.kind === 'building' ? ' (building)' : ' (past delivery)'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {located ? (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-green-700">
          <CheckCircle2 className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {value.location
            ? `Location confirmed: ${value.location.label ?? value.text}`
            : 'Building from CE Hub; its access hours will be checked.'}
        </p>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">Pick a suggestion, or check a new address with Google.</p>
          {check && (
            <Button
              type="button" variant="secondary" size="sm" icon={Search}
              disabled={value.text.trim().length < 3 || checkState.status === 'loading'}
              onClick={runCheck}
            >
              {checkState.status === 'loading' ? 'Checking…' : 'Check address'}
            </Button>
          )}
        </div>
      )}

      {checkState.status === 'done' && !located && (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2" aria-live="polite">
          {confirmable.length > 0 && (
            <>
              <p className="mb-1 text-xs font-medium text-gray-700">Did you mean</p>
              <ul className="space-y-1">
                {confirmable.map(c => (
                  <li key={`${c.lat},${c.lon}`}>
                    <button
                      type="button"
                      onClick={() => confirm(c)}
                      className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-900 hover:bg-white ${FOCUS_RING}`}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
                      <span>{c.formattedAddress}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {vague.length > 0 && (
            <p className="mt-1 text-[11px] text-amber-700">
              Too vague to use: {vague.map(c => c.formattedAddress).join('; ')}. Add the street, building or postcode.
            </p>
          )}
          {checkState.message && <p className="text-[11px] text-amber-700">{checkState.message}</p>}
        </div>
      )}
    </div>
  );
}
