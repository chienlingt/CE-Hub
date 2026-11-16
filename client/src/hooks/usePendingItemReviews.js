import { useCallback, useEffect, useState } from 'react';
import { getPendingItemCount } from '../services/performanceApi';

export const ITEM_REVIEW_CHANGED = 'cehub:item-review-changed';
const POLL_MS = 60000;

const hasAdminSession = () => {
  try { return !!JSON.parse(sessionStorage.getItem('adminSession'))?.token; } catch { return false; }
};

/**
 * How many items still need an admin to set their points (0 for non-admins).
 * Polls once a minute and refreshes straight away when an item is saved on the
 * Item page (see ITEM_REVIEW_CHANGED).
 */
export default function usePendingItemReviews(enabled = true) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled || !hasAdminSession()) { setCount(0); return; }
    try {
      const { pending_review: pending } = await getPendingItemCount();
      setCount(Number.isFinite(pending) ? pending : 0);
    } catch {
      // Header badge is non-critical: keep the last known value.
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    window.addEventListener(ITEM_REVIEW_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(ITEM_REVIEW_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return count;
}
