// client/src/utils/driverOrderFilters.js
// Client-side filtering helpers for the driver dashboard.

import { toLocalDateKey } from './dateKey';
import { driverTab } from './driverStatusMap';

/** Fixed appointment-time windows for driver dashboard filtering. */
export const DRIVER_APPOINTMENT_WINDOWS = [
  { id: '09-12', label: '09:00–12:00', start: '09:00', end: '12:00' },
  { id: '13-17', label: '13:00–17:00', start: '13:00', end: '17:00' },
  { id: '19-21', label: '19:00–21:00', start: '19:00', end: '21:00' },
];

/** Normalize slot date to yyyy-mm-dd for comparison (Leave warehouse banner). */
export function slotDateKey(date) {
  return toLocalDateKey(date);
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
export function jobMatchesSearch(job, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const fields = [
    job.id,
    job.id?.slice(0, 8),
    job.product,
    ...(Array.isArray(job.products) ? job.products : []),
    job.customer_name,
    job.address,
    job.odoo_order_ref,
    job.appointment_window,
    job.status,
  ];

  return fields.some(value => value && String(value).toLowerCase().includes(q));
}

export function filterBySearch(jobs, query) {
  const q = query.trim();
  if (!q) return jobs;
  return jobs.filter(job => jobMatchesSearch(job, q));
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

// ─── Slot-group helpers ───────────────────────────────────────────────────────

/**
 * Group a flat job list by time_slot_id.
 * Returns [{ slot, jobs }] sorted by time_window_start ascending.
 * Jobs with no time_slot_id are collected into a trailing { slot: null, jobs } group.
 *
 * @param {Array} jobs      - enriched job objects (must have time_slot_id)
 * @param {Array} slots     - slot summary objects from useDriverJobs (for the selected date)
 */
export function groupJobsBySlot(jobs, slots) {
  const slotMap = new Map((slots || []).map(s => [s.id, s]));

  const groupMap = new Map();

  for (const job of jobs) {
    const key = job.time_slot_id || '__unassigned__';
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        slot: key === '__unassigned__' ? null : (slotMap.get(job.time_slot_id) || { id: job.time_slot_id }),
        jobs: [],
      });
    }
    groupMap.get(key).jobs.push(job);
  }

  return [...groupMap.values()].sort((a, b) => {
    if (!a.slot) return 1;
    if (!b.slot) return -1;
    const ta = a.slot.time_window_start || '';
    const tb = b.slot.time_window_start || '';
    return ta.localeCompare(tb);
  });
}

/**
 * Map a slot's time_window_start to an appointment bucket id.
 * @param {object|null} slot
 * @returns {'09-12'|'13-17'|'19-21'|'other'}
 */
export function getSlotBucket(slot) {
  if (!slot?.time_window_start) return 'other';
  const mins = parseClockToMinutes(slot.time_window_start);
  for (const w of DRIVER_APPOINTMENT_WINDOWS) {
    const start = parseClockToMinutes(w.start);
    const end   = parseClockToMinutes(w.end);
    if (mins >= start && mins <= end) return w.id;
  }
  return 'other';
}

/**
 * Filter slot groups by appointment-window chip.
 * Unassigned group (slot === null) matches 'other'.
 */
export function filterGroupsByWindow(groups, windowFilter) {
  if (!windowFilter || windowFilter === 'all') return groups;
  return groups.filter(g => {
    if (!g.slot) return windowFilter === 'other';
    return getSlotBucket(g.slot) === windowFilter;
  });
}

/**
 * Filter slot groups by driver tab.
 * A group is kept if at least one of its jobs maps to the active tab.
 */
export function filterGroupsByTab(groups, tab) {
  if (!tab || tab === 'all') return groups;
  return groups.filter(g =>
    g.jobs.some(job => {
      const t = driverTab(job.status);
      return t && t === tab;
    })
  );
}

/**
 * Filter slot groups by text search.
 * Keeps only matching jobs inside each group; drops empty groups.
 */
export function filterGroupsBySearch(groups, query) {
  const q = query.trim();
  if (!q) return groups;

  return groups
    .map(g => ({
      ...g,
      jobs: g.jobs.filter(job => jobMatchesSearch(job, q)),
    }))
    .filter(g => g.jobs.length > 0);
}

/**
 * Build appointment-window filter chip options from slot groups.
 * Counts reflect total jobs in matching groups.
 */
export function buildWindowOptionsFromGroups(groups) {
  const total = groups.reduce((sum, g) => sum + g.jobs.length, 0);
  const options = [{ value: 'all', label: 'All runs', count: total }];

  for (const w of DRIVER_APPOINTMENT_WINDOWS) {
    const count = groups
      .filter(g => g.slot && getSlotBucket(g.slot) === w.id)
      .reduce((sum, g) => sum + g.jobs.length, 0);
    options.push({ value: w.id, label: w.label, count });
  }

  const otherCount = groups
    .filter(g => !g.slot || getSlotBucket(g.slot) === 'other')
    .reduce((sum, g) => sum + g.jobs.length, 0);
  if (otherCount > 0) {
    options.push({ value: 'other', label: 'Other', count: otherCount });
  }

  return options;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count stats for the stat cards — based on a date's jobs.
 */
export function computeStats(jobs) {
  const scheduled = jobs.filter(j => ['Scheduled', 'Loaded'].includes(j.status)).length;
  const completed = jobs.filter(j => ['Delivered', 'Installing', 'Completed'].includes(j.status)).length;
  const issue     = jobs.filter(j => driverTab(j.status) === 'Issue').length;
  return { scheduled, completed, issue, total: jobs.length };
}
