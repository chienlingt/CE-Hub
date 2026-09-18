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

function mapsConstructorsReady() {
  return typeof window.google?.maps?.Map === 'function' &&
    typeof window.google?.maps?.LatLngBounds === 'function';
}

async function ensureGoogleMapsReady() {
  if (mapsConstructorsReady()) return;
  if (typeof window.google?.maps?.importLibrary === 'function') {
    await window.google.maps.importLibrary('maps');
    await window.google.maps.importLibrary('geometry');
  }
  if (!mapsConstructorsReady()) {
    throw new Error('Google Maps loaded without the required Maps JavaScript API constructors');
  }
}

function loadGoogleMapsScript(apiKey) {
  if (mapsConstructorsReady()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = `__ceHubGoogleMapsReady_${Date.now()}`;
    const script = document.createElement('script');
    const finish = () => ensureGoogleMapsReady().then(resolve).catch(reject);
    window[callbackName] = () => {
      delete window[callbackName];
      finish();
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=geometry&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      delete window[callbackName];
      reject(new Error('Failed to load Google Maps JavaScript API'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * @returns {{ loaded: boolean, error: string|null }}
 */
export function useGoogleMapsScript() {
  const [loaded, setLoaded] = useState(mapsConstructorsReady());
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
