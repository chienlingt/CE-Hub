// When is a slot no longer editable?
//
// Requirement: trips in "Delivering" status must be visually locked. But the
// lock signal is the slot OR the order, not one of them — orders.order_status
// and time_slots.slot_status can disagree in real data, and
// lorry_trips.status = 'planned' is NEVER written by any code path, so nothing
// may key off it.
//
// A locked slot must not register as a droppable at all. Visually disabling it
// is not enough: @dnd-kit would still offer it as a drop target.

import { EXEC_STATUSES, isLockedStatus } from './orderStatus';

/** @returns {boolean} */
export function isSlotLocked(slot, slotOrders = []) {
  if (!slot) return false;
  if (slot.status && slot.status !== 'scheduled') return true;
  return slotOrders.some(o => isLockedStatus(o?.status));
}

export function isSlotCompleted(slot, slotOrders = []) {
  if (slot?.status === 'completed') return true;

  // A cancelled order neither completes a slot nor occupies it. A slot holding
  // nothing but cancellations is effectively empty, so it must stay editable —
  // treating it as completed would lock a slot the dispatcher still needs.
  const live = slotOrders.filter(o => o && o.status !== 'Cancelled');
  return live.length > 0 && live.every(o => ['Delivered', 'Failed'].includes(o.status));
}

/** Human-readable reason, for the lock badge's tooltip. Null when unlocked. */
export function lockReason(slot, slotOrders = []) {
  if (!isSlotLocked(slot, slotOrders)) return null;

  if (isSlotCompleted(slot, slotOrders)) return 'Trip completed';
  if (slot?.status === 'out_for_delivery') return 'Out for delivery';

  const live = slotOrders.find(o => isLockedStatus(o?.status));
  if (live) return `Order in progress (${live.status})`;
  return 'Locked';
}

/**
 * Lifecycle label for the day card's state chip. Derived, never stored.
 * @returns {'live'|'completed'|'awaiting_approval'|'approved'|'draft'}
 */
export function slotLifecycle(slot, slotOrders = []) {
  if (isSlotCompleted(slot, slotOrders)) return 'completed';
  if (isSlotLocked(slot, slotOrders)) return 'live';

  const orders = slotOrders.filter(Boolean);
  if (!orders.length) return 'draft';

  if (orders.every(o => o.assignmentStatus === 'approved')) return 'approved';
  if (orders.some(o => o.assignmentStatus === 'assigned')) return 'awaiting_approval';
  return 'draft';
}

export { EXEC_STATUSES };
