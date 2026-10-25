// Shared slot status badge helpers.
// Extracted from DelSchedule.js and truckSchedule.js to avoid duplication.

/**
 * Returns Tailwind classes for the slot status badge background/text.
 * @param {'scheduled'|'out_for_delivery'|'completed'|string} slotStatus
 */
export function getSlotStatusStyle(slotStatus) {
  switch (slotStatus) {
    case 'out_for_delivery': return 'bg-orange-100 text-orange-800 border border-orange-200';
    case 'completed':        return 'bg-green-100 text-green-800 border border-green-200';
    default:                 return 'bg-blue-100 text-blue-800 border border-blue-200';
  }
}

/**
 * Returns the human-readable label for a slot status.
 * @param {'scheduled'|'out_for_delivery'|'completed'|string} slotStatus
 */
export function getSlotStatusLabel(slotStatus) {
  switch (slotStatus) {
    case 'out_for_delivery': return 'Out for Delivery';
    case 'completed':        return 'Completed';
    default:                 return 'Scheduled';
  }
}
