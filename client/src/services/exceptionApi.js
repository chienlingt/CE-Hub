// Count behind the red badge beside "Exceptions" (admin login required).
import { API_BASE_URL } from '../utils/apiBaseUrl';
import { adminSessionHeaders } from '../utils/adminSessionHeaders';

export async function getExceptionSummary() {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/exceptions/summary`, {
    headers: { 'ngrok-skip-browser-warning': '1', ...adminSessionHeaders() },
  });
  if (!response.ok) throw Object.assign(new Error(`Request failed (${response.status})`), { status: response.status });
  return response.json();
}
