import React from 'react';
import { FOCUS_RING } from '../../../common/tokens';

/**
 * A numeric minutes input. Separate component because there are eight of them
 * and because 0 must be a valid, savable value — the server's
 * PUT /api/settings/:key currently rejects "0" via `if (!value)`, which is one
 * of the reasons this config goes to scheduler_config instead.
 */
export default function BufferField({
  label, hint, value, onChange, min = 0, max = 240, step = 5, unit = 'min', disabled,
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
          className={`w-20 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums ${FOCUS_RING} disabled:bg-gray-100`}
        />
        <span className="text-xs text-gray-500">{unit}</span>
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
    </label>
  );
}
