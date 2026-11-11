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
import { adminSessionHeaders } from '../../utils/adminSessionHeaders';
import { API_BASE_URL } from '../../utils/apiBaseUrl';
import { assertGateway } from './scheduleGateway';
import { normalizeSnapshot, normalizeSlot } from '../../utils/schedule/scheduleNormalize';
import { buildWorkingRange } from '../../utils/schedule/weekRange';
import {
  configFromServer, patchToServer, fieldErrorsFromServer, blockoffToServer, blockoffFromServer,
} from '../../utils/schedule/schedulerConfigMapping';
import { todayLocalDateKey } from '../../utils/dateKey';

// Scheduler settings live on the server (scheduler_config + resource_blockoffs).
// This key held the old browser-only copy; it is deleted on first load.
const LEGACY_LOCAL_CONFIG_KEY = 'ce.schedule.config';

/**
 * Raw request that does NOT throw on a non-2xx, because the error BODY carries
 * the information we need (`code`, `recommended_tone`) and apiFetch discards it.
 */
async function rawRequest(path, options = {}) {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`;
  const headers = {
    ...adminSessionHeaders(),
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

function dropLegacyLocalConfig() {
  try { localStorage.removeItem(LEGACY_LOCAL_CONFIG_KEY); } catch { /* storage blocked */ }
}

/** Error carrying the server's message, status and per-field errors (client names). */
function requestError(status, data, fallback) {
  const err = new Error(data?.error || data?.message || fallback);
  err.status = status;
  err.code = data?.code ?? null;
  if (data?.errors) err.fieldErrors = fieldErrorsFromServer(data.errors);
  return err;
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
    dropLegacyLocalConfig();
    const [config, blockoffs] = await Promise.all([
      rawRequest('scheduler/config'),
      // Past block-offs do not affect planning, so only today onwards.
      rawRequest(`scheduler/blockoffs?from=${todayLocalDateKey()}`),
    ]);
    if (!config.ok) throw requestError(config.status, config.data, 'Could not load scheduler settings.');
    if (!blockoffs.ok) console.warn('[liveScheduleGateway] block-offs failed:', blockoffs.data?.error);
    return configFromServer(config.data, blockoffs.ok ? blockoffs.data?.blockoffs : []);
  },

  /** Saves a partial patch; rejects with `fieldErrors` on a 400. */
  async saveConfig(patch = {}) {
    const body = patchToServer(patch);
    if (Object.keys(body).length) {
      const { ok, status, data } = await rawRequest('scheduler/config', { method: 'PUT', body });
      if (!ok) throw requestError(status, data, 'Could not save scheduler settings.');
      const fresh = await liveScheduleGateway.loadConfig();
      return { ...fresh, saveWarnings: Array.isArray(data?.warnings) ? data.warnings : [] };
    }
    // Named reference rather than `this`, so the method survives destructuring.
    return liveScheduleGateway.loadConfig();
  },

  async addBlockoff(blockoff) {
    const { ok, status, data } = await rawRequest('scheduler/blockoffs', {
      method: 'POST', body: blockoffToServer(blockoff),
    });
    if (!ok) throw requestError(status, data, 'Could not save the block-off.');
    return blockoffFromServer(data.blockoff);
  },

  async removeBlockoff(id) {
    const { ok, status, data } = await rawRequest(`scheduler/blockoffs/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!ok) throw requestError(status, data, 'Could not remove the block-off.');
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
