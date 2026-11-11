import React from 'react';
import { FOCUS_RING } from '../../../common/tokens';

/**
 * A numeric minutes input. 0 must be a valid, savable value (grace can be 0).
 * `min`/`max` come from the server's settings spec; `error` is the server's
 * message for this field after a rejected save.
 */
export default function BufferField({
  label, hint, value, onChange, min = 0, max = 240, step = 1, unit = 'min', disabled, error,
}) {
  const handle = (next) => {
    const n = Number(next);
    if (!Number.isFinite(n)) return;
    onChange(Math.max(min, Math.min(max, n)));
  };

  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-700">{label}</span>
      {hint && <span className="mt-0.5 block text-[11px] text-gray-500">{hint}</span>}
      <span className="mt-1 flex items-center gap-2">
        <input
          type="number"
          value={value ?? 0}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={e => handle(e.target.value)}
          className={`w-20 rounded border ${error ? 'border-red-400' : 'border-gray-300'} px-2 py-1 text-sm tabular-nums ${FOCUS_RING} disabled:bg-gray-100`}
        />
        <span className="text-xs text-gray-500">{unit}</span>
        <span className="text-[10px] tabular-nums text-gray-400">{min}–{max}</span>
        <input
          type="range"
          value={value ?? 0}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={e => handle(e.target.value)}
          aria-label={`${label} slider`}
          className="h-1 flex-1 accent-blue-600"
        />
      </span>
      {error && <span role="alert" className="mt-0.5 block text-[11px] text-red-600">{label} {error}</span>}
    </label>
  );
}
