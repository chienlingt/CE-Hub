// Fetches and polls GET /api/time-slots/:id/status every 30s while a trip id is set.
// Detects when the trip leaves out_for_delivery (ended) and fires onTripEnded callback.

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../utils/apiBaseUrl';

const POLL_INTERVAL_MS = 30_000;

/**
 * @param {string|null} timeSlotId
 * @param {{ onTripEnded?: () => void }} [options]
 * @returns {{ trip: object|null, loading: boolean, error: string|null, refresh: () => void }}
 */
export function useTripStatus(timeSlotId, { onTripEnded } = {}) {
  const [trip, setTrip]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const timerRef              = useRef(null);
  const onTripEndedRef        = useRef(onTripEnded);
  onTripEndedRef.current      = onTripEnded;

  const fetchStatus = useCallback(async () => {
    if (!timeSlotId) return;
    setLoading(prev => (trip === null ? true : prev));
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-slots/${timeSlotId}/status`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.status === 404) {
        // Slot gone — treat as ended
        onTripEndedRef.current?.();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTrip(data);
      setError(null);
      // Auto-close if trip is no longer active
      if (data.slot_status !== 'out_for_delivery') {
        onTripEndedRef.current?.();
      }
    } catch (err) {
      console.error('[useTripStatus] fetch failed:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeSlotId]);

  useEffect(() => {
    if (!timeSlotId) {
      setTrip(null);
      setError(null);
      clearInterval(timerRef.current);
      return;
    }
    setLoading(true);
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [timeSlotId, fetchStatus]);

  return { trip, loading, error, refresh: fetchStatus };
}
