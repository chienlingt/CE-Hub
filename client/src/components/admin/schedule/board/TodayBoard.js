// The Today board (plan B0) — the default Schedule screen.
//
// At a glance: which DO is on which lorry in which slot, for one day. The
// auto-scheduler proposes; the warehouse admin approves, and rescues what it
// could not place by dragging from the unscheduled panel. Every manual placement is
// confirmed in a pop-up — Place (pending, with Undo) or Place & approve (writes
// to Odoo, no Undo). A drop into an empty cell creates that lorry's slot; the
// first drop into NIGHT is the request for a night delivery.

import React, { useCallback, useMemo, useRef, useState } from 'react';

import ScheduleDndContext from '../dnd/ScheduleDndContext';
import BoardGrid from './BoardGrid';
import MobileBoard from './MobileBoard';
import UnscheduledPanel from './UnscheduledPanel';
import BoardLegend from './BoardLegend';
import DayBar from './DayBar';
import DoDrawer from './DoDrawer';
import LorryCard from './LorryCard';
import SlotDrawer from './SlotDrawer';
import UndoToast from './UndoToast';
import DropConfirm from './DropConfirm';
import { BoardContext } from './BoardContext';
import RejectReasonModal from '../approval/RejectReasonModal';

import SlideOver from '../../../common/SlideOver';
import Modal from '../../../common/Modal';
import Button from '../../../common/Button';
import ResultModal from '../../../common/ResultModal';

import { todayLocalDateKey } from '../../../../utils/dateKey';
import { longDateLabel } from '../../../../utils/schedule/weekRange';
import { windowLabel, getSlotWindowId } from '../../../../utils/schedule/slotWindows';
import {
  fillCache, selectBoardMatrix, selectUnscheduledPanel, selectDropVerdict, selectOrderDetail,
  selectLorryDetail, selectMoveTargets, selectSlotLaneVM, selectDropTarget, effectiveSlotId,
  resolveSlot, isNewSlotId,
} from '../../../../utils/schedule/scheduleSelectors';

function slotLabel(state, slotId) {
  const slot = slotId ? resolveSlot(state, slotId) : null;
  if (!slot) return 'unscheduled';
  const plate = slot.truckId ? state.entities.trucks.byId[slot.truckId]?.plate : null;
  return [plate, windowLabel(getSlotWindowId(slot))].filter(Boolean).join(' · ');
}

export default function TodayBoard({
  state, actions, dateKey, params, setParams, canEdit = true, panelOpen = false, onClosePanel, highlightWindow = null, approveSlot = null,
}) {
  const [drag, setDrag] = useState({ activeId: null, overId: null, verdict: null });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [result, setResult] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);   // DO whose ✗ was clicked, awaiting a reason
  const [pendingDrop, setPendingDrop] = useState(null);   // { orderId, slotId } awaiting confirmation

  // One grouping pass per store change, shared by every selector below.
  const cache = useMemo(() => fillCache(state), [state]);
  const matrix = useMemo(() => selectBoardMatrix(state, dateKey, cache), [state, dateKey, cache]);
  // The unscheduled panel scans the week for each DO, so only while it is open.
  const panel = useMemo(
    () => (panelOpen ? selectUnscheduledPanel(state, cache) : null), [panelOpen, state, cache]);

  // Busiest first, but frozen until the day changes or data reloads (asOf),
  // so a drop, approval or rejection never makes the rows jump.
  const orderRef = useRef({ key: null, ids: [] });
  const orderKey = `${dateKey}|${state.asOf}`;
  if (orderRef.current.key !== orderKey) {
    orderRef.current = { key: orderKey, ids: matrix.rows.map(r => r.truck.id) };
  }
  // What "Approve all" will confirm, in board order: one line per pending DO.
  const pendingList = useMemo(() => matrix.rows.flatMap(row => row.cells.flatMap((cell, i) =>
    cell.blocks
      .filter(b => cell.pendingIds.includes(b.orderId))
      .map(b => ({
        orderId: b.orderId, doNo: b.doNo, address: b.address,
        plate: row.truck.plate, window: `${matrix.columns[i]?.label ?? ''} ${matrix.columns[i]?.timeLabel ?? ''}`.trim(),
      })),
  )), [matrix]);

  const rows = useMemo(() => {
    const rank = new Map(orderRef.current.ids.map((id, i) => [id, i]));
    return [...matrix.rows].sort((a, b) => (rank.get(a.truck.id) ?? 1e9) - (rank.get(b.truck.id) ?? 1e9));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, orderKey]);

  // While dragging, every cell is judged for the dragged DO up front, so the
  // fits / refuses picture is painted across the whole day, not just under
  // the pointer.
  const verdicts = useMemo(() => {
    if (!drag.activeId) return null;
    return Object.fromEntries(
      matrix.cellIds.map(slotId => [slotId, selectDropVerdict(state, drag.activeId, slotId, cache)]),
    );
  }, [drag.activeId, matrix.cellIds, state, cache]);

  const needle = query.trim().toLowerCase();
  const matchesSearch = useCallback(
    block => [block.doNo, block.address, block.customerName].some(v => String(v ?? '').toLowerCase().includes(needle)),
    [needle],
  );

  // --- writes ---------------------------------------------------------------
  const moveOrder = useCallback(async (orderId, targetId, { undoable = true } = {}) => {
    // Undoing a move cannot restore an approval (that would re-write to Odoo),
    // so a confirmed DO's move offers no Undo.
    if (state.entities.orders.byId[orderId]?.assignmentStatus === 'approved') undoable = false;
    const fromSlotId = effectiveSlotId(state, orderId);
    const doNo = state.entities.orders.byId[orderId]?.doNo ?? 'DO';
    const label = slotLabel(state, targetId);

    // An empty cell has no slot yet: the lorry gets one with its first DO.
    let toSlotId = targetId;
    if (isNewSlotId(targetId)) {
      const slot = resolveSlot(state, targetId);
      try {
        toSlotId = await actions.createSlot({
          dateKey: slot.dateKey, start: slot.start, end: slot.end, truckId: slot.truckId, teamId: slot.teamId,
        });
      } catch (err) {
        setResult({ type: 'error', title: `${doNo} was not placed`, message: err?.message ?? String(err) });
        return false;
      }
    }

    // Staged first so the block lands at once; the commit then folds it in.
    actions.stageMove(orderId, toSlotId);
    const res = await actions.commitDraft([{ orderId, fromSlotId, toSlotId, toIndex: null }]);
    if (res.rejected.length) {
      actions.unstageMove(orderId);
      const upgrade = res.rejected.find(r => r.code === 'TRUCK_UPGRADE_REQUIRED');
      setResult({
        type: 'error',
        title: `${doNo} was not moved`,
        message: upgrade
          ? `${upgrade.message} A ${upgrade.recovery?.recommendedTone ?? 3}-ton lorry is recommended.`
          : res.rejected.map(r => r.message).join(' '),
      });
      return false;
    }
    setToast({
      message: `${doNo} moved to ${label}.`,
      undo: undoable ? { orderId, toSlotId: fromSlotId } : null,
    });
    return true;
  }, [state, actions]);

  // The confirmation pop-up's two answers.
  const placeOrder = useCallback(async ({ approve: andApprove }) => {
    const { orderId, slotId } = pendingDrop;
    setPendingDrop(null);
    setBusy(true);
    // Approval writes to Odoo, so a placed-and-approved DO offers no Undo.
    const placed = await moveOrder(orderId, slotId, { undoable: !andApprove });
    if (placed && andApprove) {
      const res = await actions.approveOrders([orderId]);
      if (res.rejected.length) {
        setResult({ type: 'error', title: 'Placed, but not approved', message: res.rejected.map(r => r.message).join(' ') });
      } else {
        setToast({ message: `${state.entities.orders.byId[orderId]?.doNo ?? 'DO'} placed and confirmed for the warehouse.`, undo: null });
      }
    }
    setBusy(false);
    if (placed) setParams({ order: null });
  }, [pendingDrop, moveOrder, actions, state.entities.orders.byId, setParams]);

  // Stable, so the toast's auto-dismiss timer is not reset on every render.
  const dismissToast = useCallback(() => setToast(null), []);

  const handleUndo = useCallback(async (t) => {
    setToast(null);
    await moveOrder(t.undo.orderId, t.undo.toSlotId, { undoable: false });
  }, [moveOrder]);

  const approve = useCallback(async (orderIds) => {
    if (!orderIds.length) return;
    setBusy(true);
    const res = await actions.approveOrders(orderIds);
    setBusy(false);
    if (res.rejected.length) {
      setResult({ type: 'error', title: 'Some DOs were not approved', message: res.rejected.map(r => r.message).join(' ') });
    } else {
      setToast({ message: `${res.applied.length} DO${res.applied.length === 1 ? '' : 's'} confirmed for the warehouse.`, undo: null });
    }
  }, [actions]);

  const reject = useCallback(async (orderId, reason) => {
    setBusy(true);
    const res = await actions.rejectOrders([orderId], reason);
    setBusy(false);
    if (res.rejected.length) {
      setResult({ type: 'error', title: 'Rejection failed', message: res.rejected.map(r => r.message).join(' ') });
    } else {
      setParams({ order: null });
      setToast({ message: `${state.entities.orders.byId[orderId]?.doNo ?? 'DO'} rejected and returned to the unscheduled list.`, undo: null });
    }
  }, [actions, setParams, state.entities.orders.byId]);

  // --- drawers --------------------------------------------------------------
  const openOrder = useCallback(id => setParams({ order: id, lorry: null, slot: null }), [setParams]);
  const openLorry = useCallback(id => setParams({ lorry: id, order: null, slot: null }), [setParams]);
  const openSlot = useCallback(id => setParams({ slot: id, order: null, lorry: null }), [setParams]);

  const getOrderDetail = useCallback(id => selectOrderDetail(state, id, cache), [state, cache]);
  const getLorryDetail = useCallback((id, key) => selectLorryDetail(state, id, key, cache), [state, cache]);

  const orderDetail = useMemo(
    () => (params.order ? selectOrderDetail(state, params.order, cache) : null), [params.order, state, cache]);
  const dropTarget = useMemo(
    () => (pendingDrop ? selectDropTarget(state, pendingDrop.orderId, pendingDrop.slotId, cache) : null),
    [pendingDrop, state, cache]);
  const moveTargets = useMemo(
    () => (params.order ? selectMoveTargets(state, params.order, dateKey, cache) : []), [params.order, state, dateKey, cache]);
  const lorryDetail = useMemo(
    () => (params.lorry ? selectLorryDetail(state, params.lorry, dateKey, cache) : null), [params.lorry, state, dateKey, cache]);
  const slotLane = useMemo(
    () => (params.slot ? selectSlotLaneVM(state, params.slot, cache) : null), [params.slot, state, cache]);

  const boardContext = useMemo(() => ({
    getOrderDetail, getLorryDetail, openOrder, openLorry, openSlot,
    matchesSearch, searching: needle.length > 0, dragActive: Boolean(drag.activeId), canEdit,
    approveOrder: id => approve([id]), requestReject: setRejectingId, busy,
  }), [getOrderDetail, getLorryDetail, openOrder, openLorry, openSlot, matchesSearch, needle, drag.activeId, canEdit, approve, busy]);

  const today = todayLocalDateKey();

  return (
    <BoardContext.Provider value={boardContext}>
      <ScheduleDndContext
        state={state}
        onStageMove={(orderId, slotId) => setPendingDrop({ orderId, slotId })}
        onRejected={(verdict, order) => setResult({
          type: 'error',
          title: `Cannot place ${order?.doNo ?? 'this DO'}`,
          message: verdict.blocking.map(i => `${i.label}: ${i.detail}`).join(' '),
        })}
        onDragStateChange={setDrag}
      >
        <div className="space-y-2">
          <DayBar
            dateKey={dateKey}
            query={query}
            onQuery={setQuery}
            onDate={d => setParams({ date: d, order: null, lorry: null, slot: null })}
            pendingCount={matrix.pendingOrderIds.length}
            busy={busy}
            canEdit={canEdit}
            onApproveAll={() => setConfirmAll(true)}
            approveSlot={approveSlot}
          />

          <BoardLegend />

          {/* The panel docks beside the grid inside the same DnD context, so its
              blocks drag straight onto cells; the grid narrows, never hides. */}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {/* Always the full grid: an empty day is still a day the admin can fill. */}
              <div className="hidden sm:block">
                <BoardGrid matrix={matrix} rows={rows} verdicts={verdicts} busy={busy} onApprove={approve} highlightWindow={highlightWindow} />
              </div>
              <div className="sm:hidden">
                <MobileBoard matrix={matrix} rows={rows} busy={busy} onApprove={approve} />
              </div>
            </div>
            {panel && (
              <UnscheduledPanel
                panel={panel}
                dateKey={dateKey}
                onClose={onClosePanel}
                onJump={d => setParams({ date: d, order: null, lorry: null, slot: null })}
                onSuggest={(orderId, s) => {
                  // Show the day it lands on, then confirm as for a drop.
                  setParams({ date: s.dateKey, order: null, lorry: null, slot: null });
                  setPendingDrop({ orderId, slotId: s.slotId });
                }}
              />
            )}
          </div>
        </div>
      </ScheduleDndContext>

      {orderDetail && (
        <DoDrawer
          detail={orderDetail}
          moveTargets={moveTargets}
          past={dateKey < today && Boolean(orderDetail.slot)}
          canEdit={canEdit}
          busy={busy || state.draft.committing}
          onClose={() => setParams({ order: null })}
          onMove={(orderId, slotId) => setPendingDrop({ orderId, slotId })}
          onReject={reject}
        />
      )}

      {lorryDetail && (
        <SlideOver
          open
          onClose={() => setParams({ lorry: null })}
          title={lorryDetail.truck.plate}
          subtitle={longDateLabel(dateKey)}
          width="sm:w-[400px]"
        >
          <LorryCard detail={lorryDetail} pinned />
        </SlideOver>
      )}

      {slotLane && (
        <SlotDrawer
          lane={slotLane}
          entities={state.entities}
          config={state.config}
          onClose={() => setParams({ slot: null })}
          onOpenOrder={openOrder}
        />
      )}

      <Modal show={confirmAll} onClose={() => setConfirmAll(false)} maxWidth="max-w-2xl">
        <h2 className="text-base font-semibold text-gray-900">
          Approve {matrix.pendingOrderIds.length} pending DO{matrix.pendingOrderIds.length === 1 ? '' : 's'}?
        </h2>
        <p className="mt-1 text-xs text-gray-600">
          For {longDateLabel(dateKey)}. This confirms them for the warehouse and writes back to Odoo.
          Approved DOs lock on the Board; an approval can be undone from the Approval tab.
        </p>
        <ul className="mt-3 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 text-xs">
          {pendingList.map(d => (
            <li key={d.orderId} className="flex items-baseline gap-2 px-2 py-1.5">
              <span className="w-20 flex-shrink-0 font-mono text-gray-900">{d.doNo}</span>
              <span className="w-56 flex-shrink-0 whitespace-nowrap tabular-nums text-gray-600">{d.plate} · {d.window}</span>
              <span className="min-w-0 flex-1 truncate text-gray-500" title={d.address}>{d.address}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" fullWidth onClick={() => setConfirmAll(false)}>Cancel</Button>
          <Button
            fullWidth
            disabled={busy}
            onClick={async () => { setConfirmAll(false); await approve(matrix.pendingOrderIds); }}
          >
            Approve all
          </Button>
        </div>
      </Modal>

      <RejectReasonModal
        open={Boolean(rejectingId)}
        orderCount={1}
        busy={busy}
        title={`Reject ${state.entities.orders.byId[rejectingId]?.doNo ?? 'DO'}`}
        description="It goes back to the unscheduled tray with this reason, so it can be placed again."
        confirmLabel="Reject DO"
        onCancel={() => setRejectingId(null)}
        onConfirm={async (reason) => { const id = rejectingId; setRejectingId(null); await reject(id, reason); }}
      />

      <DropConfirm
        order={pendingDrop ? state.entities.orders.byId[pendingDrop.orderId] : null}
        target={dropTarget}
        busy={busy}
        onCancel={() => setPendingDrop(null)}
        onPlace={placeOrder}
      />

      <UndoToast toast={toast} onUndo={handleUndo} onDismiss={dismissToast} />

      <ResultModal
        open={Boolean(result)}
        type={result?.type}
        title={result?.title}
        message={result?.message}
        onClose={() => setResult(null)}
      />
    </BoardContext.Provider>
  );
}
