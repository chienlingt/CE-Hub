// A.3 FR-03-003 — which customer gets the On-the-Way message next.
// Pure: no database access.
//
// Only the next customer on the route is told the truck is coming: Stop 1 when
// the truck departs, then the next open stop each time a stop is delivered or failed.
//
// Route order: B.2 writes truck_loading_sequence = stops - deliveryIndex, so the
// highest sequence is delivered first. Orders without a sequence go last, by
// scheduled start time.

const OPEN_STOP_STATUS = 'Delivering';

function startMs(order) {
  const t = order.scheduled_start_date_time ? new Date(order.scheduled_start_date_time).getTime() : NaN;
  return Number.isFinite(t) ? t : Infinity;
}

function routeOrder(a, b) {
  const sa = a.truck_loading_sequence;
  const sb = b.truck_loading_sequence;
  if (sa != null && sb != null && sa !== sb) return sb - sa;
  if (sa != null && sb == null) return -1;
  if (sa == null && sb != null) return 1;
  return startMs(a) - startMs(b);
}

/**
 * @param {Array<{ order_status, truck_loading_sequence?, scheduled_start_date_time? }>} orders  orders on one slot
 * @returns the next open stop in route order, or null when none is left
 */
function pickNextStop(orders) {
  const open = (orders || []).filter(order => order.order_status === OPEN_STOP_STATUS);
  if (open.length === 0) return null;
  return [...open].sort(routeOrder)[0];
}

module.exports = { pickNextStop, OPEN_STOP_STATUS };
