// Conflict / infeasibility vocabulary.
//
// This is the CONTRACT between the UI and the B.1 engine. Today
// server/services/scheduler.js writes orders.unscheduled_reason as one of only
// two coarse free-text strings (':167' and ':925'), which cannot drive a useful
// exception panel. These codes are what the engine should emit instead.
//
// Severity:
//   'blocking' — the assignment is infeasible; the drop is refused.
//   'warning'  — allowed, but the dispatcher should know.
//
// Follows the existing pattern of utils/failureReasons.js and
// utils/escalationReasons.js (code -> { label, style }).

export const ISSUE = {
  SLOT_LOCKED:             'SLOT_LOCKED',
  SLOT_COMPLETED:          'SLOT_COMPLETED',
  SLOT_IN_PAST:            'SLOT_IN_PAST',
  SLOT_DO_CAP_REACHED:     'SLOT_DO_CAP_REACHED',
  TRUCK_VOLUME_EXCEEDED:   'TRUCK_VOLUME_EXCEEDED',
  TRUCK_TONNAGE_EXCEEDED:  'TRUCK_TONNAGE_EXCEEDED',
  TRUCK_UNASSIGNED:        'TRUCK_UNASSIGNED',
  TRUCK_OFF_DAY:           'TRUCK_OFF_DAY',
  TEAM_UNASSIGNED:         'TEAM_UNASSIGNED',
  TEAM_UNAVAILABLE:        'TEAM_UNAVAILABLE',
  INSTALLER_TEAM_MISSING:  'INSTALLER_TEAM_MISSING',
  ACCESS_WINDOW_MISS:      'ACCESS_WINDOW_MISS',
  PERMIT_REQUIRED:         'PERMIT_REQUIRED',
  SERVICE_TIME_OVERFLOW:   'SERVICE_TIME_OVERFLOW',
  VEHICLE_SIZE_ADVISORY:   'VEHICLE_SIZE_ADVISORY',
  WEIGHT_DATA_MISSING:     'WEIGHT_DATA_MISSING',
  NO_AVAILABLE_SLOT:       'NO_AVAILABLE_SLOT',
};

/**
 * `constraint` maps to the §5 constraint-priority table in the design proposal,
 * and is what the exec dashboard's "binding constraints" panel groups by.
 */
const DEFINITIONS = {
  [ISSUE.SLOT_LOCKED]: {
    label: 'Trip already departed',
    detail: 'This slot is out for delivery — its assignments are locked.',
    severity: 'blocking', tone: 'orange', constraint: 'Trip in progress',
  },
  [ISSUE.SLOT_COMPLETED]: {
    label: 'Trip completed',
    detail: 'This slot has finished and cannot be changed.',
    severity: 'blocking', tone: 'gray', constraint: 'Trip in progress',
  },
  [ISSUE.SLOT_IN_PAST]: {
    label: 'Past day',
    detail: 'This day has passed; its schedule can no longer change.',
    severity: 'blocking', tone: 'gray', constraint: 'Trip in progress',
  },
  [ISSUE.SLOT_DO_CAP_REACHED]: {
    label: 'Slot full',
    detail: 'This window is at its maximum delivery-order count across all lorries.',
    severity: 'blocking', tone: 'red', constraint: 'Slot DO cap',
  },
  [ISSUE.TRUCK_VOLUME_EXCEEDED]: {
    label: 'Over volume',
    detail: 'The items exceed the assigned lorry’s load space.',
    severity: 'blocking', tone: 'red', constraint: 'Truck capacity',
  },
  [ISSUE.TRUCK_TONNAGE_EXCEEDED]: {
    label: 'Overweight',
    detail: 'The items exceed the assigned lorry’s payload.',
    severity: 'blocking', tone: 'red', constraint: 'Truck capacity',
  },
  [ISSUE.TRUCK_UNASSIGNED]: {
    label: 'No lorry assigned',
    detail: 'This slot has no lorry, so capacity cannot be checked.',
    severity: 'warning', tone: 'amber', constraint: 'Truck availability',
  },
  [ISSUE.TRUCK_OFF_DAY]: {
    label: 'Lorry off-day',
    detail: 'The assigned lorry is not available on this date.',
    severity: 'blocking', tone: 'red', constraint: 'Truck availability',
  },
  [ISSUE.TEAM_UNASSIGNED]: {
    label: 'No crew assigned',
    detail: 'This slot has no delivery team yet.',
    severity: 'warning', tone: 'amber', constraint: 'Team availability',
  },
  [ISSUE.TEAM_UNAVAILABLE]: {
    label: 'Crew unavailable',
    detail: 'The assigned team is marked unavailable.',
    severity: 'blocking', tone: 'red', constraint: 'Team availability',
  },
  [ISSUE.INSTALLER_TEAM_MISSING]: {
    label: 'No installer in crew',
    detail: 'This order needs a trained installer and the crew has none.',
    severity: 'blocking', tone: 'purple', constraint: 'Crew skill match',
  },
  [ISSUE.ACCESS_WINDOW_MISS]: {
    label: 'Outside access hours',
    detail: 'The projected arrival falls outside the building’s access window.',
    severity: 'blocking', tone: 'red', constraint: 'Access window',
  },
  [ISSUE.PERMIT_REQUIRED]: {
    label: 'Access Denied — Permit Required',
    detail: 'The building requires pre-registration before delivery.',
    severity: 'warning', tone: 'amber', constraint: 'Access window',
  },
  [ISSUE.SERVICE_TIME_OVERFLOW]: {
    label: 'Runs past slot end',
    detail: 'Service and installation time overruns the slot window.',
    severity: 'blocking', tone: 'red', constraint: 'Service duration',
  },
  [ISSUE.VEHICLE_SIZE_ADVISORY]: {
    // Deliberately advisory: buildings.vehicle_size_limit is free text in the
    // schema and never parsed, so this cannot be computed as a hard check.
    label: 'Check vehicle size limit',
    detail: 'The building records a vehicle restriction that is not machine-readable.',
    severity: 'warning', tone: 'amber', constraint: 'Vehicle-site compatibility',
  },
  [ISSUE.WEIGHT_DATA_MISSING]: {
    label: 'Weight unknown',
    detail: 'No weight recorded for one or more products, so payload is unchecked.',
    severity: 'warning', tone: 'gray', constraint: 'Truck capacity',
  },
  [ISSUE.NO_AVAILABLE_SLOT]: {
    label: 'No feasible slot',
    detail: 'No slot satisfies this order’s constraints.',
    severity: 'blocking', tone: 'red', constraint: 'No feasible slot',
  },
};

export function issueDefinition(code) {
  return DEFINITIONS[code] ?? {
    label: code ?? 'Unknown issue',
    detail: '',
    severity: 'warning',
    tone: 'gray',
    constraint: 'Other',
  };
}

export const issueLabel = (code) => issueDefinition(code).label;
export const issueTone = (code) => issueDefinition(code).tone;
export const issueSeverity = (code) => issueDefinition(code).severity;
export const issueConstraint = (code) => issueDefinition(code).constraint;
export const isBlocking = (code) => issueSeverity(code) === 'blocking';

/** Build an issue instance. `context` carries the numbers for the message. */
export function makeIssue(code, context = {}) {
  const def = issueDefinition(code);
  return {
    code,
    label: def.label,
    detail: context.detail ?? def.detail,
    severity: def.severity,
    tone: def.tone,
    constraint: def.constraint,
    ...context,
  };
}

export const ALL_ISSUE_CODES = Object.values(ISSUE);
