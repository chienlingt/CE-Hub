// client/src/utils/driverStatusMap.js
// Maps CE-Hub order_status values to the simplified driver display model.

/** Driver tab identifiers */
export const DRIVER_TABS = ['all', 'Scheduled', 'Delivering', 'Completed', 'Issue'];

/** Statuses to hide from the driver view entirely */
const HIDDEN_STATUSES = ['Pending'];

/** Statuses that map to the "Scheduled" driver tab */
const SCHEDULED_STATUSES = ['Scheduled', 'Loaded'];

/** Statuses that map to the "Delivering" driver tab */
const DELIVERING_STATUSES = ['Delivering', 'In Progress'];

/** Statuses that map to the "Completed" driver tab */
const COMPLETED_STATUSES = ['Delivered', 'Installing', 'Completed'];

/** Statuses that map to the "Issue" driver tab */
const ISSUE_STATUSES = ['Issue', 'Failed', 'Cancelled'];

/** Terminal statuses — Update button disabled */
export const TERMINAL_STATUSES = ['Delivered', 'Completed', 'Failed', 'Cancelled'];

/**
 * Returns the driver-facing tab name for a given CE-Hub order_status.
 * Returns null for hidden statuses.
 */
export function driverTab(orderStatus) {
  if (!orderStatus) return null;
  if (HIDDEN_STATUSES.includes(orderStatus))   return null;
  if (SCHEDULED_STATUSES.includes(orderStatus)) return 'Scheduled';
  if (DELIVERING_STATUSES.includes(orderStatus)) return 'Delivering';
  if (COMPLETED_STATUSES.includes(orderStatus)) return 'Completed';
  if (ISSUE_STATUSES.includes(orderStatus))     return 'Issue';
  return null;
}

/**
 * Returns a display badge label and colour class for the status chip.
 * Uses the driver's simplified view rather than CE-Hub internals.
 */
export function statusBadge(orderStatus) {
  const tab = driverTab(orderStatus);
  const map = {
    Scheduled:  { label: 'Scheduled',  color: 'bg-blue-100 text-blue-800'   },
    Delivering: { label: 'Delivering', color: 'bg-yellow-100 text-yellow-800' },
    Completed:  {
      label: orderStatus === 'Delivered' ? 'Delivered' : 'Completed',
      color: 'bg-green-100 text-green-800',
    },
    Issue:      { label: 'Issue',      color: 'bg-red-100 text-red-800'     },
  };
  return map[tab] || { label: orderStatus || 'Unknown', color: 'bg-gray-100 text-gray-800' };
}

/**
 * Returns allowed status transitions from the current status.
 * Completion (→ Completed) is handled separately via the POD modal.
 */
export function allowedTransitions(orderStatus) {
  if (SCHEDULED_STATUSES.includes(orderStatus))  return ['Delivering', 'Issue'];
  if (DELIVERING_STATUSES.includes(orderStatus)) return ['Completed', 'Issue'];
  return [];
}

/**
 * Whether the order is in a terminal state (no further status updates).
 */
export function isTerminal(orderStatus) {
  return TERMINAL_STATUSES.includes(orderStatus);
}

/**
 * Whether Update should open in issue-edit mode (order already flagged Issue).
 */
export function isIssueEditMode(orderStatus) {
  return orderStatus === 'Issue';
}

/** Completed/delivered orders — driver can view or add delivery evidence. */
export function isCompletedEvidenceMode(orderStatus) {
  return orderStatus === 'Completed' || orderStatus === 'Delivered';
}
