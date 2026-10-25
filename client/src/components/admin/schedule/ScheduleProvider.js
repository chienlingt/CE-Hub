// The ONLY file in this feature permitted to import from services/schedule/.
// Guard that in review: it is what keeps the mock/live swap free.
//
// Three contexts, deliberately:
//   State   — the store. Changes on every data change.
//   Actions — stable dispatchers. Buttons and drag handles subscribe here and
//             so never re-render when data changes.
//   Drag    — the in-flight drag, written on every pointer move. Isolated so a
//             drag does not re-render ~200 order cards.

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { getScheduleGateway } from '../../../services/schedule';
import { scheduleReducer, initialScheduleState, ACTIONS } from './scheduleReducer';
import { buildWorkingRange, startOfWorkWeek } from '../../../utils/schedule/weekRange';
import { todayLocalDateKey } from '../../../utils/dateKey';

const ScheduleStateContext = createContext(null);
const ScheduleActionsContext = createContext(null);
const DragContext = createContext(null);

export function useScheduleState() {
  const ctx = useContext(ScheduleStateContext);
  if (!ctx) throw new Error('useScheduleState must be used inside <ScheduleProvider>');
  return ctx;
}

export function useScheduleActions() {
  const ctx = useContext(ScheduleActionsContext);
  if (!ctx) throw new Error('useScheduleActions must be used inside <ScheduleProvider>');
  return ctx;
}

export function useDragState() {
  return useContext(DragContext) ?? { activeId: null, overId: null, verdict: null };
}

export function ScheduleProvider({ children, anchorDateKey = null }) {
  const [searchParams] = useSearchParams();
  const [state, dispatch] = useReducer(scheduleReducer, initialScheduleState);
  const [drag, setDrag] = useState({ activeId: null, overId: null, verdict: null });

  const scenario = searchParams.get('scenario') ?? null;
  // Anchored on the Monday, so stepping a day at a time within the week does
  // not reload it (and does not throw away a drag in progress).
  const requested = anchorDateKey ?? searchParams.get('date') ?? todayLocalDateKey();
  const anchor = startOfWorkWeek(requested) || requested;

  // Resolved per render but stable in practice; the gateway modules are singletons.
  const { gateway, source, blocked } = useMemo(
    () => getScheduleGateway(searchParams),
    [searchParams],
  );

  // A drag or an uncommitted draft must suppress background refreshes, or a
  // poll will clobber half-finished work. Held in a ref so the loader closure
  // always sees the current value without re-subscribing.
  const busyRef = useRef(false);
  busyRef.current = Boolean(drag.activeId) || state.draft.dirty || state.draft.committing;

  const load = useCallback(async ({ merge = false } = {}) => {
    // Seven days, Monday to Sunday: weekends are delivery days like any other.
    const range = buildWorkingRange(anchor, { days: 7, skipWeekend: false });
    if (!merge) dispatch({ type: ACTIONS.LOAD_START });
    try {
      const snapshot = await gateway.loadSnapshot({
        startDateKey: range.startDateKey,
        endDateKey: range.endDateKey,
        scenario,
      });
      dispatch({
        type: merge ? ACTIONS.MERGE_SNAPSHOT : ACTIONS.LOAD_SUCCESS,
        payload: { ...snapshot, range: snapshot.range ?? range, source },
      });
    } catch (err) {
      dispatch({ type: ACTIONS.LOAD_ERROR, payload: { message: err?.message ?? String(err) } });
    }
  }, [gateway, anchor, scenario, source]);

  useEffect(() => { load(); }, [load]);

  // Config lives outside the snapshot so changing a grace period doesn't reload
  // the week.
  useEffect(() => {
    let mounted = true;
    gateway.loadConfig()
      .then(config => { if (mounted) dispatch({ type: ACTIONS.PATCH_CONFIG, payload: config }); })
      .catch(() => { /* defaults already in the reducer */ });
    return () => { mounted = false; };
  }, [gateway]);

  const actions = useMemo(() => ({
    refresh: () => load({ merge: true }),
    reload: () => load(),

    /** Does NOT validate — the caller runs validateAssignment first. */
    stageMove: (orderId, toSlotId, toIndex = null) =>
      dispatch({ type: ACTIONS.STAGE_MOVE, payload: { orderId, toSlotId, toIndex } }),

    unstageMove: (orderId) => dispatch({ type: ACTIONS.UNSTAGE_MOVE, payload: { orderId } }),
    clearDraft: () => dispatch({ type: ACTIONS.CLEAR_DRAFT }),

    commitDraft: async (moves) => {
      if (!moves?.length) return { applied: [], rejected: [] };
      dispatch({ type: ACTIONS.COMMIT_START });
      try {
        const result = await gateway.commitMoves(moves);
        dispatch({ type: ACTIONS.COMMIT_RESULT, payload: result });
        return result;
      } catch (err) {
        const rejected = moves.map(m => ({
          orderId: m.orderId, code: 'COMMIT_FAILED', message: err?.message ?? String(err),
        }));
        dispatch({ type: ACTIONS.COMMIT_RESULT, payload: { applied: [], rejected } });
        return { applied: [], rejected };
      }
    },

    patchConfig: async (patch) => {
      // Optimistic: the settings forms must feel immediate, and the impact
      // preview recomputes from the same state.
      dispatch({ type: ACTIONS.PATCH_CONFIG, payload: patch });
      try {
        const saved = await gateway.saveConfig(patch);
        dispatch({ type: ACTIONS.PATCH_CONFIG, payload: saved });
      } catch { /* keep the optimistic value */ }
    },

    runAutoSchedule: async () => {
      const result = await gateway.runAutoSchedule();
      dispatch({ type: ACTIONS.APPLY_AUTO_RUN, payload: result });
      await load({ merge: true });
      return result;
    },

    /** Creates a lorry's slot in a window; resolves to the slot id. */
    createSlot: async (args) => {
      const slot = await gateway.createSlot(args);
      dispatch({ type: ACTIONS.ADD_SLOT, payload: slot });
      return slot.id;
    },

    approveOrders: async (orderIds) => {
      const result = await gateway.approveOrders(orderIds);
      if (result.applied.length) {
        dispatch({
          type: ACTIONS.SET_APPROVAL,
          payload: { orderIds: result.applied, assignmentStatus: 'approved' },
        });
      }
      return result;
    },

    rejectOrders: async (orderIds, reason) => {
      const result = await gateway.rejectOrders(orderIds, reason);
      if (result.applied.length) {
        dispatch({
          type: ACTIONS.SET_APPROVAL,
          payload: { orderIds: result.applied, assignmentStatus: 'rejected', rejectReason: reason },
        });
      }
      return result;
    },

    setDrag,
  }), [gateway, load]);

  const stateValue = useMemo(
    () => ({ ...state, source, liveBlocked: blocked, busy: busyRef.current }),
    [state, source, blocked],
  );

  return (
    <ScheduleStateContext.Provider value={stateValue}>
      <ScheduleActionsContext.Provider value={actions}>
        <DragContext.Provider value={drag}>
          {children}
        </DragContext.Provider>
      </ScheduleActionsContext.Provider>
    </ScheduleStateContext.Provider>
  );
}

export default ScheduleProvider;
