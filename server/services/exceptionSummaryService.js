// server/services/exceptionSummaryService.js
//
// Numbers for the red badges on the Exceptions tabs, and their total beside
// "Exceptions" in the sidebar. Each count mirrors what that tab shows as open:
//
//   Failed Deliveries   open cases: orders with an operational issue whose
//                       issue_status is not resolved (driver reports excluded)
//   Driver Escalations  the "Open reports" card: driver order reports (not
//                       escalation submissions) whose issue_status is not resolved
//   System Reports      the "Pending" card: staff reports with status pending
//                       (an empty status counts as pending, as on that tab)
//   Sync Monitor        "Needs approval": Odoo change requests awaiting a decision
//   Fleet Blocked       open orders from today on a truck or team that a block-off
//                       now covers (B.4 Fleet Availability), counted once per order
//
// The two order groups are disjoint (the failed-deliveries filter excludes driver
// reports), so nothing is counted twice.

const prisma = require('../prismaClient');
const { countFleetBlocked } = require('./fleetAvailabilityService');

// Same value as routes/orders.js.
const DRIVER_ESCALATION_REASON = 'Driver Escalation';

const present = field => [{ [field]: { not: null } }, { [field]: { not: '' } }];
const openIssue = { OR: [{ issue_status: null }, { issue_status: { not: 'resolved' } }] };
const isDriverReport = {
  AND: [
    ...present('issue_reason'), ...present('issue_desc'),
    { OR: [{ is_complaint_submitted: true }, { order_status: 'Issue' }, { issue_reason: DRIVER_ESCALATION_REASON }] },
  ],
};

const where = {
  failedDeliveries: { AND: [...present('issue_reason'), { NOT: isDriverReport }, openIssue] },
  openDriverReports: { AND: [isDriverReport, { OR: [{ is_complaint_submitted: false }, { is_complaint_submitted: null }] }, openIssue] },
  pendingSystemReports: { OR: [{ status: null }, { status: '' }, { status: { equals: 'pending', mode: 'insensitive' } }] },
  pendingApprovals: { status: 'pending' },
};

/**
 * Each count is fetched on its own: if one source fails (say a table is
 * missing), that badge shows 0 and the others still work. Only when every
 * source fails is the error raised, so the caller can report "unavailable".
 */
async function getExceptionSummary(db = prisma, log = console) {
  const sources = {
    failed_deliveries: () => db.orders.count({ where: where.failedDeliveries }),
    driver_reports: () => db.orders.count({ where: where.openDriverReports }),
    system_reports: () => db.reports.count({ where: where.pendingSystemReports }),
    sync_approvals: () => db.odoo_change_requests.count({ where: where.pendingApprovals }),
    fleet_blocked: () => countFleetBlocked(db),
  };
  const names = Object.keys(sources);
  const results = await Promise.allSettled(names.map(name => sources[name]()));
  const summary = {};
  const failed = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') summary[names[index]] = result.value;
    else {
      summary[names[index]] = 0;
      failed.push(names[index]);
      log.error(`[Exceptions] ${names[index]} count failed:`, result.reason?.message);
    }
  });
  if (failed.length === names.length) throw new Error('No exception count could be read.');
  summary.total = names.reduce((sum, name) => sum + summary[name], 0);
  if (failed.length) summary.unavailable = failed;
  return summary;
}

module.exports = { getExceptionSummary, where };
