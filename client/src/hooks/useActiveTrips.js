// Polls GET /api/time-slots/active every 30s.
// Shared by ActiveTripsPanel (Overview teaser) and LiveDeliveries page.

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../utils/apiBaseUrl';

const POLL_INTERVAL_MS = 30_000;

/**
 * @returns {{ trips: Array, loading: boolean, error: string|null, lastUpdated: Date|null, refresh: () => void }}
 */
export function useActiveTrips() {
  const [trips, setTrips]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef                    = useRef(null);

  const fetchTrips = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-slots/active`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTrips(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('[useActiveTrips] fetch failed:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips();
    timerRef.current = setInterval(fetchTrips, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchTrips]);

  return { trips, loading, error, lastUpdated, refresh: fetchTrips };
}
