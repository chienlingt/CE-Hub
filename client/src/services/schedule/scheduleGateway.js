// The scheduler UI's data contract. JSDoc only — no implementation.
//
// Both gateways satisfy this, so swapping mock for live changes no component,
// no selector and no rule module. ScheduleProvider is the ONLY file permitted
// to import from this directory.

/**
 * @typedef {Object} Snapshot
 * @property {object} entities  normalized, as scheduleNormalize.normalizeSnapshot returns
 * @property {{startDateKey: string, endDateKey: string, dateKeys: string[], workingDateKeys: string[]}} range
 * @property {string|null} scenario  mock only; null on the live path
 * @property {string} asOf           ISO timestamp, shown so staleness is visible
 */

/**
 * @typedef {Object} Move
 * @property {string} orderId
 * @property {string|null} fromSlotId
 * @property {string|null} toSlotId   null unassigns
 * @property {number|null} toIndex
 */

/**
 * @typedef {Object} CommitResult
 * @property {string[]} applied                      order ids that landed
 * @property {Array<{orderId, code, message, recovery?}>} rejected
 *
 * Per-order results from day one, deliberately: the live path has to partition
 * a batch across two different endpoints (PATCH /api/orders/:id for cross-slot
 * moves, POST /api/driver/route/:slotId/reorder for in-slot ones) and merge two
 * result sets. A boolean return would force a signature change later.
 */

/**
 * @typedef {Object} ScheduleGateway
 * @property {(args: {startDateKey: string, endDateKey: string, scenario?: string}) => Promise<Snapshot>} loadSnapshot
 * @property {() => Promise<object>} loadConfig
 * @property {(patch: object) => Promise<object>} saveConfig
 * @property {(moves: Move[]) => Promise<CommitResult>} commitMoves
 * @property {() => Promise<{runId: string, scheduled: number, unscheduled: number, warnings: string[]}>} runAutoSchedule
 * @property {(orderIds: string[]) => Promise<CommitResult>} approveOrders
 * @property {(orderIds: string[], reason: string) => Promise<CommitResult>} rejectOrders
 * @property {(orderIds: string[]) => Promise<CommitResult>} unapproveOrders
 *   Undo an approval: the DOs go back to awaiting approval, still in their slot.
 * @property {(args: {dateKey: string, start: string, end: string, truckId: string, teamId: string|null}) => Promise<object>} createSlot
 *   A lorry has no slot in a window until it carries a DO there; the Board
 *   creates one on the first drop. Resolves to the normalized slot.
 * @property {(input: {address: string, sizeBand: string, installation: boolean, notBefore: string|null}) => Promise<{options: object[], reasons: string[], notCounted: number, addressMatched: boolean}>} recommendSlots
 *   Advisory slot recommendation for an order Odoo has not synced yet. Writes nothing.
 */

export const GATEWAY_METHODS = [
  'loadSnapshot', 'loadConfig', 'saveConfig', 'commitMoves',
  'runAutoSchedule', 'approveOrders', 'rejectOrders', 'unapproveOrders', 'createSlot', 'recommendSlots',
];

/** Dev guard: fail loudly rather than at the first missing call. */
export function assertGateway(gateway, name = 'gateway') {
  const missing = GATEWAY_METHODS.filter(m => typeof gateway?.[m] !== 'function');
  if (missing.length) {
    throw new Error(`${name} is missing ScheduleGateway methods: ${missing.join(', ')}`);
  }
  return gateway;
}
