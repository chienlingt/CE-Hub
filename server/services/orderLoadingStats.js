// server/services/orderLoadingStats.js
//
// Shared helpers for computing per-order and per-slot item loading progress.
// Used by GET /api/driver/jobs (Option A) and GET /api/orders/:id/loading-status.

const END_TRIP_TERMINAL_STATUSES = ['Delivered', 'Completed', 'Cancelled', 'Failed'];

/** Orders that must be fully loaded before Leave warehouse (excludes already-Delivering). */
const PRE_DEPART_ORDER_STATUSES = ['Pending', 'Scheduled', 'Loaded'];

/**
 * Compute loading counts from an array of order_products rows.
 *
 * @param {Array<{ picking_status: string }>} orderProducts
 * @returns {{ total: number, loaded_count: number, all_loaded: boolean }}
 */
function computeOrderLoadingStats(orderProducts) {
  const total = orderProducts.length;
  const loaded_count = orderProducts.filter(i =>
    i.picking_status === 'loaded'
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
    const isPreDepart = PRE_DEPART_ORDER_STATUSES.includes(order.order_status);
    if (!isTerminal && isPreDepart && order.all_loaded) {
      entry.loaded_order_count += 1;
    }
  }

  const result = [];
  for (const entry of slotMap.values()) {
    // Only pre-depart orders (Scheduled/Loaded/Pending) gate the Leave warehouse banner.
    // Delivering orders on a still-scheduled slot are ignored — they are already en route
    // or were set via a legacy path and must not block departure for remaining orders.
    const preDepartOrders = orders.filter(
      o => o.time_slot_id === entry.id &&
           PRE_DEPART_ORDER_STATUSES.includes(o.order_status)
    );
    const all_orders_loaded = preDepartOrders.length > 0 &&
      preDepartOrders.every(o => o.all_loaded);

    result.push({
      ...entry,
      all_orders_loaded,
      ready_to_depart: entry.slot_status === 'scheduled' && all_orders_loaded,
    });
  }

  // #region agent log
  fetch('http://127.0.0.1:7869/ingest/bb893903-e6fa-49ce-bc0f-08c7f79bdc83',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'008708'},body:JSON.stringify({sessionId:'008708',location:'orderLoadingStats.js:buildSlotSummaries',message:'Slot depart readiness',data:{slotCount:result.length,slots:result.map(s=>{const preDepart=orders.filter(o=>o.time_slot_id===s.id&&PRE_DEPART_ORDER_STATUSES.includes(o.order_status));return{id:s.id,date:s.date,slot_status:s.slot_status,ready_to_depart:s.ready_to_depart,all_orders_loaded:s.all_orders_loaded,order_count:s.order_count,preDepartCount:preDepart.length,preDepartOrders:preDepart.map(o=>({id:o.id,status:o.order_status,all_loaded:o.all_loaded}))};})},timestamp:Date.now(),hypothesisId:'A,B,E,F',runId:'post-fix'})}).catch(()=>{});
  // #endregion

  return result;
}

module.exports = { computeOrderLoadingStats, buildSlotSummaries, PRE_DEPART_ORDER_STATUSES };
