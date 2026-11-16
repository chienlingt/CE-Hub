// server/services/deliveryGates.js
//
// The rules an order must meet before a delivery can be completed (full or partial).
//
//   1. Every item is loaded. There is no unloading step any more.
//   2. The driver marked the order as arrived, which records the arrival time.
//
// Failing an order is not gated by either rule: a driver can fail a delivery at any time.

// 'unloaded' is only found on records from before the unloading step was removed.
const ON_VAN = ['loaded', 'unloaded'];

/**
 * @param {Array<{ id: number, handling_status?: string }>} items - order_products rows
 * @param {Date|string|null} arrivedAt - orders.actual_arrival_date_time
 * @returns {null | { statusCode: number, code: string, message: string, items?: Array }}
 */
function deliveryBlocker(items, arrivedAt) {
  const notLoaded = (items || []).filter(item => !ON_VAN.includes(item.handling_status));
  if (notLoaded.length > 0) {
    return {
      statusCode: 400, code: 'ITEMS_NOT_LOADED',
      message: 'Cannot complete: not all items are loaded.',
      items: notLoaded.map(item => ({ id: item.id, status: item.handling_status })),
    };
  }
  if (!arrivedAt) {
    return { statusCode: 409, code: 'NOT_ARRIVED', message: 'Mark the order as arrived before completing the delivery.' };
  }
  return null;
}

/** Throw the blocker as an Error with .statusCode / .code, the shape the routes already handle. */
function assertDeliverable(items, arrivedAt) {
  const blocker = deliveryBlocker(items, arrivedAt);
  if (!blocker) return;
  throw Object.assign(new Error(blocker.message), { statusCode: blocker.statusCode, code: blocker.code, items: blocker.items });
}

module.exports = { ON_VAN, deliveryBlocker, assertDeliverable };
