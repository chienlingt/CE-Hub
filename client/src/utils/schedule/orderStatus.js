// Canonical order / slot / assignment status vocabulary.
//
// Prisma has NO enums for any of these — orders.order_status,
// time_slots.slot_status and lorry_trips.status are all bare VarChar, so a
// typo'd status fails silently with no schema-level guard.
//
// The server declares overlapping subsets of this in three separate places:
//   server/services/deliveryLifecycleService.js:16-24
//   server/services/intelligentRouteOptimizationService.js:17
//   server/routes/time-slots.js:122
// This file is the client's mirror. If you change one, change all four.

/** Every order_status value that appears anywhere in the codebase. */
export const ORDER_STATUSES = [
  'Pending', 'Scheduled', 'Loaded', 'Delivering', 'Installing',
  'In Progress', 'Delivered', 'Failed', 'Cancelled', 'Issue',
];

/** Work is finished, one way or another. */
export const TERMINAL_STATUSES = ['Delivered', 'Failed', 'Cancelled'];

/** Still assignable — the truck has not left the warehouse. */
export const PRE_DEPART_STATUSES = ['Pending', 'Scheduled', 'Loaded'];

/** In flight or finished: the trip has started, so the slot is locked. */
export const EXEC_STATUSES = [
  'Loaded', 'Delivering', 'Installing', 'In Progress', 'Delivered', 'Failed',
];

/** Counts toward a slot's load (excludes cancelled work). */
export const ACTIVE_STATUSES = [
  'Pending', 'Scheduled', 'Loaded', 'Delivering', 'Installing', 'In Progress', 'Delivered',
];

/** time_slots.slot_status state machine: scheduled -> out_for_delivery -> completed. */
export const SLOT_STATUSES = ['scheduled', 'out_for_delivery', 'completed'];

/**
 * orders.assignment_status. 'rejected' does not exist on the server yet —
 * there is no reject endpoint, only POST /api/orders/:id/approve. 'pending_review'
 * appears in the old DoAssignment.js status styles but NO server path writes it,
 * so it is deliberately excluded here rather than carried forward as a dead state.
 */
export const ASSIGNMENT_STATUSES = ['unassigned', 'assigned', 'approved', 'rejected'];

const has = (list, value) => list.includes(value);

/** Does this order's status mean its slot can no longer be edited? */
export const isLockedStatus = (status) => has(EXEC_STATUSES, status);
export const isTerminalStatus = (status) => has(TERMINAL_STATUSES, status);
export const isPreDepartStatus = (status) => has(PRE_DEPART_STATUSES, status);
export const isActiveStatus = (status) => has(ACTIVE_STATUSES, status);
