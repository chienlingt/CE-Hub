import React from 'react';
import { meterClass, pctTone } from './tokens';

/**
 * Labelled utilisation bar. Over-capacity is signalled by a glyph as well as
 * colour, so the state survives greyscale printing (Mr Lee prints the week) and
 * colour-blind viewers.
 *
 * @param {object} props
 * @param {number|null} props.pct   0..1+, or null for "unknown"
 * @param {string} [props.label]    left-hand caption
 * @param {string} [props.value]    right-hand readout
 * @param {'sm'|'md'} [props.size]
 */
export default function Meter({
  pct, label, value, size = 'md', className = '', showGlyph = true,
}) {
  const known = pct !== null && pct !== undefined && !Number.isNaN(pct);
  const clamped = known ? Math.min(1, Math.max(0, pct)) : 0;
  const over = known && pct > 1;
  const height = size === 'sm' ? 'h-1' : 'h-1.5';

  return (
    <div className={className}>
      {(label || value) && (
        <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[11px] leading-none">
          {label && <span className="text-gray-500">{label}</span>}
          {value && (
            <span className={`tabular-nums font-medium ${over ? 'text-red-700' : 'text-gray-700'}`}>
              {over && showGlyph ? '▲ ' : ''}{value}
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-gray-200 ${height}`}
        role="img"
        aria-label={`${label ?? 'Utilisation'}: ${known ? `${Math.round(pct * 100)}%` : 'unknown'}`}
      >
        <div
          className={`${height} rounded-full transition-[width] ${meterClass(pct)}`}
          style={{ width: known ? `${clamped * 100}%` : '0%' }}
        />
      </div>
    </div>
  );
}

export { pctTone };
