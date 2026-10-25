import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import DoBlock from './DoBlock';
import { FOCUS_RING } from '../../../common/tokens';

/**
 * Every DO without a slot — unscheduled by the engine or rejected by the
 * warehouse admin — oldest first. Drag one onto an open cell to place it.
 */
export default function UnscheduledTray({ blocks, canDrag = true, collapsed, onToggle }) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <section aria-label="Unscheduled DOs" className="rounded-md border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left ${FOCUS_RING}`}
      >
        <Chevron className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
          Unscheduled <span className="tabular-nums">({blocks.length})</span>
        </span>
        <span className="text-[11px] text-gray-500">
          {blocks.length
            ? (canDrag ? 'oldest first — drag a block onto an open cell' : 'oldest first — tap one to move it')
            : 'every DO has a slot'}
        </span>
      </button>
      {!collapsed && blocks.length > 0 && (
        <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto border-t border-gray-100 p-2">
          {blocks.map(block => (
            <li key={block.orderId}>
              <DoBlock block={block} canDrag={canDrag} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
