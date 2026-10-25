import React from 'react';
import { X, CalendarArrowDown } from 'lucide-react';
import DoBlock from './DoBlock';
import { useBoard } from './BoardContext';
import { FOCUS_RING } from '../../../common/tokens';

const REASON_TONE = {
  rejected: 'font-medium text-red-700',
  ok: 'font-medium text-green-700',
  blocked: 'text-gray-600',
};

function Entry({ entry, canDrag, onSuggest }) {
  const { canEdit } = useBoard();
  const { block, reason, suggestions } = entry;
  return (
    <li className="min-w-0">
      <DoBlock block={block} canDrag={canDrag} width="w-full" />
      <p className={`mt-0.5 truncate text-[11px] ${REASON_TONE[reason.tone]}`} title={reason.text}>
        {reason.tone === 'rejected' ? '✕ ' : ''}{reason.text}
      </p>
      {/* Suggestions are actions, so view-only users do not get them. */}
      {canEdit && suggestions.length > 0 && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {suggestions.map(s => (
            <button
              key={s.slotId}
              type="button"
              onClick={() => onSuggest(block.orderId, s)}
              className={`truncate rounded border border-green-300 bg-green-50 px-1 py-px text-left text-[10px] font-medium text-green-800 hover:bg-green-100 ${FOCUS_RING}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function Groups({ panel, dateKey, canDrag, onJump, onSuggest }) {
  if (!panel.count) {
    return <p className="px-3 py-6 text-center text-xs text-gray-500">Every DO has a slot.</p>;
  }
  return panel.groups.map(group => {
    const current = group.dateKey ? group.dateKey === dateKey : false;
    return (
      <section key={group.key} aria-label={`${group.label}, ${group.entries.length} DOs`} className="border-b border-gray-100 px-3 py-2">
        <h3>
          <button
            type="button"
            disabled={!group.jumpDateKey}
            onClick={() => onJump(group.jumpDateKey)}
            aria-current={current ? 'date' : undefined}
            title={group.jumpDateKey ? (group.overdue ? 'Show today' : 'Show this day on the Board') : undefined}
            className={[
              'mb-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold', FOCUS_RING,
              group.overdue ? 'text-red-700' : 'text-gray-800',
              current ? 'bg-blue-100 text-blue-800' : (group.jumpDateKey ? 'hover:bg-gray-100' : ''),
            ].join(' ')}
          >
            {group.jumpDateKey && <CalendarArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
            {group.label}
            <span className="font-normal text-gray-500">· {group.entries.length} DO{group.entries.length === 1 ? '' : 's'}</span>
          </button>
        </h3>
        <ul className="grid grid-cols-2 gap-x-1.5 gap-y-2">
          {group.entries.map(entry => (
            <Entry key={entry.block.orderId} entry={entry} canDrag={canDrag} onSuggest={onSuggest} />
          ))}
        </ul>
      </section>
    );
  });
}

/**
 * Every DO still to place, grouped by Odoo's expected date (overdue first,
 * undated last), each with its reason and up to two suggested cells. Docked
 * beside the grid without a backdrop, so blocks drag straight onto cells and
 * the panel stays open for the next one. Full screen on a phone, no dragging.
 */
export default function UnscheduledPanel({ panel, dateKey, onClose, onJump, onSuggest }) {
  const { canEdit } = useBoard();

  const header = (
    <div className="flex items-start justify-between gap-2 border-b border-gray-200 px-3 py-2">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-gray-900">{panel.count} unscheduled</h2>
        <p className="text-[11px] text-gray-500">
          By expected date (Odoo){canEdit ? ' — drag onto the Board, or pick a suggestion' : ''}
        </p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close unscheduled panel" className={`-m-1 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 ${FOCUS_RING}`}>
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop: docked, non-modal — no backdrop, no focus trap. */}
      <aside
        aria-label="Unscheduled DOs"
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
        className="sticky top-2 hidden max-h-[calc(100vh-6rem)] w-[380px] flex-shrink-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white sm:flex"
      >
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Groups panel={panel} dateKey={dateKey} canDrag onJump={onJump} onSuggest={onSuggest} />
        </div>
      </aside>

      {/* Phone: full screen; tapping a block opens its drawer with "Move to…". */}
      <div role="dialog" aria-label="Unscheduled DOs" className="fixed inset-0 z-40 flex flex-col bg-white sm:hidden">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Groups panel={panel} dateKey={dateKey} canDrag={false} onJump={(d) => { onJump(d); onClose(); }} onSuggest={onSuggest} />
        </div>
      </div>
    </>
  );
}
