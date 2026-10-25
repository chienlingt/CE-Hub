// Board colour vocabulary. Literal class strings on purpose: Tailwind's purge
// scans source text, so composed names would be dropped (see common/tokens.js).
//
// Two independent axes, as in the old schedule.php legend:
//   DO block  = approval state of that DO (plus a glyph, so greyscale print works)
//   cell      = the lorry-slot's own state (open / truck full / off / past)

export const BLOCK_STATES = {
  pending: {
    label: 'Pending WH', glyph: '◐',
    className: 'border-amber-300 bg-amber-50 text-amber-950',
  },
  confirmed: {
    // The old sheet's "FOR WH" row: the warehouse admin has confirmed it.
    label: 'Confirmed', glyph: '●',
    className: 'border-blue-300 bg-blue-50 text-blue-950',
  },
  locked: {
    label: 'Out for delivery', glyph: '🔒',
    className: 'border-orange-300 bg-orange-50 text-orange-950',
  },
  done: {
    label: 'Completed', glyph: '✓',
    className: 'border-green-300 bg-green-50 text-green-950',
  },
  rejected: {
    label: 'Rejected', glyph: '✕',
    className: 'border-red-500 border-2 bg-white text-gray-900',
  },
  unscheduled: {
    label: 'Unscheduled', glyph: '○',
    className: 'border-gray-300 bg-white text-gray-900',
  },
};

export const CELL_STATES = {
  open:   { label: 'Open',            className: 'bg-white' },
  full:   { label: 'Lorry full',      className: 'bg-red-50' },
  locked: { label: 'Out for delivery', className: 'bg-white' },
  noteam: { label: 'No team',         className: 'bg-gray-100' },
  // NIGHT before anyone asked for it: grey, yet droppable — the drop is the request.
  nightclosed: { label: 'No night delivery', className: 'bg-gray-100' },
  off:    { label: 'Off',             className: 'bg-gray-100' },
  past:   { label: 'Past',            className: 'bg-gray-50' },
};

export const blockMeta = (state) => BLOCK_STATES[state] ?? BLOCK_STATES.unscheduled;
export const cellMeta = (state) => CELL_STATES[state] ?? CELL_STATES.open;

/** Hatching for a window at its shared DO cap — readable in greyscale too. */
export const FULL_WINDOW_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgba(220,38,38,0.08) 0 6px, transparent 6px 12px)',
};
