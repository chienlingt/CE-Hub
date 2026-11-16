import { useCallback, useEffect, useState } from 'react';
import { getExceptionSummary } from '../services/exceptionApi';

const POLL_MS = 30000;
const EMPTY = { total: 0, failed_deliveries: 0, driver_reports: 0, system_reports: 0, sync_approvals: 0 };

const hasAdminSession = () => {
  try { return !!JSON.parse(sessionStorage.getItem('adminSession'))?.token; } catch { return false; }
};

const count = value => (Number.isFinite(value) ? value : 0);

/**
 * Open items on the Exceptions tabs, for the red badges (all 0 for non-admins):
 *   failed_deliveries  open failed-delivery cases
 *   driver_reports     open reports on the Driver Escalations tab
 *   system_reports     pending system reports
 *   sync_approvals     Sync Monitor changes needing approval
 *   total              their sum, shown beside "Exceptions"
 * Polls every 30 seconds while the page is visible, and when the window regains focus.
 */
export default function useExceptionCount(enabled = true) {
  const [summary, setSummary] = useState(EMPTY);

  const refresh = useCallback(async () => {
    if (!enabled || !hasAdminSession()) { setSummary(EMPTY); return; }
    try {
      const data = await getExceptionSummary();
      setSummary({
        total: count(data.total), failed_deliveries: count(data.failed_deliveries), driver_reports: count(data.driver_reports),
        system_reports: count(data.system_reports), sync_approvals: count(data.sync_approvals),
      });
    } catch (error) {
      // Header badge is non-critical: keep the last known numbers, but say why in the console.
      console.warn('[Exceptions] badge count unavailable:', error.status || error.message);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return summary;
}
