import React from 'react';
import BlockGlyph from './BlockGlyph';
import { BLOCK_STATES } from './boardStates';

const BLOCK_KEYS = ['pending', 'confirmed', 'locked', 'done', 'rejected'];

/**
 * The DO colour key. Cell states (lorry full, slot full, off, no team, past)
 * are written in the cells themselves, so they need no key.
 */
export default function BoardLegend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
      {BLOCK_KEYS.map(key => (
        <li key={key} className="flex items-center gap-1">
          <span className={`inline-flex h-3.5 w-5 items-center justify-center rounded border text-[9px] ${BLOCK_STATES[key].className}`} aria-hidden="true">
            <BlockGlyph state={key} glyph={BLOCK_STATES[key].glyph} />
          </span>
          {BLOCK_STATES[key].label}
        </li>
      ))}
    </ul>
  );
}
