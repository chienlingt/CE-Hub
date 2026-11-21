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
// Information > Item: products (names from order lines) and item types.
export const getItemRates = () => admin({ path: '/items' });
export const getPendingItemCount = () => admin({ path: '/items/pending' });
// item: { item_type_id?, points_per_item? }
export const updateItem = (id, item) => admin({ path: `/items/${encodeURIComponent(id)}`, method: 'PUT', body: item });
// ids omitted = accept every suggestion
export const acceptItemSuggestions = ids => admin({ path: '/items/accept-suggestions', method: 'POST', body: ids ? { ids } : {} });
export const createItemType = type => admin({ path: '/item-types', method: 'POST', body: type });
// type: any of { name, install_minutes, dismantle_minutes, requires_installer, default_points, keywords, active }
export const updateItemType = (id, type) => admin({ path: `/item-types/${encodeURIComponent(id)}`, method: 'PUT', body: type });

// Base delivery and fallback install time live in the scheduler settings
// (GET open, PUT admin only); Information > Item edits just these two.
async function schedulerConfig(method, body) {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/scheduler/config`, {
    method,
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1', ...adminSessionHeaders() },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fieldErrors = Object.values(data.errors || {}).join(' ');
    throw Object.assign(new Error(fieldErrors || data.error || `Request failed (${response.status})`), { status: response.status, errors: data.errors });
  }
  return data;
}
export const getServiceTimeSettings = async () => {
  const { config = {}, spec = {} } = await schedulerConfig('GET');
  return {
    base_delivery_minutes: config.base_delivery_minutes,
    fallback_install_minutes: config.fallback_install_minutes,
    ranges: { base_delivery_minutes: spec.base_delivery_minutes, fallback_install_minutes: spec.fallback_install_minutes },
  };
};
export const saveServiceTimeSettings = values => schedulerConfig('PUT', values);
export const getPerformanceRanking = filters => admin({ path: `/${query(filters)}` });
export const getEmployeePerformance = (employeeId, range) => admin({ path: `/employees/${encodeURIComponent(employeeId)}${query(range)}` });
export const setOrderExtra = (orderId, points) => admin({ path: `/orders/${encodeURIComponent(orderId)}/extra`, method: 'PUT', body: { points } });
export const getMyPerformance = range => request(`/me${query(range)}`, { headers: employeeSessionHeaders() });
