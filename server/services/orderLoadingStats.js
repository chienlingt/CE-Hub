// server/services/orderLoadingStats.js
//
// Shared helpers for computing per-order and per-slot item loading progress.
// Used by GET /api/driver/jobs (Option A) and GET /api/orders/:id/loading-status.

const END_TRIP_TERMINAL_STATUSES = ['Delivered', 'Completed', 'Cancelled', 'Failed'];

/**
 * Compute loading counts from an array of order_products rows.
 *
 * @param {Array<{ picking_status: string }>} orderProducts
 * @returns {{ total: number, loaded_count: number, all_loaded: boolean }}
 */
function computeOrderLoadingStats(orderProducts) {
  const total = orderProducts.length;
  const loaded_count = orderProducts.filter(i =>
    ['loaded', 'unloaded'].includes(i.picking_status)
  ).length;
  const all_loaded = total > 0 && loaded_count === total;
  return { total, loaded_count, all_loaded };
}

/**
 * Group a list of orders (with loading stats attached) into slot summaries.
 *
 * Each slot entry includes:
 *   - id, slot_status, departed_at, date, time_window_start, time_window_end
 *   - order_count, loaded_order_count, all_orders_loaded, ready_to_depart
 *   - order_ids[]
 *
 * Only orders whose status is NOT terminal are counted toward all_orders_loaded.
 * Slots with no time_slot_id are ignored.
 *
 * @param {Array<{
 *   id: string,
 *   time_slot_id: string|null,
 *   order_status: string,
 *   all_loaded: boolean,
 *   time_slots: object|null,
 * }>} orders  Raw Prisma order rows augmented with all_loaded
 * @returns {Array<object>}
 */
function buildSlotSummaries(orders) {
  const slotMap = new Map();

  for (const order of orders) {
    if (!order.time_slot_id) continue;

    const slot = order.time_slots;
    if (!slotMap.has(order.time_slot_id)) {
      slotMap.set(order.time_slot_id, {
        id:               order.time_slot_id,
        slot_status:      slot?.slot_status      || 'scheduled',
        departed_at:      slot?.departed_at      || null,
        date:             slot?.date             || null,
        time_window_start: slot?.time_window_start || null,
        time_window_end:  slot?.time_window_end  || null,
        order_ids:        [],
        order_count:      0,
        loaded_order_count: 0,
      });
    }

    const entry = slotMap.get(order.time_slot_id);
    entry.order_ids.push(order.id);
    entry.order_count += 1;

    // Only non-terminal orders need to be loaded before depart
    const isTerminal = END_TRIP_TERMINAL_STATUSES.includes(order.order_status);
    if (!isTerminal && order.all_loaded) {
      entry.loaded_order_count += 1;
    }
  }

  const result = [];
  for (const entry of slotMap.values()) {
    // Count active (non-terminal) orders on this slot
    const activeOrders = orders.filter(
      o => o.time_slot_id === entry.id &&
           !END_TRIP_TERMINAL_STATUSES.includes(o.order_status)
    );
    const all_orders_loaded = activeOrders.length > 0 &&
      activeOrders.every(o => o.all_loaded);

    result.push({
      ...entry,
      all_orders_loaded,
      ready_to_depart: entry.slot_status === 'scheduled' && all_orders_loaded,
    });
  }

  return result;
}

module.exports = { computeOrderLoadingStats, buildSlotSummaries };
