// Live gateway — the same seven methods as the mock, over the real REST API.
//
// Satisfies the identical contract, so flipping ?data=live changes no
// component, no selector and no rule module. That is what the seam buys.
//
// Facts below were established by reading the server, not assumed; each is the
// kind of thing that otherwise costs a day:
//   - order reassignment is PATCH /api/orders/:id, not PUT (Schedule.js:521)
//   - its 409 carries { code: 'TRUCK_UPGRADE_REQUIRED', recommended_tone }
//   - GET /api/time-slots has no date filter, so the range is applied here
//   - POST /api/orders/:id/approve exists and writes back to Odoo, but refuses
//     an order with no timeslot (routes/orders.js:1641)
//   - there is NO reject endpoint at all

import { apiFetch } from '../informationService';
import { API_BASE_URL } from '../../utils/apiBaseUrl';
import { assertGateway } from './scheduleGateway';
import { normalizeSnapshot, normalizeSlot } from '../../utils/schedule/scheduleNormalize';
import { buildWorkingRange } from '../../utils/schedule/weekRange';
import { DEFAULT_SCHEDULE_CONFIG } from '../../utils/schedule/gracePeriod';

// Tuning knobs with no server home yet. The scheduler_config migration gives
// them columns; until then they live here. Deliberately NOT /api/settings:
// routes/settings.js:56 does `if (!value)`, so a 0-minute grace period cannot
// be saved there, and GET /:key 404s on a missing key.
const LOCAL_CONFIG_KEY = 'ce.schedule.config';

const LOCAL_ONLY_KEYS = [
  'graceMinutes', 'bufferMinutes', 'loadMinutes', 'unloadMinutes',
  'maxDOsPerSlot', 'planningCutoff', 'defaultLegMinutes',
  'trafficMatrix', 'defaultMultiplier', 'fleetOverrides', 'teamOverrides',
];

/**
 * Raw request that does NOT throw on a non-2xx, because the error BODY carries
 * the information we need (`code`, `recommended_tone`) and apiFetch discards it.
 */
async function rawRequest(path, options = {}) {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`;
  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
    ...(options.headers ?? {}),
  };
  try {
    const res = await fetch(url, {
      ...options,
      headers,
      body: options.body && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err?.message ?? String(err) } };
  }
}

function readLocalConfig() {
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalConfig(patch) {
  try {
    const next = { ...readLocalConfig(), ...patch };
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(next));
    return next;
  } catch {
    return readLocalConfig();
  }
}

const unwrap = (result) => (Array.isArray(result) ? result : (result?.data ?? []));

/** A failed collection fetch degrades to empty rather than blanking the screen. */
function settled(results, index, label) {
  const entry = results[index];
  if (entry.status === 'fulfilled') return unwrap(entry.value);
  console.warn(`[liveScheduleGateway] ${label} failed:`, entry.reason?.message ?? entry.reason);
  return [];
}

export const liveScheduleGateway = {
  async loadSnapshot({ startDateKey } = {}) {
    // The provider passes the Monday of the week it wants; rebuilding the range
    // here keeps dateKeys/workingDateKeys consistent with the mock path.
    const range = buildWorkingRange(startDateKey, { days: 6, skipWeekend: true });

    // allSettled, not all: one dead collection should degrade the board, not
    // blank it. include_products=true embeds order_products, which saves a
    // separate round trip — normalizeSnapshot reads either shape.
    const results = await Promise.allSettled([
      apiFetch('time-slots'),
      apiFetch('orders?include_products=true'),
      apiFetch('trucks'),
      apiFetch('teams'),
      apiFetch('employees'),
      apiFetch('assignments'),
      apiFetch('buildings'),
      apiFetch('customers'),
      apiFetch('products'),
    ]);

    const allSlots = settled(results, 0, 'time-slots');
    const orders = settled(results, 1, 'orders');

    // GET /api/time-slots returns every slot ever created — there is no
    // ?from=&to= endpoint yet — so the range is applied client-side. Fine at
    // current volume; revisit when slot count grows.
    const { startDateKey: from, endDateKey: to } = range;
    const slots = allSlots.filter((slot) => {
      const date = String(slot?.date ?? '').slice(0, 10);
      if (!date) return false;
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    });

    return {
      entities: normalizeSnapshot({
        slots,
        orders,
        trucks: settled(results, 2, 'trucks'),
        teams: settled(results, 3, 'teams'),
        employees: settled(results, 4, 'employees'),
        employeeTeamAssignments: settled(results, 5, 'assignments'),
        buildings: settled(results, 6, 'buildings'),
        customers: settled(results, 7, 'customers'),
        products: settled(results, 8, 'products'),
      }),
      range,
      scenario: null,
      asOf: new Date().toISOString(),
    };
  },

  async loadConfig() {
    const local = readLocalConfig();
    const { ok, data } = await rawRequest('scheduler/config');
    const server = ok && data?.config ? data.config : {};

    return {
      ...DEFAULT_SCHEDULE_CONFIG,
      ...local,
      warehouse: {
        address: server.warehouse_address ?? '',
        postal: server.warehouse_postal ?? '',
        // The columns exist and the optimisers read them, but GET
        // /api/scheduler/config does not return them.
        lat: null,
        lng: null,
      },
      cronExpression: server.cron_expression ?? '',
      autoEnabled: Boolean(server.enabled),
      lastRunAt: server.last_run_at ?? null,
      // Partly local until the scheduler_config migration lands, and the UI
      // says so rather than implying everything is persisted.
      configScope: 'local',
    };
  },

  async saveConfig(patch = {}) {
    const serverPatch = {};
    if (patch.warehouse?.address !== undefined) serverPatch.warehouse_address = patch.warehouse.address;
    if (patch.warehouse?.postal !== undefined) serverPatch.warehouse_postal = patch.warehouse.postal;
    if (patch.cronExpression !== undefined) serverPatch.cron_expression = patch.cronExpression;
    if (patch.autoEnabled !== undefined) serverPatch.enabled = patch.autoEnabled;

    if (Object.keys(serverPatch).length) {
      await rawRequest('scheduler/config', { method: 'PUT', body: serverPatch });
    }

    const localPatch = {};
    for (const key of LOCAL_ONLY_KEYS) {
      if (patch[key] !== undefined) localPatch[key] = patch[key];
    }
    if (Object.keys(localPatch).length) writeLocalConfig(localPatch);

    // Named reference rather than `this`, so the method survives destructuring.
    return liveScheduleGateway.loadConfig();
  },

  async commitMoves(moves = []) {
    const applied = [];
    const rejected = [];

    // Sequential, not parallel: each PATCH may reassign a slot's truck as a
    // side effect (ensureTimeslotAssignments in routes/orders.js), so
    // concurrent writes to the same slot would race.
    for (const move of moves) {
      const body = { time_slot_id: move.toSlotId ?? null };
      const { ok, data } = await rawRequest(`orders/${encodeURIComponent(move.orderId)}`, {
        method: 'PATCH',
        body,
      });

      if (ok && data?.success !== false) {
        applied.push(move.orderId);
        continue;
      }

      // The capacity-upgrade flow Schedule.js:536 handled with window.confirm.
      // Surfaced as a structured rejection so the UI can offer the upgrade in a
      // proper dialog and keep the move staged.
      if (data?.code === 'TRUCK_UPGRADE_REQUIRED') {
        rejected.push({
          orderId: move.orderId,
          code: 'TRUCK_UPGRADE_REQUIRED',
          message: data.error || 'Truck space not enough for this assignment.',
          recovery: { recommendedTone: data.recommended_tone ?? 3 },
        });
      } else {
        rejected.push({
          orderId: move.orderId,
          code: data?.code ?? 'COMMIT_FAILED',
          message: data?.error || 'The server refused this assignment.',
        });
      }
    }

    return { applied, rejected };
  },

  async runAutoSchedule() {
    const { ok, data } = await rawRequest('scheduler/run', { method: 'POST' });
    if (!ok) {
      throw new Error(data?.error || 'The scheduler run failed.');
    }
    const results = data?.results ?? {};
    return {
      runId: `run-${Date.now()}`,
      scheduled: results.scheduled ?? 0,
      unscheduled: results.unscheduled ?? 0,
      warnings: Array.isArray(results.warnings) ? results.warnings : [],
    };
  },

  // POST /api/time-slots passes its body straight to prisma.time_slots.create.
  async createSlot({ dateKey, start, end, truckId, teamId = null }) {
    const { ok, data } = await rawRequest('time-slots', {
      method: 'POST',
      body: {
        date: dateKey,
        time_window_start: start,
        time_window_end: end,
        truck_id: truckId,
        delivery_team_id: teamId,
        available_flag: true,
        slot_status: 'scheduled',
      },
    });
    if (!ok) throw new Error(data?.details || data?.error || 'Could not create the slot.');
    return normalizeSlot(data);
  },

  // Needs an engine endpoint that does not exist yet; fail specifically rather
  // than recommend from a partial client-side view of the live schedule.
  async recommendSlots() {
    throw new Error('Slot recommendation is not available on live data yet — it needs an engine endpoint.');
  },

  async approveOrders(orderIds = []) {
    const applied = [];
    const rejected = [];

    for (const orderId of orderIds) {
      const { ok, data } = await rawRequest(`orders/${encodeURIComponent(orderId)}/approve`, {
        method: 'POST',
      });
      if (ok) {
        applied.push(orderId);
      } else {
        rejected.push({
          orderId,
          code: data?.code ?? 'APPROVE_FAILED',
          // Pass the server's own words through — it refuses an order with no
          // timeslot, and that reason is more useful than a generic failure.
          message: data?.error || 'Approval failed.',
        });
      }
    }

    return { applied, rejected };
  },

  async unapproveOrders(orderIds = []) {
    const applied = [];
    const rejected = [];

    for (const orderId of orderIds) {
      const { ok, data } = await rawRequest(`orders/${encodeURIComponent(orderId)}/unapprove`, {
        method: 'POST',
      });
      if (ok) {
        applied.push(orderId);
      } else {
        rejected.push({
          orderId,
          code: data?.code ?? 'UNAPPROVE_FAILED',
          message: data?.error || 'Undo approval failed.',
        });
      }
    }

    return { applied, rejected };
  },

  // Rejecting takes the order off its slot and back to Pending; for an Odoo DO
  // it also tells Odoo the requested appointment was rejected (FRD INT-04).
  async rejectOrders(orderIds = [], reason = '') {
    const applied = [];
    const rejected = [];

    for (const orderId of orderIds) {
      const { ok, data } = await rawRequest(`orders/${encodeURIComponent(orderId)}/reject-appointment`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      if (ok) {
        applied.push(orderId);
      } else {
        rejected.push({
          orderId,
          code: data?.code ?? 'REJECT_FAILED',
          message: data?.error || 'Rejection failed.',
        });
      }
    }

    return { applied, rejected };
  },
};

assertGateway(liveScheduleGateway, 'liveScheduleGateway');

export default liveScheduleGateway;
