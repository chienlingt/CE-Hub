// client/src/utils/driverOrderFilters.js
// Client-side filtering helpers for the driver dashboard.

import { driverTab } from './driverStatusMap';

/** Fixed appointment-time windows for driver dashboard filtering. */
export const DRIVER_APPOINTMENT_WINDOWS = [
  { id: '09-12', label: '09:00–12:00', start: '09:00', end: '12:00' },
  { id: '13-17', label: '13:00–17:00', start: '13:00', end: '17:00' },
  { id: '19-21', label: '19:00–21:00', start: '19:00', end: '21:00' },
];

/** Normalize slot date to yyyy-mm-dd for comparison (Leave warehouse banner). */
export function slotDateKey(date) {
  if (!date) return '';
  return String(date).slice(0, 10);
}

function parseClockToMinutes(clock) {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + (m || 0);
}

function appointmentMinutes(job) {
  if (!job?.time) return null;
  const d = new Date(job.time);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Bucket an order by scheduled_start_date_time (inclusive window boundaries).
 * @returns {'09-12'|'13-17'|'19-21'|'other'}
 */
export function getAppointmentBucket(job) {
  const mins = appointmentMinutes(job);
  if (mins === null) return 'other';

  for (const w of DRIVER_APPOINTMENT_WINDOWS) {
    const start = parseClockToMinutes(w.start);
    const end   = parseClockToMinutes(w.end);
    if (mins >= start && mins <= end) return w.id;
  }
  return 'other';
}

export function getAppointmentWindowLabel(bucketId) {
  if (bucketId === 'other') return 'Other';
  return DRIVER_APPOINTMENT_WINDOWS.find(w => w.id === bucketId)?.label ?? null;
}

/** Attach appointment_bucket and appointment_window to each job. */
export function enrichJobsWithAppointmentWindow(jobs) {
  return jobs.map(j => {
    const bucket = getAppointmentBucket(j);
    return {
      ...j,
      appointment_bucket:  bucket,
      appointment_window:  getAppointmentWindowLabel(bucket),
    };
  });
}

/**
 * Build appointment-window filter chips for a given date's jobs.
 * Always includes All runs + all 3 fixed windows; Other only when count > 0.
 */
export function buildAppointmentWindowOptions(dateJobs) {
  const options = [{ value: 'all', label: 'All runs', count: dateJobs.length }];

  for (const w of DRIVER_APPOINTMENT_WINDOWS) {
    options.push({
      value: w.id,
      label: w.label,
      count: dateJobs.filter(j => getAppointmentBucket(j) === w.id).length,
    });
  }

  const otherCount = dateJobs.filter(j => getAppointmentBucket(j) === 'other').length;
  if (otherCount > 0) {
    options.push({ value: 'other', label: 'Other', count: otherCount });
  }

  return options;
}

export function sortByAppointment(jobs) {
  return [...jobs].sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : Infinity;
    const tb = b.time ? new Date(b.time).getTime() : Infinity;
    return ta - tb;
  });
}

/**
 * Filter jobs to a specific date (yyyy-mm-dd).
 */
export function filterByDate(jobs, dateStr) {
  if (!dateStr) return jobs;
  return jobs.filter(job => job.assigned_date === dateStr);
}

/**
 * Filter jobs by appointment-time window bucket.
 * @param {string} windowFilter - 'all' | '09-12' | '13-17' | '19-21' | 'other'
 */
export function filterByAppointmentWindow(jobs, windowFilter) {
  if (!windowFilter || windowFilter === 'all') return jobs;
  return jobs.filter(j => getAppointmentBucket(j) === windowFilter);
}

/**
 * Filter jobs to a specific driver tab ('all', 'Scheduled', 'Delivering', 'Completed', 'Issue').
 * Hidden-status orders are never shown.
 */
export function filterByTab(jobs, tab) {
  return jobs.filter(job => {
    const t = driverTab(job.status);
    if (!t) return false;
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
    job.address?.toLowerCase().includes(q) ||
    job.odoo_order_ref?.toLowerCase().includes(q) ||
    job.appointment_window?.toLowerCase().includes(q)
  );
}

/**
 * Combined filter — date, tab, appointment window, and search.
 */
export function applyDriverFilters(jobs, { date, tab = 'all', window = 'all', search = '' }) {
  let result = jobs;
  result = filterByDate(result, date);
  result = filterByAppointmentWindow(result, window);
  result = filterByTab(result, tab);
  result = filterBySearch(result, search);
  return sortByAppointment(result);
}

/**
 * Count stats for the stat cards — based on a date's jobs.
 */
export function computeStats(jobs) {
  const scheduled = jobs.filter(j => ['Scheduled', 'Loaded'].includes(j.status)).length;
  const completed = jobs.filter(j => ['Delivered', 'Installing', 'Completed'].includes(j.status)).length;
  const issue     = jobs.filter(j => driverTab(j.status) === 'Issue').length;
  return { scheduled, completed, issue, total: jobs.length };
}
