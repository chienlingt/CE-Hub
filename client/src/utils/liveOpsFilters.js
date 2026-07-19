// Client-side helpers for Live Deliveries.

import { todayLocalDateKey } from './dateKey';

/**
 * Order is overdue when still Delivering and the slot date is today or earlier.
 * @param {{ order_status?: string }} order
 * @param {string|null|undefined} slotDate  YYYY-MM-DD
 */
export function isOrderOverdue(order, slotDate) {
  if (order?.order_status !== 'Delivering') return false;
  if (!slotDate) return false;
  return slotDate <= todayLocalDateKey();
}

/** @param {object} trip */
export function countOverdueOrdersInTrip(trip) {
  const slotDate = trip?.date;
  const items = trip?.order_summaries?.length
    ? trip.order_summaries
    : (trip?.orders?.items || []);
  return items.filter(o => isOrderOverdue(o, slotDate)).length;
}

/** @param {Array} trips */
export function tripHasOverdueOrders(trip) {
  return countOverdueOrdersInTrip(trip) > 0;
}

/** Total overdue orders across all trips. */
export function countTotalOverdueOrders(trips) {
  return (trips || []).reduce((sum, t) => sum + countOverdueOrdersInTrip(t), 0);
}

/** Keep only trips that have at least one overdue order. */
export function filterTripsByOverdue(trips) {
  return (trips || []).filter(tripHasOverdueOrders);
}

/**
 * Apply date chip filter client-side (trips are loaded with date=all).
 * @param {Array} trips
 * @param {'today'|'all'|'overdue'|string} dateFilter
 */
export function filterTripsByDate(trips, dateFilter) {
  if (!trips?.length) return [];
  if (dateFilter === 'all') return trips;
  if (dateFilter === 'overdue') return filterTripsByOverdue(trips);
  if (dateFilter === 'today') {
    const today = todayLocalDateKey();
    return trips.filter(t => t.date === today);
  }
  // specific YYYY-MM-DD
  return trips.filter(t => t.date === dateFilter);
}

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
