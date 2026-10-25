import React from 'react';
import { Lock, Wrench, AlertTriangle } from 'lucide-react';

/**
 * One DO in a grid cell. Deliberately a bare DO number plus at most two
 * glyphs: Mr Lee's sheet holds DO numbers, and anything more makes the cell
 * stop reading like a spreadsheet.
 */
function GridOrderChip({ order, locked, needsInstaller, hasIssue, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(order.id)}
      title={`${order.doNo} · ${order.status}`}
      className={[
        'flex w-full items-center gap-1 rounded px-1 py-px text-left font-mono text-[11px] leading-tight',
        'hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600',
        locked ? 'text-gray-500' : 'text-gray-800',
      ].join(' ')}
    >
      {locked && <Lock className="h-2.5 w-2.5 flex-shrink-0 text-orange-500" aria-label="locked" />}
      <span className="truncate">{order.doNo}</span>
      {needsInstaller && (
        <Wrench className="h-2.5 w-2.5 flex-shrink-0 text-purple-500" aria-label="needs installer" />
      )}
      {hasIssue && (
        <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0 text-red-500" aria-label="has issue" />
      )}
    </button>
  );
}

export default React.memo(GridOrderChip);
