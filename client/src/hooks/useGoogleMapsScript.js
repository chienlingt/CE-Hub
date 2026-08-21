// client/src/hooks/useGoogleMapsScript.js
// Lightweight Google Maps JavaScript API script loader — no @react-google-maps/api
// dependency, just a single <script> tag loaded once and reused across the app.
//
// Requires REACT_APP_GOOGLE_MAPS_BROWSER_KEY in client/.env. This key is
// meant to be public (it's embedded in the page source) — restrict it by
// HTTP referrer in Google Cloud Console, and never reuse the server-side
// key (GOOGLE_MAPS_SERVER_KEY) here.

import { useEffect, useState } from 'react';

let loadPromise = null;

function loadGoogleMapsScript(apiKey) {
  if (window.google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * @returns {{ loaded: boolean, error: string|null }}
 */
export function useGoogleMapsScript() {
  const [loaded, setLoaded] = useState(!!window.google?.maps);
  const [error, setError]   = useState(null);

  useEffect(() => {
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_BROWSER_KEY;
    if (!apiKey) {
      setError('REACT_APP_GOOGLE_MAPS_BROWSER_KEY is not set in client/.env');
      return;
    }
    if (loaded) return;

    loadGoogleMapsScript(apiKey)
      .then(() => setLoaded(true))
      .catch(err => setError(err.message));
  }, [loaded]);

  return { loaded, error };
}
