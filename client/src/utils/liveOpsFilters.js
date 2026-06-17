// Client-side search helper for Live Deliveries.
// Filters trips by Odoo order ref or customer name across order_summaries.

/**
 * @param {Array} trips
 * @param {string} query
 * @returns {Array}
 */
export function filterTripsBySearch(trips, query) {
  if (!query || !query.trim()) return trips;
  const q = query.trim().toLowerCase();
  return trips.filter(trip =>
    (trip.order_summaries || []).some(
      o =>
        (o.odoo_order_ref || '').toLowerCase().includes(q) ||
        (o.customer_name  || '').toLowerCase().includes(q)
    )
  );
}
