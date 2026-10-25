// The single entry point for "can this order go in this slot?".
//
// Checks run in the order of §5's constraint-priority table, hard constraints
// first. Everything here is pure data in, pure data out — no React — so the
// same function can later be run server-side and its verdict diffed against the
// engine's. A divergence there means the UI is lying to the dispatcher.
//
//   1  booked date and slot .......... the customer's commitment (caller's concern)
//   2  building/property access time .. accessWindowRules
//   3  maximum DO quantity per slot ... capacityRules.evaluateWindowDoCap — per
//                                       date + window, across ALL lorries
//   4  delivery team availability ..... availabilityRules
//   5  driver/team skill match ........ skillRules
//   6  truck availability ............. availabilityRules
//   7  truck capacity / item quantity . capacityRules — volume and weight only
//   8  service + installation duration  capacityRules (time)

import { evaluateSlotCapacity, evaluateWindowDoCap } from './capacityRules';
import { windowLabel, getSlotWindowId } from './slotWindows';
import { evaluateAccessWindow, projectStopTimes } from './accessWindowRules';
import { teamCanServe, requiresInstaller } from './skillRules';
import { truckAvailableOn, teamAvailableOn } from './availabilityRules';
import { isSlotLocked, isSlotCompleted, lockReason } from './lockRules';
import { withDefaults } from './gracePeriod';
import { ISSUE, makeIssue } from './issueCodes';

/**
 * @param {object}   input
 * @param {object}   input.order           the order being placed
 * @param {object}   input.targetSlot
 * @param {number}   [input.targetIndex]   position in the lane; defaults to the end
 * @param {object[]} input.slotOrders      orders ALREADY in the target slot
 * @param {object[]} [input.windowOrders]  orders already in the same date +
 *   window on ANY lorry (including slotOrders). Omit it and the DO cap is not
 *   checked — callers that can see the whole day must pass it.
 * @param {object}   [input.truck]
 * @param {object}   [input.team]
 * @param {object}   [input.building]      the order's building
 * @param {object}   input.productsById
 * @param {object}   [input.employeesById]
 * @param {object}   [input.config]
 * @returns {{ok, blocking: object[], warnings: object[], capacity: object, projected: object}}
 */
export function validateAssignment({
  order,
  targetSlot,
  targetIndex = null,
  slotOrders = [],
  windowOrders = null,
  truck = null,
  team = null,
  building = null,
  productsById = {},
  employeesById = {},
  config = {},
}) {
  const cfg = withDefaults(config);
  const issues = [];
  let windowCap = null;

  if (!order || !targetSlot) {
    return {
      ok: false,
      blocking: [makeIssue(ISSUE.NO_AVAILABLE_SLOT, { detail: 'Missing order or slot.' })],
      warnings: [],
      capacity: null,
      projected: null,
    };
  }

  // Moving an order within the slot it already occupies is not an assignment.
  const alreadyHere = slotOrders.some(o => o?.id === order.id);
  const others = slotOrders.filter(o => o?.id !== order.id);

  // --- 1. Lock state. Checked first: nothing else matters if the truck has gone.
  if (isSlotCompleted(targetSlot, others)) {
    issues.push(makeIssue(ISSUE.SLOT_COMPLETED));
  } else if (isSlotLocked(targetSlot, others)) {
    issues.push(makeIssue(ISSUE.SLOT_LOCKED, {
      detail: lockReason(targetSlot, others) ?? undefined,
    }));
  }

  // --- 3. The window's shared DO cap, with this order counted once.
  if (Array.isArray(windowOrders)) {
    const projectedWindow = [...windowOrders.filter(o => o?.id !== order.id), order];
    windowCap = evaluateWindowDoCap({
      orders: projectedWindow, config: cfg, windowId: getSlotWindowId(targetSlot),
    });
    if (windowCap.over) {
      const label = windowLabel(getSlotWindowId(targetSlot));
      issues.push(makeIssue(ISSUE.SLOT_DO_CAP_REACHED, {
        detail: `${label} is full: ${windowCap.doCount - 1} of ${windowCap.doCap} DOs across all lorries.`,
      }));
    }
  }

  // --- 4 & 6. Resource availability on this date.
  const truckAvail = truckAvailableOn(truck, targetSlot.dateKey, cfg);
  if (!truckAvail.available) {
    issues.push(makeIssue(ISSUE.TRUCK_OFF_DAY, { detail: truckAvail.reason ?? undefined }));
  }
  const teamAvail = teamAvailableOn(team, targetSlot.dateKey, cfg);
  if (!teamAvail.available) {
    issues.push(makeIssue(ISSUE.TEAM_UNAVAILABLE, { detail: teamAvail.reason ?? undefined }));
  }
  if (!team) {
    issues.push(makeIssue(ISSUE.TEAM_UNASSIGNED));
  }

  // --- 5. Crew skill match.
  const skill = teamCanServe(team, order, { productsById, employeesById });
  if (!skill.ok) {
    issues.push(makeIssue(ISSUE.INSTALLER_TEAM_MISSING, {
      detail: `${order.doNo ?? 'This order'} needs an installer; ${team?.name ?? 'the crew'} has none.`,
    }));
  }

  // --- 3, 7, 8. Projected load with this order included.
  const projectedOrders = alreadyHere
    ? slotOrders
    : insertAt(others, order, targetIndex);

  const capacity = evaluateSlotCapacity({
    slot: targetSlot,
    orders: projectedOrders,
    truck,
    productsById,
    config: cfg,
  });
  issues.push(...capacity.issues);

  // --- 2. Access window, at this order's projected position in the sequence.
  const times = projectStopTimes({
    slot: targetSlot,
    orders: projectedOrders,
    productsById,
    config: cfg,
  });
  const myIndex = projectedOrders.findIndex(o => o?.id === order.id);
  const myTime = times[myIndex] ?? {};

  const access = evaluateAccessWindow({
    order,
    building,
    arrivalMinutes: myTime.arrivalMinutes,
    finishMinutes: myTime.finishMinutes,
    config: cfg,
  });
  issues.push(...access.issues);

  // De-duplicate: capacity and access can both surface the same advisory.
  const seen = new Set();
  const unique = issues.filter(i => {
    const key = `${i.code}|${i.detail ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const blocking = unique.filter(i => i.severity === 'blocking');
  const warnings = unique.filter(i => i.severity !== 'blocking');

  return {
    ok: blocking.length === 0,
    blocking,
    warnings,
    capacity,
    window: windowCap,
    projected: {
      arrival: myTime.arrival ?? null,
      finish: myTime.finish ?? null,
      serviceMinutes: myTime.serviceMinutes ?? 0,
      requiresInstaller: requiresInstaller(order, productsById),
      index: myIndex,
    },
  };
}

function insertAt(list, item, index) {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    return [...list, item];
  }
  const copy = [...list];
  copy.splice(index, 0, item);
  return copy;
}

/**
 * The §5 constraint checklist for one slot as it stands — powers
 * SlotFeasibilityPanel, which is where "intelligent" stops being a word.
 *
 * @returns {Array<{id, label, ok, detail}>}
 */
export function evaluateSlotFeasibility({
  slot,
  orders = [],
  windowOrders = null,
  truck = null,
  team = null,
  buildingsById = {},
  productsById = {},
  employeesById = {},
  config = {},
}) {
  const cfg = withDefaults(config);
  const capacity = evaluateSlotCapacity({ slot, orders, truck, productsById, config: cfg });
  // The cap is per window across every lorry; without the window's orders the
  // best available figure is this lane's own, and the detail says so.
  const windowCap = evaluateWindowDoCap({
    orders: windowOrders ?? orders, config: cfg, windowId: getSlotWindowId(slot),
  });
  const times = projectStopTimes({ slot, orders, productsById, config: cfg });

  const accessFailures = orders.filter((order, index) => {
    const t = times[index] ?? {};
    const result = evaluateAccessWindow({
      order,
      building: buildingsById[order?.buildingId] ?? null,
      arrivalMinutes: t.arrivalMinutes,
      finishMinutes: t.finishMinutes,
      config: cfg,
    });
    return !result.ok;
  });

  const skillFailures = orders.filter(
    order => !teamCanServe(team, order, { productsById, employeesById }).ok,
  );

  const truckAvail = truckAvailableOn(truck, slot?.dateKey, cfg);
  const teamAvail = teamAvailableOn(team, slot?.dateKey, cfg);
  const locked = isSlotLocked(slot, orders);

  return [
    {
      id: 'booked-slot', label: 'Booked date and slot honoured', ok: true,
      detail: `${slot?.dateKey ?? '—'} · ${slot?.start ?? '—'}–${slot?.end ?? '—'}`,
    },
    {
      id: 'access-window', label: 'Building access windows', ok: accessFailures.length === 0,
      detail: accessFailures.length
        ? `${accessFailures.length} order(s) fall outside permitted hours`
        : 'All stops within permitted hours',
    },
    {
      id: 'do-cap', label: 'Maximum DOs per slot', ok: !windowCap.over,
      detail: !windowCap.capped
        ? `${windowCap.doCount} DOs — night delivery has no cap`
        : windowOrders
        ? `${windowCap.doCount} of ${windowCap.doCap} across all lorries in this window`
        : `${windowCap.doCount} of ${windowCap.doCap} on this lorry`,
    },
    {
      id: 'team-availability', label: 'Delivery team availability', ok: Boolean(team) && teamAvail.available,
      detail: !team ? 'No crew assigned' : (teamAvail.reason ?? team.name ?? 'Available'),
    },
    {
      id: 'skill-match', label: 'Crew skill compatibility', ok: skillFailures.length === 0,
      detail: skillFailures.length
        ? `${skillFailures.length} order(s) need an installer`
        : 'Crew can serve every order',
    },
    {
      id: 'truck-availability', label: 'Truck availability', ok: Boolean(truck) && truckAvail.available,
      detail: !truck ? 'No lorry assigned' : (truckAvail.reason ?? truck.plate ?? 'Available'),
    },
    {
      id: 'truck-capacity', label: 'Truck capacity / item quantity',
      ok: !capacity.over.includes('volume') && !capacity.over.includes('weight'),
      detail: capacity.volumePct === null
        ? 'Lorry dimensions unknown'
        : `${Math.round(capacity.volumePct * 100)}% volume`
          + (capacity.weightKnown && capacity.weightCapKg
            ? ` · ${capacity.weightKg.toFixed(1)}/${capacity.weightCapKg} kg`
            : ' · weight unknown'),
    },
    {
      id: 'service-duration', label: 'Service + installation duration', ok: !capacity.over.includes('time'),
      detail: capacity.slotMinutes === null
        ? 'Slot window unknown'
        : `${Math.round(capacity.serviceMinutes)} of ${capacity.slotMinutes} usable min`,
    },
    {
      id: 'editable', label: 'Slot still editable', ok: !locked,
      detail: locked ? (lockReason(slot, orders) ?? 'Locked') : 'Open for changes',
    },
  ];
}

export default validateAssignment;
