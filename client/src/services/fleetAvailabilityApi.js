// B.4 Fleet Availability API (/api/fleet-availability). Reads are open; writes,
// the impact preview and the affected list send the admin session token.
import { API_BASE_URL } from '../utils/apiBaseUrl';
import { adminSessionHeaders } from '../utils/adminSessionHeaders';

async function request(path, { method = 'GET', body, admin = false } = {}) {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/fleet-availability${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
      ...(admin ? adminSessionHeaders() : {}),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fieldErrors = data.errors ? Object.values(data.errors) : [];
    throw Object.assign(new Error(fieldErrors[0] || data.error || `Request failed (${response.status})`), {
      status: response.status, code: data.code, errors: data.errors,
    });
  }
  return data;
}

// ------------------------------------------------------------------ mapping

export const truckFromServer = t => ({ id: t.id, plate: t.plate_no, tone: t.tone ?? null, toneKey: t.tone_key });

export const teamFromServer = t => ({
  id: t.id,
  name: t.name,
  kind: t.kind,
  availableFlag: t.available_flag !== false,
  truck: t.truck ? { id: t.truck.id, plate: t.truck.plate_no } : null,
  members: (t.members ?? []).map(m => ({ id: m.id, name: m.name, role: m.role })),
});

export const rowFromServer = r => ({
  id: r.id,
  groupId: r.group_id,
  resourceType: r.resource_type,
  resourceId: r.resource_id ?? null,
  scopeValue: r.scope_value ?? null,
  sessions: r.sessions ?? [],
  startDate: String(r.start_date ?? '').slice(0, 10),
  endDate: String(r.end_date ?? '').slice(0, 10),
  reason: r.reason,
  note: r.note ?? null,
});

export const groupFromServer = g => ({
  groupId: g.group_id,
  startDate: g.start_date,
  endDate: g.end_date,
  sessions: g.sessions ?? [],
  reason: g.reason,
  note: g.note ?? null,
  createdBy: g.created_by ?? null,
  fleet: Boolean(g.fleet),
  status: g.status,
  targets: (g.targets ?? []).map(t => ({
    id: t.id, resourceType: t.resource_type, resourceId: t.resource_id ?? null, scopeValue: t.scope_value ?? null,
  })),
});

export const bookingFromServer = b => ({
  kind: b.kind,
  orderId: b.order_id ?? null,
  orderRef: b.order_ref,
  date: b.date,
  session: b.session,
  truckId: b.truck_id ?? null,
  teamId: b.team_id ?? null,
  area: b.area ?? null,
  blockedBy: b.blocked_by ? rowFromServer(b.blocked_by) : null,
});

/** Client selection → POST body. */
export const selectionToServer = s => ({
  fleet: Boolean(s.fleet),
  truck_types: s.truckTypes ?? [],
  trucks: s.trucks ?? [],
  teams: s.teams ?? [],
  start_date: s.startDate,
  end_date: s.endDate,
  sessions: s.sessions ?? [],
  reason: s.reason,
  note: s.note || null,
});

// ------------------------------------------------------------------ calls

export async function getResources() {
  const data = await request('/resources');
  return { today: data.today, trucks: (data.trucks ?? []).map(truckFromServer), teams: (data.teams ?? []).map(teamFromServer) };
}

export async function getBlockoffs({ from, to } = {}) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const data = await request(`/blockoffs${q.toString() ? `?${q}` : ''}`);
  return { today: data.today, rows: (data.rows ?? []).map(rowFromServer), groups: (data.groups ?? []).map(groupFromServer) };
}

export async function getBookings({ from, to }) {
  const data = await request(`/bookings?from=${from}&to=${to}`);
  return (data.bookings ?? []).map(bookingFromServer);
}

export async function previewBlockoff(selection) {
  const data = await request('/blockoffs/preview', { method: 'POST', body: selectionToServer(selection), admin: true });
  return (data.affected ?? []).map(bookingFromServer);
}

export async function createBlockoff(selection) {
  const data = await request('/blockoffs', { method: 'POST', body: selectionToServer(selection), admin: true });
  return { group: groupFromServer(data.group), affectedCount: data.affected_count ?? 0 };
}

export const deleteBlockoffGroup = groupId =>
  request(`/blockoffs/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE', admin: true });

export const endBlockoffGroup = groupId =>
  request(`/blockoffs/groups/${encodeURIComponent(groupId)}/end`, { method: 'POST', admin: true });

export const removeBlockoffTarget = id =>
  request(`/blockoffs/${encodeURIComponent(id)}`, { method: 'DELETE', admin: true });

export async function getAffected() {
  const data = await request('/affected', { admin: true });
  return (data.affected ?? []).map(bookingFromServer);
}
