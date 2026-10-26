// Derived view models. Pure (state) -> data functions, memoized at the call
// site with useMemo. No component computes capacity, feasibility or totals.

import { effectiveSlotId } from '../../components/admin/schedule/scheduleReducer';
import { getSlotWindowId, compareWindows, windowLabel, SLOT_WINDOWS } from './slotWindows';
import { evaluateSlotCapacity, evaluateWindowDoCap, isCappedWindow } from './capacityRules';
import { validateAssignment } from './validateAssignment';
import { projectStopTimes } from './accessWindowRules';
import { isSlotLocked, slotLifecycle, lockReason } from './lockRules';
import { teamCapabilitySummary } from './skillRules';
import { truckAvailableOn, teamAvailableOn } from './availabilityRules';
import { issueLabel, ISSUE, makeIssue } from './issueCodes';
import { isLockedStatus, isTerminalStatus } from './orderStatus';
import { withDefaults } from './gracePeriod';
import { weekdayLabel, parseDateKey } from './weekRange';
import { todayLocalDateKey, toLocalDateKey } from '../dateKey';
import { format } from 'date-fns';

// --- core groupings ----------------------------------------------------------

/** orderId[] per slot, honouring staged drags, in loading sequence. */
export function selectOrderIdsBySlot(state) {
  const grouped = {};
  for (const id of state.entities.orders.allIds) {
    const slotId = effectiveSlotId(state, id);
    if (!slotId) continue;
    (grouped[slotId] ??= []).push(id);
  }
  const { byId } = state.entities.orders;
  for (const slotId of Object.keys(grouped)) {
    grouped[slotId].sort((a, b) => (byId[a]?.sequence ?? 0) - (byId[b]?.sequence ?? 0));
  }
  return grouped;
}

export function selectOrdersForSlot(state, slotId, orderIdsBySlot = null) {
  const grouped = orderIdsBySlot ?? selectOrderIdsBySlot(state);
  return (grouped[slotId] ?? []).map(id => state.entities.orders.byId[id]).filter(Boolean);
}

export function selectUnassignedOrders(state) {
  return state.entities.orders.allIds
    .filter(id => !effectiveSlotId(state, id))
    .map(id => state.entities.orders.byId[id])
    .filter(Boolean);
}

/** The key every per-window total is grouped by. */
export const windowKey = (slot) => `${slot?.dateKey}|${getSlotWindowId(slot)}`;

/**
 * Orders per date + window, across every lorry, honouring staged drags. The
 * 25-DO cap is counted against this, not against one lane.
 */
export function selectOrdersByWindow(state, orderIdsBySlot = null) {
  const grouped = orderIdsBySlot ?? selectOrderIdsBySlot(state);
  const result = {};
  for (const [slotId, ids] of Object.entries(grouped)) {
    const slot = state.entities.slots.byId[slotId];
    if (!slot) continue;
    const bucket = (result[windowKey(slot)] ??= []);
    for (const id of ids) {
      const order = state.entities.orders.byId[id];
      if (order) bucket.push(order);
    }
  }
  return result;
}

/**
 * truckId -> team, from the lorry↔team pairing configured on the Information
 * panel (teams.truck_id). One lorry has one team.
 */
export function selectTeamByTruckId(state) {
  const map = {};
  for (const id of state.entities.teams.allIds) {
    const team = state.entities.teams.byId[id];
    if (team?.truckId && !map[team.truckId]) map[team.truckId] = team;
  }
  return map;
}

/**
 * The crew for a slot. The pairing is the source of truth; the slot's stored
 * team only matters to flag that the crew changed after scheduling. Data with
 * no pairing at all (nothing set on the Information panel yet) falls back to
 * the stored team rather than showing the whole fleet as crewless.
 */
export function slotCrew(state, slot, teamByTruckId = selectTeamByTruckId(state)) {
  const stored = slot?.teamId ? state.entities.teams.byId[slot.teamId] ?? null : null;
  const anyPairing = Object.keys(teamByTruckId).length > 0;
  const team = anyPairing
    ? (slot?.truckId ? teamByTruckId[slot.truckId] ?? null : null)
    : stored;
  return { team, storedTeam: stored, crewChanged: Boolean(team && stored && team.id !== stored.id) };
}

/** Fill a selector cache in place, so one pass serves a whole render. */
export function fillCache(state, cache = {}) {
  cache.orderIdsBySlot ??= selectOrderIdsBySlot(state);
  cache.slotIdsByDate ??= selectSlotIdsByDate(state);
  cache.ordersByWindow ??= selectOrdersByWindow(state, cache.orderIdsBySlot);
  cache.teamByTruckId ??= selectTeamByTruckId(state);
  return cache;
}

export function selectSlotIdsByDate(state) {
  const grouped = {};
  for (const id of state.entities.slots.allIds) {
    const slot = state.entities.slots.byId[id];
    if (!slot?.dateKey) continue;
    (grouped[slot.dateKey] ??= []).push(id);
  }
  for (const dateKey of Object.keys(grouped)) {
    grouped[dateKey].sort((a, b) =>
      String(state.entities.slots.byId[a].start).localeCompare(String(state.entities.slots.byId[b].start)));
  }
  return grouped;
}

// --- one slot ----------------------------------------------------------------

/**
 * Everything a slot lane or grid cell needs.
 * @returns {object} lane view model
 */
export function selectSlotLaneVM(state, slotId, cache = {}) {
  const slot = state.entities.slots.byId[slotId];
  if (!slot) return null;

  const cfg = withDefaults(state.config);
  const c = fillCache(state, cache);
  const orders = selectOrdersForSlot(state, slotId, c.orderIdsBySlot);
  const truck = slot.truckId ? state.entities.trucks.byId[slot.truckId] : null;
  const { team, storedTeam, crewChanged } = slotCrew(state, slot, c.teamByTruckId);
  const windowOrders = c.ordersByWindow[windowKey(slot)] ?? [];
  const windowCap = evaluateWindowDoCap({ orders: windowOrders, config: cfg, windowId: getSlotWindowId(slot) });

  const capacity = evaluateSlotCapacity({
    slot, orders, truck, productsById: state.entities.products.byId, config: cfg,
  });

  const locked = isSlotLocked(slot, orders);
  const crew = teamCapabilitySummary(team, state.entities.employees.byId);

  return {
    id: slotId,
    dateKey: slot.dateKey,
    windowId: getSlotWindowId(slot),
    windowLabel: windowLabel(getSlotWindowId(slot)),
    start: slot.start,
    end: slot.end,
    timeLabel: `${slot.start ?? '—'}–${slot.end ?? '—'}`,
    status: slot.status,
    locked,
    lockReason: locked ? lockReason(slot, orders) : null,
    lifecycle: slotLifecycle(slot, orders),
    truck,
    truckPlate: truck?.plate ?? null,
    truckTone: truck?.tone ?? null,
    truckAvailable: truckAvailableOn(truck, slot.dateKey, cfg),
    team,
    teamName: team?.name ?? null,
    teamAvailable: teamAvailableOn(team, slot.dateKey, cfg),
    storedTeam,
    crewChanged,
    crew,
    // The shared cap: DOs in this date + window across every lorry.
    window: windowCap,
    windowOrders,
    orders,
    orderIds: orders.map(o => o.id),
    capacity,
    // B.2's output, read-only.
    route: {
      hasPlan: Boolean(slot.routePlan) || slot.routeVersion > 0,
      version: slot.routeVersion,
      distanceM: slot.routeDistanceM,
      durationS: slot.routeDurationS,
      lastReason: slot.routeLastReason,
      plan: slot.routePlan,
    },
  };
}

// --- approval queue ----------------------------------------------------------

/** Slots awaiting Mr Lee's decision, grouped by day. He approves trips, not DOs. */
export function selectApprovalQueue(state, { filter = 'awaiting_approval' } = {}) {
  const cache = fillCache(state);
  const days = state.range.dateKeys.map(dateKey => {
    const lanes = (cache.slotIdsByDate[dateKey] ?? [])
      .map(id => selectSlotLaneVM(state, id, cache))
      .filter(lane => lane && lane.capacity.doCount > 0)
      .filter(lane => filter === 'all' || lane.lifecycle === filter);
    return { dateKey, lanes };
  }).filter(d => d.lanes.length > 0);

  const counts = { all: 0, draft: 0, awaiting_approval: 0, approved: 0, live: 0, completed: 0 };
  for (const id of state.entities.slots.allIds) {
    const lane = selectSlotLaneVM(state, id, cache);
    if (!lane || lane.capacity.doCount === 0) continue;
    counts.all += 1;
    counts[lane.lifecycle] = (counts[lane.lifecycle] ?? 0) + 1;
  }

  return { days, counts };
}

export { effectiveSlotId };


// --- Today board -------------------------------------------------------------
//
// A lorry has a slot in a window only once it carries a DO there (the engine
// attaches a lorry to a slot when orders land, and detaches it when they
// leave). So an empty cell is a would-be slot, addressed as "new:date|window|
// truck"; the first drop creates the real one.

const NEW_SLOT_PREFIX = 'new:';
export const newSlotId = (dateKey, windowId, truckId) => `${NEW_SLOT_PREFIX}${dateKey}|${windowId}|${truckId}`;
export const isNewSlotId = (slotId) => typeof slotId === 'string' && slotId.startsWith(NEW_SLOT_PREFIX);

/** A window's times on a date: from that day's real slots, else the standard ones. */
function windowTimes(state, dateKey, windowId, c) {
  const real = (c.slotIdsByDate[dateKey] ?? [])
    .map(id => state.entities.slots.byId[id])
    .find(slot => getSlotWindowId(slot) === windowId);
  if (real) return { start: real.start, end: real.end };
  const standard = SLOT_WINDOWS.find(w => w.id === windowId);
  return standard ? { start: standard.start, end: standard.end } : null;
}

/** A real slot, or the would-be slot behind an empty cell. */
export function resolveSlot(state, slotId, cache = {}) {
  if (!isNewSlotId(slotId)) return state.entities.slots.byId[slotId] ?? null;
  const [dateKey, windowId, truckId] = slotId.slice(NEW_SLOT_PREFIX.length).split('|');
  const c = fillCache(state, cache);
  const times = windowTimes(state, dateKey, windowId, c);
  if (!times || !state.entities.trucks.byId[truckId]) return null;
  return {
    id: slotId, dateKey, ...times, status: 'scheduled',
    truckId, teamId: c.teamByTruckId[truckId]?.id ?? null, isNew: true,
  };
}

/** 'Tue 27/10 10:00' — Odoo's expected delivery, in local time. */
export function expectedLabel(expectedAt) {
  const d = expectedAt ? new Date(expectedAt) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const withTime = d.getHours() || d.getMinutes();
  return format(d, withTime ? 'EEE dd/MM HH:mm' : 'EEE dd/MM');
}

/** Odoo's expected date against the date the DO actually sits on. */
export function expectedInfo(order, slotDateKey = null) {
  const expectedDateKey = order?.expectedAt ? toLocalDateKey(new Date(order.expectedAt)) : null;
  return {
    expectedDateKey,
    expectedLabel: expectedLabel(order?.expectedAt),
    dateMismatch: Boolean(expectedDateKey && slotDateKey && expectedDateKey !== slotDateKey),
  };
}

/**
 * Can this order be dropped into this slot (real or would-be)?
 * validateAssignment with the Board's context: the lorry's PAIRED team, the
 * window's shared DO cap (none at NIGHT), and two rules stricter than the
 * engine's warnings — a lorry with no crew cannot take work, and a past day
 * cannot change.
 */
export function selectDropVerdict(state, orderId, slotId, cache = {}) {
  const order = state.entities.orders.byId[orderId];
  const c = fillCache(state, cache);
  const slot = resolveSlot(state, slotId, c);
  if (!order || !slot) return null;

  const { team } = slotCrew(state, slot, c.teamByTruckId);
  const truck = slot.truckId ? state.entities.trucks.byId[slot.truckId] : null;

  const result = validateAssignment({
    order,
    targetSlot: slot,
    slotOrders: slot.isNew ? [] : selectOrdersForSlot(state, slotId, c.orderIdsBySlot),
    windowOrders: c.ordersByWindow[windowKey(slot)] ?? [],
    truck,
    team,
    building: order.buildingId ? state.entities.buildings.byId[order.buildingId] : null,
    productsById: state.entities.products.byId,
    employeesById: state.entities.employees.byId,
    config: state.config,
  });

  const extra = [];
  if (slot.dateKey < todayLocalDateKey()) extra.push(makeIssue(ISSUE.SLOT_IN_PAST));
  if (!team) {
    extra.push({
      ...makeIssue(ISSUE.TEAM_UNASSIGNED, {
        detail: `${truck?.plate ?? 'This lorry'} has no team paired on the Information panel.`,
      }),
      severity: 'blocking',
    });
  }
  if (!extra.length) return result;

  const codes = new Set(extra.map(i => i.code));
  return {
    ...result,
    ok: false,
    blocking: [...extra, ...result.blocking.filter(i => !codes.has(i.code))],
    warnings: result.warnings.filter(i => !codes.has(i.code)),
  };
}

/**
 * A DO block's state on the Board — its colour and whether it may be dragged.
 * Only unapproved DOs move; approval is a separate, deliberate step.
 * @returns {'pending'|'confirmed'|'locked'|'done'|'rejected'|'unscheduled'}
 */
export function doBlockState(order, { slotLocked = false } = {}) {
  if (!order.slotId && order.assignmentStatus === 'rejected') return 'rejected';
  if (isTerminalStatus(order.status)) return 'done';
  if (slotLocked || isLockedStatus(order.status)) return 'locked';
  if (!order.slotId) return 'unscheduled';
  if (order.assignmentStatus === 'approved') return 'confirmed';
  return 'pending';
}

const DRAGGABLE_STATES = ['pending', 'rejected', 'unscheduled'];
export const isDraggableBlockState = (blockState) => DRAGGABLE_STATES.includes(blockState);

function doBlock(state, order, { slotLocked = false, past = false, slotDateKey = null } = {}) {
  const customer = order.customerId ? state.entities.customers.byId[order.customerId] : null;
  const building = order.buildingId ? state.entities.buildings.byId[order.buildingId] : null;
  const blockState = doBlockState(order, { slotLocked });
  return {
    orderId: order.id,
    doNo: order.doNo,
    address: order.deliveryAddress ?? building?.address ?? '',
    customerName: customer?.name ?? '',
    state: blockState,
    draggable: !past && isDraggableBlockState(blockState),
    reason: blockState === 'rejected' ? order.rejectReason : order.unscheduledReason,
    ...expectedInfo(order, slotDateKey),
  };
}

/**
 * Busiest first: most DOs that day, then the larger lorry, then plate. The
 * Board freezes this order between loads so rows never jump mid-drag.
 */
export function compareBoardRows(a, b) {
  return (b.doCount - a.doCount)
    || ((b.truck.tone ?? -1) - (a.truck.tone ?? -1))
    || String(a.truck.plate).localeCompare(String(b.truck.plate));
}

/**
 * One day, every lorry (rows, busiest first) x AM / PM / NIGHT (columns,
 * always all three), plus the per-window totals the sticky footer shows.
 * Every cell is either a real slot or a would-be one; NIGHT is closed (grey,
 * but droppable — the drop is the request) until it holds a DO.
 */
export function selectBoardMatrix(state, dateKey, cache = {}) {
  const cfg = withDefaults(state.config);
  const c = fillCache(state, cache);
  const today = todayLocalDateKey();
  const past = dateKey < today;

  const lanes = (c.slotIdsByDate[dateKey] ?? [])
    .map(id => selectSlotLaneVM(state, id, c))
    .filter(Boolean);

  // The standard three, plus any unclassifiable window real data carries.
  const windowIds = [...new Set([...SLOT_WINDOWS.map(w => w.id), ...lanes.map(l => l.windowId)])]
    .sort(compareWindows);

  const totals = windowIds.map(windowId => ({
    windowId,
    label: windowLabel(windowId),
    ...evaluateWindowDoCap({ orders: c.ordersByWindow[`${dateKey}|${windowId}`] ?? [], config: cfg, windowId }),
  }));
  const totalOf = Object.fromEntries(totals.map(t => [t.windowId, t]));
  // AM and PM carry the shared cap; each night DO adds one (night is uncapped).
  const dayTotal = {
    doCount: totals.reduce((n, t) => n + t.doCount, 0),
    doCap: totals.reduce((n, t) => n + (t.capped ? t.doCap : t.doCount), 0),
  };

  const columns = windowIds.map((windowId) => {
    const times = windowTimes(state, dateKey, windowId, c);
    return {
      windowId,
      label: windowLabel(windowId),
      timeLabel: times ? `${times.start}–${times.end}` : '',
      capped: isCappedWindow(windowId),
      // NIGHT runs only on the warehouse admin's request: open while it has DOs.
      open: isCappedWindow(windowId) || totalOf[windowId].doCount > 0,
    };
  });

  const trucks = state.entities.trucks.allIds.map(id => state.entities.trucks.byId[id]).filter(Boolean);
  const pendingOrderIds = [];
  const cellIds = [];

  const rows = trucks.map((truck) => {
    const team = c.teamByTruckId[truck.id]
      ?? (Object.keys(c.teamByTruckId).length ? null : lanes.find(l => l.truck?.id === truck.id)?.team ?? null);
    const teamAvail = teamAvailableOn(team, dateKey, cfg);
    const truckAvail = truckAvailableOn(truck, dateKey, cfg);
    const teamState = !team ? 'none' : (teamAvail.available ? 'ok' : 'unavailable');
    const truckLanes = lanes.filter(l => l.truck?.id === truck.id);

    const cells = columns.map(({ windowId, open }) => {
      const lane = truckLanes.find(l => l.windowId === windowId) ?? null;
      const blocks = (lane?.orders ?? []).map(o => doBlock(state, o, { slotLocked: lane.locked, past, slotDateKey: dateKey }));
      const pendingIds = blocks.filter(b => b.state === 'pending' && !past).map(b => b.orderId);
      pendingOrderIds.push(...pendingIds);

      let cellState = 'open';
      let reason = null;
      if (!truckAvail.available) { cellState = 'off'; reason = truckAvail.reason; }
      else if (past) { cellState = 'past'; reason = 'Past day'; }
      else if (lane?.locked) { cellState = 'locked'; reason = lane.lockReason; }
      else if (teamState === 'none') { cellState = 'noteam'; reason = 'No team paired'; }
      else if (teamState === 'unavailable') { cellState = 'noteam'; reason = teamAvail.reason ?? 'Team unavailable'; }
      else if (!open) { cellState = 'nightclosed'; reason = 'No night delivery'; }
      else if (lane && (lane.capacity.over.includes('volume') || lane.capacity.over.includes('weight'))) {
        cellState = 'full';
        reason = lane.capacity.over.includes('volume') ? 'Lorry volume full' : 'Lorry payload full';
      }

      const slotId = lane?.id ?? newSlotId(dateKey, windowId, truck.id);
      // Refuses drops outright, before any validation runs. A full lorry
      // (volume or weight) is blocked here too; the cell just says so.
      const droppable = ['open', 'nightclosed'].includes(cellState);
      if (droppable) cellIds.push(slotId);

      return {
        windowId,
        slotId,
        lane,
        state: cellState,
        reason,
        droppable,
        windowFull: totalOf[windowId].full,
        blocks,
        pendingIds,
      };
    });

    return {
      truck,
      team,
      teamState,
      teamReason: teamState === 'unavailable' ? (teamAvail.reason ?? 'Team unavailable') : null,
      truckAvailability: truckAvail,
      crewChanged: truckLanes.some(l => l.crewChanged),
      storedTeamNames: [...new Set(truckLanes.filter(l => l.crewChanged).map(l => l.storedTeam?.name))],
      doCount: truckLanes.reduce((n, l) => n + l.capacity.doCount, 0),
      cells,
    };
  }).sort(compareBoardRows);

  return {
    dateKey,
    isToday: dateKey === today,
    past,
    columns,
    rows,
    totals,
    dayTotal,
    pendingOrderIds,
    cellIds,
  };
}

// Only work still to be placed is "unscheduled". A slotless DO that is already
// Loaded, Delivering or Delivered is a data inconsistency, not a scheduling job.
const UNSCHEDULED_STATUSES = ['Pending', 'Scheduled'];

/** Every DO still to be placed, due soonest first, rejected ones included. */
export function selectTrayBlocks(state) {
  const seq = (doNo) => Number(String(doNo ?? '').replace(/\D/g, '')) || 0;
  const due = (o) => (o.expectedAt ? new Date(o.expectedAt).getTime() : Infinity);
  return selectUnassignedOrders(state)
    .filter(o => UNSCHEDULED_STATUSES.includes(o.status))
    .sort((a, b) => (due(a) - due(b)) || (seq(a.doNo) - seq(b.doNo)))
    .map(o => doBlock(state, o));
}

/** Everything the DO popover and drawer show — CE Hub fields only. */
export function selectOrderDetail(state, orderId, cache = {}) {
  const order = state.entities.orders.byId[orderId];
  if (!order) return null;

  const c = fillCache(state, cache);
  const slotId = effectiveSlotId(state, orderId);
  const slot = slotId ? state.entities.slots.byId[slotId] : null;
  const lane = slot ? selectSlotLaneVM(state, slotId, c) : null;
  const customer = order.customerId ? state.entities.customers.byId[order.customerId] : null;
  const building = order.buildingId ? state.entities.buildings.byId[order.buildingId] : null;
  const blockState = doBlockState({ ...order, slotId }, { slotLocked: lane?.locked });

  // Conflicts are only worth showing while the DO can still change.
  let issues = [];
  let eta = null;
  if (slot) {
    const times = projectStopTimes({
      slot, orders: lane.orders, productsById: state.entities.products.byId, config: withDefaults(state.config),
    });
    eta = times[lane.orders.findIndex(o => o.id === orderId)]?.arrival ?? null;
    if (['pending', 'confirmed'].includes(blockState)) {
      issues = selectDropVerdict(state, orderId, slotId, c)?.blocking ?? [];
    }
  }

  return {
    order,
    blockState,
    customer,
    building,
    slot,
    lane,
    eta,
    expected: expectedInfo(order, slot?.dateKey ?? null),
    items: order.items.map(item => ({
      quantity: item.quantity ?? 1,
      name: state.entities.products.byId[item.productId]?.name ?? item.productId,
    })),
    issues,
    rejectReason: order.assignmentStatus === 'rejected' ? order.rejectReason : null,
    unscheduledReason: !slot ? order.unscheduledReason : null,
  };
}

/** Describes a target cell for the drop pop-up and "Move to…". */
export function selectDropTarget(state, orderId, slotId, cache = {}) {
  const c = fillCache(state, cache);
  const slot = resolveSlot(state, slotId, c);
  const order = state.entities.orders.byId[orderId];
  if (!slot || !order) return null;
  const windowId = getSlotWindowId(slot);
  const windowCount = (c.ordersByWindow[windowKey(slot)] ?? []).filter(o => o.id !== orderId).length;
  return {
    slotId,
    slot,
    dateKey: slot.dateKey,
    windowId,
    windowLabel: windowLabel(windowId),
    timeLabel: `${slot.start}–${slot.end}`,
    truckPlate: slot.truckId ? state.entities.trucks.byId[slot.truckId]?.plate ?? null : null,
    isNew: Boolean(slot.isNew),
    // The first DO into a closed NIGHT is the request for a night delivery.
    startsNight: !isCappedWindow(windowId) && windowCount === 0,
    expected: expectedInfo(order, slot.dateKey),
    verdict: selectDropVerdict(state, orderId, slotId, c),
  };
}

/** Cells on one day that would accept this DO — the touch/keyboard "Move to…". */
export function selectMoveTargets(state, orderId, dateKey, cache = {}) {
  const c = fillCache(state, cache);
  const current = effectiveSlotId(state, orderId);
  const matrix = selectBoardMatrix(state, dateKey, c);
  return matrix.rows
    .flatMap(row => row.cells)
    .filter(cell => cell.droppable && cell.slotId !== current)
    .map(cell => selectDropTarget(state, orderId, cell.slotId, c))
    .filter(t => t?.verdict?.ok)
    .sort((a, b) => compareWindows(a.windowId, b.windowId) || String(a.truckPlate).localeCompare(String(b.truckPlate)));
}

/** The lorry hover card: crew contacts, cargo space and the day's load. */
export function selectLorryDetail(state, truckId, dateKey, cache = {}) {
  const truck = state.entities.trucks.byId[truckId];
  if (!truck) return null;

  const cfg = withDefaults(state.config);
  const c = fillCache(state, cache);
  const matrix = selectBoardMatrix(state, dateKey, c);
  const row = matrix.rows.find(r => r.truck.id === truckId);
  const team = row?.team ?? null;
  const employees = state.entities.employees.byId;

  const driver = team?.primaryDriverId ? employees[team.primaryDriverId] ?? null : null;
  const helperIds = team
    ? [team.assistantDriverId, ...team.memberIds].filter((id, i, all) => id && id !== team.primaryDriverId && all.indexOf(id) === i)
    : [];

  return {
    truck,
    availability: truckAvailableOn(truck, dateKey, cfg),
    team,
    teamState: row?.teamState ?? 'none',
    teamReason: row?.teamReason ?? null,
    installerCapable: team ? teamCapabilitySummary(team, employees).hasInstaller : false,
    driver,
    helpers: helperIds.map(id => employees[id]).filter(Boolean),
    crewChanged: row?.crewChanged ?? false,
    storedTeamNames: row?.storedTeamNames ?? [],
    load: (row?.cells ?? []).map((cell) => ({
      windowId: cell.windowId,
      label: windowLabel(cell.windowId),
      doCount: cell.lane?.capacity.doCount ?? 0,
      volumePct: cell.lane?.capacity.volumePct ?? null,
      off: cell.state === 'off',
    })),
  };
}

// How many cells to test per DO before settling on its blocking reason.
const PANEL_SCAN_LIMIT = 160;
const PANEL_SUGGESTIONS = 2;

/**
 * Droppable AM/PM cells per day from today across the loaded week: every
 * crewed, available lorry, real slots and would-be ones. NIGHT is on request,
 * so it is never suggested.
 */
function candidateCellsByDay(state, c) {
  const today = todayLocalDateKey();
  const byDay = new Map();
  for (const dateKey of state.range.dateKeys.filter(d => d >= today)) {
    const matrix = selectBoardMatrix(state, dateKey, c);
    const cells = [];
    for (const column of matrix.columns.filter(col => col.capped)) {
      for (const row of matrix.rows) {
        const cell = row.cells.find(x => x.windowId === column.windowId);
        if (cell?.droppable) cells.push({ slotId: cell.slotId, dateKey, windowId: column.windowId, plate: row.truck.plate });
      }
    }
    byDay.set(dateKey, cells);
  }
  return byDay;
}

/** Its expected day first, then the rest of the week in order. */
function candidateCells(byDay, expectedDateKey) {
  const days = [...byDay.keys()];
  const ordered = expectedDateKey && byDay.has(expectedDateKey)
    ? [expectedDateKey, ...days.filter(d => d !== expectedDateKey)]
    : days;
  return ordered.flatMap(d => byDay.get(d));
}

/**
 * The unscheduled panel: DOs grouped by Odoo's expected date, earliest first —
 * overdue ones together on top, those without a date last. Each carries one
 * reason line and up to two suggested cells.
 */
export function selectUnscheduledPanel(state, cache = {}) {
  const c = fillCache(state, cache);
  const today = todayLocalDateKey();
  const blocks = selectTrayBlocks(state);
  const byDay = candidateCellsByDay(state, c);

  const entries = blocks.map((block) => {
    const order = state.entities.orders.byId[block.orderId];
    let reason;
    const suggestions = [];

    if (block.state === 'rejected') {
      reason = { tone: 'rejected', text: block.reason ?? 'Rejected' };
    } else {
      const blockers = new Map();
      for (const cell of candidateCells(byDay, block.expectedDateKey).slice(0, PANEL_SCAN_LIMIT)) {
        const verdict = selectDropVerdict(state, order.id, cell.slotId, c);
        if (verdict?.ok) {
          suggestions.push({
            slotId: cell.slotId,
            dateKey: cell.dateKey,
            label: `${weekdayLabel(cell.dateKey)} ${windowLabel(cell.windowId)} · ${cell.plate}`,
          });
          if (suggestions.length >= PANEL_SUGGESTIONS) break;
        } else {
          for (const issue of verdict?.blocking ?? []) if (!blockers.has(issue.code)) blockers.set(issue.code, issue);
        }
      }
      const first = [...blockers.values()][0];
      reason = suggestions.length
        ? { tone: 'ok', text: 'Can be placed' }
        : { tone: 'blocked', text: first?.label ?? order.unscheduledReason ?? issueLabel(ISSUE.NO_AVAILABLE_SLOT) };
    }
    return { block, reason, suggestions };
  });

  const groups = [];
  const overdue = entries.filter(e => e.block.expectedDateKey && e.block.expectedDateKey < today);
  if (overdue.length) {
    // Past days refuse drops, so overdue DOs land on today.
    groups.push({ key: 'overdue', label: 'Overdue', overdue: true, jumpDateKey: today, entries: overdue });
  }
  const dated = [...new Set(entries.map(e => e.block.expectedDateKey).filter(d => d && d >= today))].sort();
  for (const dateKey of dated) {
    groups.push({
      key: dateKey,
      label: `${weekdayLabel(dateKey)} ${format(parseDateKey(dateKey), 'dd/MM')}`,
      dateKey,
      jumpDateKey: dateKey,
      entries: entries.filter(e => e.block.expectedDateKey === dateKey),
    });
  }
  const undated = entries.filter(e => !e.block.expectedDateKey);
  if (undated.length) groups.push({ key: 'none', label: 'No expected date', jumpDateKey: null, entries: undated });

  return { count: entries.length, groups };
}
