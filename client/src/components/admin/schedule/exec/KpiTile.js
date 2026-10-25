import React from 'react';
import { textClass, FOCUS_RING } from '../../../common/tokens';

/**
 * One KPI. Renders a <button> only when it navigates — a non-interactive tile
 * must not be focusable, or keyboard users tab through dead stops.
 */
function KpiTile({ kpi, onSelect }) {
  const interactive = Boolean(kpi.action && onSelect);
  const Element = interactive ? 'button' : 'div';

  return (
    <Element
      {...(interactive ? { type: 'button', onClick: () => onSelect(kpi.action) } : {})}
      className={[
        'rounded-md border border-gray-200 bg-white p-3 transition-colors',
        interactive ? `text-left ${FOCUS_RING} hover:border-gray-300 hover:bg-gray-50` : '',
      ].join(' ')}
    >
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{kpi.label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${textClass(kpi.tone)}`}>
        {kpi.value}
      </p>
      {kpi.secondary && (
        <p className="mt-0.5 truncate text-[11px] text-gray-500">{kpi.secondary}</p>
      )}
    </Element>
  );
}

export default React.memo(KpiTile);
