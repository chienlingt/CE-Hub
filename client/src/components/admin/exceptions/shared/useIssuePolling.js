// Fetch-and-poll hook shared by the Exceptions list views.
// `loading` is true only until the first fetch settles, so background polls
// never flash a spinner. `setData` is exposed for optimistic row patches after
// PATCH calls. `fetchFn` must be stable (wrap it in useCallback) and should
// return the parsed list; a thrown error sets `error`.
import { useEffect, useRef, useState } from 'react';

export default function useIssuePolling(fetchFn, { intervalMs = 15000 } = {}) {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const firstLoadDone = useRef(false);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const result = await fetchFn();
        if (!active) return;
        setData(Array.isArray(result) ? result : []);
        setError(null);
      } catch (err) {
        if (active) setError(err);
      } finally {
        if (active && !firstLoadDone.current) {
          firstLoadDone.current = true;
          setLoading(false);
        }
      }
    };

    run();
    const timer = setInterval(run, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchFn, intervalMs]);

  const refetch = fetchFn ? async () => {
    try {
      const result = await fetchFn();
      setData(Array.isArray(result) ? result : []);
      setError(null);
    } catch (err) {
      setError(err);
    }
  } : async () => {};

  return { data, setData, loading, error, refetch };
}
