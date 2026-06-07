/**
 * Resolve API base URL for both desktop and mobile dev.
 * When .env points at localhost but the app is opened via LAN IP (e.g. phone),
 * use the current page host so requests reach the dev machine.
 */
export function getApiBaseUrl() {
  const envUrl = process.env.REACT_APP_API_BASE_URL;

  if (typeof window === 'undefined') {
    return envUrl || '';
  }

  const runtimeBase = window.location.origin.replace(/:\d+$/, ':4000');

  if (!envUrl) {
    return runtimeBase;
  }

  try {
    const envHost = new URL(envUrl).hostname;
    const pageHost = window.location.hostname;
    const isLocalEnv = envHost === 'localhost' || envHost === '127.0.0.1';
    const isLocalPage = pageHost === 'localhost' || pageHost === '127.0.0.1';
    if (isLocalEnv && !isLocalPage) {
      return runtimeBase;
    }
  } catch {
    // fall through to envUrl
  }

  return envUrl;
}

export const API_BASE_URL = getApiBaseUrl();
export default API_BASE_URL;
