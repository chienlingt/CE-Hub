// Mock gateway. Disposable — this file and src/mocks/schedule/ are the only
// two things the demo throws away.
//
// It keeps a mutable in-memory copy so drags survive switching views, adds real
// latency so loading states are exercised rather than theoretical, and rejects
// occasionally so the error path is demoable.

import { buildMockSnapshot, DEFAULT_SCENARIO } from '../../mocks/schedule';
import { DEFAULT_SCHEDULE_CONFIG } from '../../utils/schedule/gracePeriod';

const LATENCY_MIN_MS = 180;
const LATENCY_MAX_MS = 480;

/** Deterministic-ish rejection: every 9th committed order, so it is reproducible. */
const REJECT_EVERY = 9;

const CONFIG_STORAGE_KEY = 'ce.schedule.config';

let state = null;        // { snapshot, scenario }
let commitCounter = 0;

const delay = () => new Promise(resolve => {
  const ms = LATENCY_MIN_MS + Math.random() * (LATENCY_MAX_MS - LATENCY_MIN_MS);
  setTimeout(resolve, ms);
});

function ensureState(scenario, anchorDateKey) {
  const wanted = scenario ?? DEFAULT_SCENARIO;
  if (!state || state.scenario !== wanted || state.anchorDateKey !== anchorDateKey) {
    state = {
      scenario: wanted,
      anchorDateKey,
      snapshot: buildMockSnapshot({ scenario: wanted, anchorDateKey }),
    };
  }
  return state;
}

function readStoredConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;   // private browsing, or blocked site data
  }
}

function writeStoredConfig(config) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Non-fatal: the demo just won't remember the setting across a reload.
  }
}

/** Shallow-clone the entity maps we mutate, so React sees new references. */
function cloneOrders(entities) {
  return {
    ...entities,
    orders: { ...entities.orders, byId: { ...entities.orders.byId } },
  };
}

export const mockScheduleGateway = {
  async loadSnapshot({ startDateKey, scenario } = {}) {
    await delay();
    const { snapshot } = ensureState(scenario, startDateKey);
    return {
      ...snapshot,
      // Fresh timestamp each load, so the "as of" indicator means something.
      asOf: new Date().toISOString(),
    };
  },

  async loadConfig() {
    await delay();
    return { ...DEFAULT_SCHEDULE_CONFIG, ...(readStoredConfig() ?? {}), configScope: 'local' };
  },

  async saveConfig(patch) {
    await delay();
    const next = { ...DEFAULT_SCHEDULE_CONFIG, ...(readStoredConfig() ?? {}), ...patch };
    writeStoredConfig(next);
    return { ...next, configScope: 'local' };
  },

  async commitMoves(moves = []) {
    await delay();
    if (!state) return { applied: [], rejected: [] };

    const applied = [];
    const rejected = [];
    let entities = cloneOrders(state.snapshot.entities);

    for (const move of moves) {
      commitCounter += 1;

      // A realistic server-side refusal, so the recovery path is demoable.
      if (commitCounter % REJECT_EVERY === 0) {
        rejected.push({
          orderId: move.orderId,
          code: 'TRUCK_UPGRADE_REQUIRED',
          message: 'Truck space not enough for this assignment.',
          recovery: { recommendedTone: 3 },
        });
        continue;
      }

      const order = entities.orders.byId[move.orderId];
      if (!order) {
        rejected.push({ orderId: move.orderId, code: 'NOT_FOUND', message: 'Order no longer exists.' });
        continue;
      }

      entities.orders.byId[move.orderId] = {
        ...order,
        slotId: move.toSlotId ?? null,
        status: move.toSlotId ? (order.status === 'Pending' ? 'Scheduled' : order.status) : 'Pending',
        assignmentStatus: move.toSlotId ? 'assigned' : 'unassigned',
      };
      applied.push(move.orderId);
    }

    state.snapshot = { ...state.snapshot, entities };
    return { applied, rejected };
  },

  async runAutoSchedule() {
    await delay();
    if (!state) return { runId: 'mock-run', scheduled: 0, unscheduled: 0, warnings: [] };

    const entities = cloneOrders(state.snapshot.entities);
    const slotIds = entities.slots.allIds;
    let scheduled = 0;

    // Place unassigned orders into the emptiest scheduled slots. Deliberately
    // naive: this stands in for the engine, it is not a second implementation
    // of it. B.1's real allocation stays on the server.
    const counts = {};
    for (const id of entities.orders.allIds) {
      const o = entities.orders.byId[id];
      if (o.slotId) counts[o.slotId] = (counts[o.slotId] ?? 0) + 1;
    }

    const openSlots = slotIds
      .filter(id => entities.slots.byId[id].status === 'scheduled')
      .sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0));

    for (const id of entities.orders.allIds) {
      const order = entities.orders.byId[id];
      if (order.slotId) continue;
      // Leave a remainder unscheduled: the proposal's point is that an
      // infeasible plan is never committed silently, so the panel needs content.
      if (scheduled >= Math.floor(openSlots.length * 0.4)) break;
      const target = openSlots[scheduled % openSlots.length];
      entities.orders.byId[id] = {
        ...order, slotId: target, status: 'Scheduled', assignmentStatus: 'assigned',
      };
      scheduled += 1;
    }

    const unscheduled = entities.orders.allIds
      .filter(id => !entities.orders.byId[id].slotId).length;

    state.snapshot = { ...state.snapshot, entities };
    return {
      runId: `mock-${Date.now()}`,
      scheduled,
      unscheduled,
      warnings: unscheduled
        ? [`${unscheduled} order(s) could not be placed — see Exceptions for the reason.`]
        : [],
    };
  },

  async createSlot({ dateKey, start, end, truckId, teamId = null }) {
    await delay();
    if (!state) throw new Error('Nothing loaded.');
    const slot = {
      id: `s-${dateKey}-${start}-${truckId}-new`,
      dateKey, start, end,
      status: 'scheduled', availableFlag: true,
      truckId, teamId, departedAt: null,
      routePlan: null, routePolyline: null, routeDistanceM: null, routeDurationS: null,
      routeVersion: 0, routeLastReason: null, routeComputedAt: null,
    };
    const { slots } = state.snapshot.entities;
    state.snapshot = {
      ...state.snapshot,
      entities: {
        ...state.snapshot.entities,
        slots: { byId: { ...slots.byId, [slot.id]: slot }, allIds: [...slots.allIds, slot.id] },
      },
    };
    return slot;
  },

  async approveOrders(orderIds = []) {
    await delay();
    return setAssignmentStatus(orderIds, 'approved');
  },

  async rejectOrders(orderIds = [], reason = '') {
    await delay();
    return setAssignmentStatus(orderIds, 'rejected', reason);
  },

  /** Test/demo helper — forget the mutable copy so the scenario rebuilds. */
  __reset() {
    state = null;
    commitCounter = 0;
  },
};

function setAssignmentStatus(orderIds, assignmentStatus, rejectReason = null) {
  if (!state) return { applied: [], rejected: [] };
  const entities = cloneOrders(state.snapshot.entities);
  const applied = [];
  const rejected = [];

  for (const id of orderIds) {
    const order = entities.orders.byId[id];
    if (!order) {
      rejected.push({ orderId: id, code: 'NOT_FOUND', message: 'Order no longer exists.' });
      continue;
    }
    // Mirrors the real endpoint: server/routes/orders.js:1641 refuses to
    // approve an order that has no timeslot assigned yet.
    if (assignmentStatus === 'approved' && !order.slotId) {
      rejected.push({
        orderId: id, code: 'NO_TIMESLOT',
        message: 'Cannot approve — order has no timeslot assigned yet.',
      });
      continue;
    }
    entities.orders.byId[id] = assignmentStatus === 'rejected'
      // Rejection returns the DO to the unassigned pool, reason attached.
      ? { ...order, assignmentStatus, rejectReason, slotId: null, status: 'Pending' }
      : { ...order, assignmentStatus, rejectReason };
    applied.push(id);
  }

  state.snapshot = { ...state.snapshot, entities };
  return { applied, rejected };
}

export default mockScheduleGateway;
