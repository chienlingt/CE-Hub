// Semantic colour tokens.
//
// Consolidates five informal copies of the same idea:
//   admin/exceptions/shared/StatCard.js        TONES
//   utils/slotStatusHelpers.js                 getSlotStatusStyle
//   driver/SlotOrderGroup.js                   SLOT_STATUS_STYLE
//   admin/DoAssignment.js                      STATUS_STYLES
//   utils/failureReasons.js                    FAILURE_REASON_STYLES
//
// Class names are kept as FULL LITERAL STRINGS on purpose: Tailwind's purge
// scans source text, so a composed string like `bg-${hue}-100` is dropped from
// the build. That is also why these do not move into tailwind.config.js.

export const TONES = ['blue', 'green', 'amber', 'red', 'orange', 'purple', 'gray'];

const BADGE = {
  blue:   'bg-blue-100 text-blue-800 border border-blue-200',
  green:  'bg-green-100 text-green-800 border border-green-200',
  amber:  'bg-amber-100 text-amber-800 border border-amber-200',
  red:    'bg-red-100 text-red-800 border border-red-200',
  orange: 'bg-orange-100 text-orange-800 border border-orange-200',
  purple: 'bg-purple-100 text-purple-800 border border-purple-200',
  gray:   'bg-gray-100 text-gray-700 border border-gray-200',
};

const BAR = {
  blue: 'bg-blue-500', green: 'bg-green-500', amber: 'bg-amber-500',
  red: 'bg-red-500', orange: 'bg-orange-500', purple: 'bg-purple-500',
  gray: 'bg-gray-400',
};

export const badgeClass = (tone = 'gray') => BADGE[tone] ?? BADGE.gray;
export const barClass   = (tone = 'gray') => BAR[tone] ?? BAR.gray;

/** Utilisation banding: calm up to 85%, amber to 100%, red beyond. */
export function pctTone(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'gray';
  if (pct > 1) return 'red';
  if (pct > 0.85) return 'amber';
  return 'blue';
}

export const meterClass = (pct) => barClass(pctTone(pct));

/** Lifecycle chips, shared by the day cards, grid cells and approval queue. */
export const LIFECYCLE = {
  draft:              { label: 'DRAFT',     tone: 'gray'   },
  awaiting_approval:  { label: 'APPROVAL',  tone: 'amber'  },
  approved:           { label: 'APPROVED',  tone: 'green'  },
  live:               { label: 'LIVE',      tone: 'orange' },
  completed:          { label: 'DONE',      tone: 'green'  },
};

export const lifecycleMeta = (key) => LIFECYCLE[key] ?? LIFECYCLE.draft;

/** Shared focus treatment, so every interactive element matches. */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1';
