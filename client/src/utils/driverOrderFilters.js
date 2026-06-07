// client/src/utils/driverOrderFilters.js
// Client-side filtering helpers for the driver dashboard.

import { driverTab } from './driverStatusMap';

/**
 * Filter jobs to a specific date (yyyy-mm-dd).
 */
export function filterByDate(jobs, dateStr) {
  if (!dateStr) return jobs;
  return jobs.filter(job => job.assigned_date === dateStr);
}

/**
 * Filter jobs to a specific driver tab ('all', 'Scheduled', 'Delivering', 'Completed', 'Issue').
 * Hidden-status orders are never shown.
 */
export function filterByTab(jobs, tab) {
  return jobs.filter(job => {
    const t = driverTab(job.status);
    if (!t) return false;               // hidden status
    if (tab === 'all') return true;
    return t === tab;
  });
}

/**
 * Text search across order id, product name, customer name, and address.
 */
export function filterBySearch(jobs, query) {
  if (!query) return jobs;
  const q = query.toLowerCase();
  return jobs.filter(job =>
    job.id?.toLowerCase().includes(q) ||
    job.product?.toLowerCase().includes(q) ||
    job.customer_name?.toLowerCase().includes(q) ||
    job.address?.toLowerCase().includes(q)
  );
}

/**
 * Combined filter — date, tab, and search.
 */
export function applyDriverFilters(jobs, { date, tab = 'all', search = '' }) {
  let result = jobs;
  result = filterByDate(result, date);
  result = filterByTab(result, tab);
  result = filterBySearch(result, search);
  return result;
}

/**
 * Count stats for the stat cards — based on a date's jobs.
 * "Completed" counts both Delivered and Completed statuses (plan decision #7).
 */
export function computeStats(jobs) {
  const scheduled = jobs.filter(j => ['Scheduled', 'Loaded'].includes(j.status)).length;
  const completed = jobs.filter(j => ['Delivered', 'Installing', 'Completed'].includes(j.status)).length;
  const issue     = jobs.filter(j => driverTab(j.status) === 'Issue').length;
  return { scheduled, completed, issue, total: jobs.length };
}
