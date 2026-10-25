import React from 'react';
import { BLOCK_STATES, FULL_WINDOW_STYLE } from './boardStates';

const BLOCK_KEYS = ['pending', 'confirmed', 'locked', 'done', 'rejected'];

/** The old sheet's colour key, split into the two things colour now means. */
export default function BoardLegend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
      {BLOCK_KEYS.map(key => (
        <li key={key} className="flex items-center gap-1">
          <span className={`inline-flex h-3.5 w-5 items-center justify-center rounded border text-[9px] ${BLOCK_STATES[key].className}`} aria-hidden="true">
            {BLOCK_STATES[key].glyph}
          </span>
          {BLOCK_STATES[key].label}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <span className="h-3.5 w-5 rounded border border-gray-200 bg-red-50" aria-hidden="true" /> Lorry full
      </li>
      <li className="flex items-center gap-1">
        <span className="h-3.5 w-5 rounded border border-gray-200" style={FULL_WINDOW_STYLE} aria-hidden="true" /> Slot at cap
      </li>
      <li className="flex items-center gap-1">
        <span className="h-3.5 w-5 rounded border border-gray-200 bg-gray-100" aria-hidden="true" /> Off / no team / past
      </li>
    </ul>
  );
}
