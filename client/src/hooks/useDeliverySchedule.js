// Poll the delivery-schedule aggregate for one date/team.
// Modeled on useActiveTrips. Stale data is kept on fetch errors so a server
// blip doesn't blank the page mid-shift. setSlots is exposed so ScannerSection
// item updates can be merged in without waiting for the next poll.
import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../utils/apiBaseUrl';

const POLL_INTERVAL_MS = 30_000;

export function useDeliverySchedule({ date, teamId = 'all', employeeId } = {}) {
  const [teams, setTeams] = useState([]);
  const [assignedTeamIds, setAssignedTeamIds] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef = useRef(null);

  const fetchSchedule = useCallback(async () => {
    try {
      const params = new URLSearchParams({ date: date || 'today' });
      if (teamId && teamId !== 'all') params.set('team_id', teamId);
      if (employeeId) params.set('employee_id', employeeId);

      const res = await fetch(`${API_BASE_URL}/api/time-slots/schedule?${params}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setTeams(Array.isArray(data.teams) ? data.teams : []);
      setAssignedTeamIds(Array.isArray(data.assigned_team_ids) ? data.assigned_team_ids : []);
      setSlots(Array.isArray(data.slots) ? data.slots : []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('[useDeliverySchedule] fetch failed:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date, teamId, employeeId]);

  useEffect(() => {
    setLoading(true);
    fetchSchedule();
    timerRef.current = setInterval(fetchSchedule, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchSchedule]);

  return { teams, assignedTeamIds, slots, setSlots, loading, error, lastUpdated, refresh: fetchSchedule };
}
