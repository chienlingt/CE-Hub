import React, { useMemo } from 'react';
import { useBoard } from './BoardContext';
import useHoverCard from './useHoverCard';
import HoverCard from './HoverCard';
import LorryCard from './LorryCard';
import { FOCUS_RING } from '../../../common/tokens';

/**
 * Exactly three things: lorry number, size, team. Everything else — crew
 * phones, cargo space, the day's load — is in the hover card, and pinned in a
 * drawer on click, tap or Enter.
 */
export default function LorryHeader({ row, dateKey }) {
  const { openLorry, getLorryDetail, dragActive } = useBoard();
  const hover = useHoverCard({ disabled: dragActive });
  const detail = useMemo(
    () => (hover.open ? getLorryDetail(row.truck.id, dateKey) : null),
    [hover.open, getLorryDetail, row.truck.id, dateKey],
  );

  let teamText = row.team?.name ?? '';
  let teamTone = 'text-gray-600';
  if (row.teamState === 'none') { teamText = '⚠ No team'; teamTone = 'font-medium text-amber-700'; }
  if (row.teamState === 'unavailable') { teamText = '⚠ Team unavailable'; teamTone = 'font-medium text-amber-700'; }

  return (
    <>
      <button
        type="button"
        onClick={() => openLorry(row.truck.id)}
        {...hover.triggerProps}
        aria-label={`${row.truck.plate}, ${row.truck.tone ?? '?'} ton, ${teamText.replace('⚠ ', '')}. Open lorry details.`}
        className={`block w-full rounded px-1 py-0.5 text-left hover:bg-gray-50 ${FOCUS_RING}`}
      >
        <span className="block font-mono text-xs font-semibold text-gray-900">{row.truck.plate}</span>
        <span className="block text-[11px] leading-tight">
          <span className="text-gray-500">{row.truck.tone ? `${row.truck.tone} ton` : '—'}</span>
          <span className="text-gray-400"> · </span>
          <span className={teamTone}>{teamText}</span>
        </span>
      </button>
      <HoverCard open={hover.open} anchorRect={hover.anchorRect} cardProps={hover.cardProps} label={`${row.truck.plate} details`}>
        <LorryCard detail={detail} />
      </HoverCard>
    </>
  );
}
