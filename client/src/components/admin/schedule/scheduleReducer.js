// Schedule store. Pure reducer — this is the unit-testable artifact that
// justifies the refactor, and it survives into real development untouched.
//
// THE KEY DESIGN RULE: staged moves live in `draft`, never as a mutation of
// `entities`. Every selector reads through effectiveSlotId(), so adding real
// commit and per-order rollback later changes no selector and no component.
//
// SECOND RULE: the reducer never validates. validateAssignment is pure and is
// called by the board on drag-over and again before STAGE_MOVE. Keeping policy
// out of the reducer is what lets the same rules run server-side in Phase 4.

import { DEFAULT_SCHEDULE_CONFIG } from '../../../utils/schedule/gracePeriod';

export const initialScheduleState = {
  status: 'idle',          // idle | loading | ready | error
  error: null,
  source: 'mock',
  scenario: null,
  asOf: null,

  range: { startDateKey: '', endDateKey: '', dateKeys: [], workingDateKeys: [] },

  entities: {
    slots:     { byId: {}, allIds: [] },
    orders:    { byId: {}, allIds: [] },
    trucks:    { byId: {}, allIds: [] },
    teams:     { byId: {}, allIds: [] },
    employees: { byId: {}, allIds: [] },
    buildings: { byId: {}, allIds: [] },
    customers: { byId: {}, allIds: [] },
    products:  { byId: {}, allIds: [] },
  },

  config: { ...DEFAULT_SCHEDULE_CONFIG },

  draft: {
    moves: {},             // orderId -> { fromSlotId, toSlotId, toIndex }
    dirty: false,
    committing: false,
    lastResult: null,      // { applied: [], rejected: [] }
  },

  autoRun: null,           // { runId, scheduled, unscheduled, warnings, at }
};

export const ACTIONS = {
  LOAD_START:     'LOAD_START',
  LOAD_SUCCESS:   'LOAD_SUCCESS',
  LOAD_ERROR:     'LOAD_ERROR',
  MERGE_SNAPSHOT: 'MERGE_SNAPSHOT',
  SET_RANGE:      'SET_RANGE',
  STAGE_MOVE:     'STAGE_MOVE',
  UNSTAGE_MOVE:   'UNSTAGE_MOVE',
  CLEAR_DRAFT:    'CLEAR_DRAFT',
  COMMIT_START:   'COMMIT_START',
  COMMIT_RESULT:  'COMMIT_RESULT',
  PATCH_CONFIG:   'PATCH_CONFIG',
  SET_APPROVAL:   'SET_APPROVAL',
  APPLY_AUTO_RUN: 'APPLY_AUTO_RUN',
  ADD_SLOT:       'ADD_SLOT',
};

/**
 * Where an order actually sits, accounting for un-committed drags.
 * Everything that reads a slot assignment must go through this.
 */
export function effectiveSlotId(state, orderId) {
  const staged = state?.draft?.moves?.[orderId];
  if (staged) return staged.toSlotId ?? null;
  return state?.entities?.orders?.byId?.[orderId]?.slotId ?? null;
}

export function scheduleReducer(state, action) {
  switch (action.type) {
    case ACTIONS.LOAD_START:
      return { ...state, status: 'loading', error: null };

    case ACTIONS.LOAD_SUCCESS: {
      const { entities, range, scenario, asOf, source } = action.payload;
      return {
        ...state,
        status: 'ready',
        error: null,
        entities,
        range: range ?? state.range,
        scenario: scenario ?? null,
        asOf: asOf ?? null,
        source: source ?? state.source,
        // A fresh load is a clean slate; a background refresh is MERGE_SNAPSHOT.
        draft: { ...initialScheduleState.draft },
      };
    }

    case ACTIONS.LOAD_ERROR:
      return { ...state, status: 'error', error: action.payload?.message ?? 'Failed to load' };

    // A background poll must never clobber a dispatcher's half-finished drag,
    // so entities are replaced while draft.moves is preserved.
    case ACTIONS.MERGE_SNAPSHOT: {
      const { entities, asOf } = action.payload;
      return {
        ...state,
        status: 'ready',
        entities: entities ?? state.entities,
        asOf: asOf ?? state.asOf,
      };
    }

    case ACTIONS.SET_RANGE:
      return { ...state, range: action.payload };

    case ACTIONS.STAGE_MOVE: {
      const { orderId, toSlotId, toIndex = null } = action.payload;
      const order = state.entities.orders.byId[orderId];
      if (!order) return state;

      const fromSlotId = effectiveSlotId(state, orderId);
      const moves = { ...state.draft.moves };

      // Returning an order to where it already lives un-stages it rather than
      // leaving a no-op move in the draft.
      if ((toSlotId ?? null) === (order.slotId ?? null)) {
        delete moves[orderId];
      } else {
        moves[orderId] = { fromSlotId, toSlotId: toSlotId ?? null, toIndex };
      }

      return {
        ...state,
        draft: { ...state.draft, moves, dirty: Object.keys(moves).length > 0, lastResult: null },
      };
    }

    case ACTIONS.UNSTAGE_MOVE: {
      const moves = { ...state.draft.moves };
      delete moves[action.payload.orderId];
      return {
        ...state,
        draft: { ...state.draft, moves, dirty: Object.keys(moves).length > 0 },
      };
    }

    case ACTIONS.CLEAR_DRAFT:
      return { ...state, draft: { ...initialScheduleState.draft } };

    case ACTIONS.COMMIT_START:
      return { ...state, draft: { ...state.draft, committing: true, lastResult: null } };

    // Applied moves fold into entities and leave the draft; rejected ones STAY
    // staged, so the dispatcher can see and fix what the server refused.
    case ACTIONS.COMMIT_RESULT: {
      const { applied = [], rejected = [] } = action.payload ?? {};
      const byId = { ...state.entities.orders.byId };
      const moves = { ...state.draft.moves };

      for (const orderId of applied) {
        const move = moves[orderId];
        const order = byId[orderId];
        if (move && order) {
          byId[orderId] = {
            ...order,
            slotId: move.toSlotId,
            status: move.toSlotId
              ? (order.status === 'Pending' ? 'Scheduled' : order.status)
              : 'Pending',
            assignmentStatus: move.toSlotId ? 'assigned' : 'unassigned',
          };
        }
        delete moves[orderId];
      }

      return {
        ...state,
        entities: { ...state.entities, orders: { ...state.entities.orders, byId } },
        draft: {
          ...state.draft,
          moves,
          dirty: Object.keys(moves).length > 0,
          committing: false,
          lastResult: { applied, rejected },
        },
      };
    }

    case ACTIONS.PATCH_CONFIG:
      return { ...state, config: { ...state.config, ...action.payload } };

    case ACTIONS.SET_APPROVAL: {
      const { orderIds = [], assignmentStatus, rejectReason = null } = action.payload ?? {};
      const byId = { ...state.entities.orders.byId };
      for (const id of orderIds) {
        if (!byId[id]) continue;
        byId[id] = { ...byId[id], assignmentStatus, rejectReason };
        // A rejected DO leaves its slot and goes back to the tray with its reason.
        if (assignmentStatus === 'rejected') {
          byId[id] = { ...byId[id], slotId: null, status: 'Pending' };
        }
      }
      return { ...state, entities: { ...state.entities, orders: { ...state.entities.orders, byId } } };
    }

    // A slot the Board created for a lorry's first DO in a window.
    case ACTIONS.ADD_SLOT: {
      const slot = action.payload;
      if (!slot?.id || state.entities.slots.byId[slot.id]) return state;
      const { slots } = state.entities;
      return {
        ...state,
        entities: {
          ...state.entities,
          slots: { byId: { ...slots.byId, [slot.id]: slot }, allIds: [...slots.allIds, slot.id] },
        },
      };
    }

    case ACTIONS.APPLY_AUTO_RUN:
      return { ...state, autoRun: { ...action.payload, at: new Date().toISOString() } };

    default:
      return state;
  }
}

export default scheduleReducer;
