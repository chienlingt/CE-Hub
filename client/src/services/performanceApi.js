// FR-10 performance and incentive API. Admin calls send the admin session
// token; the employee's own view sends the employee session token.
import { API_BASE_URL } from '../utils/apiBaseUrl';
import { adminSessionHeaders } from '../utils/adminSessionHeaders';

function employeeSessionHeaders() {
  try {
    const token = JSON.parse(sessionStorage.getItem('employeeSession'))?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

async function request(path, { method = 'GET', body, headers } = {}) {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/performance${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1', ...headers },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status})`), { status: response.status, code: data.code });
  return data;
}

const query = params => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => { if (value) search.set(key, value); });
  const text = search.toString();
  return text ? `?${text}` : '';
};

const admin = ({ path, ...options }) => request(path, { ...options, headers: adminSessionHeaders() });

export const getIncentiveRules = () => admin({ path: '/rules' });
export const saveIncentiveRule = rule => admin({ path: '/rules', method: 'POST', body: rule });
export const getItemRates = () => admin({ path: '/items' });
export const getPendingItemCount = () => admin({ path: '/items/pending' });
export const createItem = item => admin({ path: '/items', method: 'POST', body: item });
export const updateItem = (id, item) => admin({ path: `/items/${encodeURIComponent(id)}`, method: 'PUT', body: item });
export const deleteItem = id => admin({ path: `/items/${encodeURIComponent(id)}`, method: 'DELETE' });
export const getPerformanceRanking = filters => admin({ path: `/${query(filters)}` });
export const getEmployeePerformance = (employeeId, range) => admin({ path: `/employees/${encodeURIComponent(employeeId)}${query(range)}` });
export const setOrderExtra = (orderId, points) => admin({ path: `/orders/${encodeURIComponent(orderId)}/extra`, method: 'PUT', body: { points } });
export const getMyPerformance = range => request(`/me${query(range)}`, { headers: employeeSessionHeaders() });
