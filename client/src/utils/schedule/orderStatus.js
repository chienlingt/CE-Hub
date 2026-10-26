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

const has = (list, value) => list.includes(value);

/** Does this order's status mean its slot can no longer be edited? */
export const isLockedStatus = (status) => has(EXEC_STATUSES, status);
export const isTerminalStatus = (status) => has(TERMINAL_STATUSES, status);
export const isActiveStatus = (status) => has(ACTIVE_STATUSES, status);
