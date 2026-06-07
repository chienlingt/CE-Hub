// client/src/hooks/useDriverJobs.js
// Fetches and refreshes driver jobs from /api/driver/jobs.
// Auto-refreshes every 30 seconds while the tab is focused.

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL as API_BASE } from '../utils/apiBaseUrl';

function apiUrl(path) {
  return `${API_BASE.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`;
}

/**
 * @param {string|null} employeeId
 * @param {number} [refreshInterval=30000]
 */
export function useDriverJobs(employeeId, refreshInterval = 30000) {
  const [jobs, setJobs]       = useState([]);
  const [slots, setSlots]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const timerRef              = useRef(null);

  const fetchJobs = useCallback(async () => {
    if (!employeeId) { setLoading(false); return; }
    try {
      const res = await fetch(
        apiUrl(`driver/jobs?employee_id=${encodeURIComponent(employeeId)}`),
        { headers: { 'ngrok-skip-browser-warning': '1' } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // #region agent log
      fetch('http://127.0.0.1:7869/ingest/bb893903-e6fa-49ce-bc0f-08c7f79bdc83',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'008708'},body:JSON.stringify({sessionId:'008708',location:'useDriverJobs.js:fetchJobs',message:'Client received driver jobs',data:{employeeId,jobCount:(data.jobs||[]).length,jobs:(data.jobs||[]).map(j=>({id:j.id,status:j.status,assigned_date:j.assigned_date}))},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      setJobs(data.jobs || []);
      setSlots(data.slots || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchJobs();
    if (refreshInterval > 0) {
      timerRef.current = setInterval(fetchJobs, refreshInterval);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchJobs, refreshInterval]);

  return { jobs, slots, loading, error, refresh: fetchJobs };
}
