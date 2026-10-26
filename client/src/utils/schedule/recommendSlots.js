// "Find a slot": which dates could a not-yet-synced order be delivered?
//
// Advisory only. It reads the loaded schedule, runs the same pure rules the
// Board's drag preview uses, and writes nothing. Sizes are bands, not measured
// items — CE Hub has no item master data — so every answer is approximate and
// the UI says so.
//
// Candidates are every lorry x AM/PM window x date in the horizon. A lorry with
// no slot yet in a window is still a candidate (the engine only creates a slot
// once the lorry carries a DO). NIGHT is never recommended: it runs only when
// the warehouse admin requests it.

import { evaluateSlotCapacity, evaluateWindowDoCap, orderVolumeCm3, truckVolumeCm3 } from './capacityRules';
import { evaluateAccessWindow, projectStopTimes } from './accessWindowRules';
import { teamHasInstaller } from './skillRules';
import { truckAvailableOn, teamAvailableOn } from './availabilityRules';
import { isSlotLocked } from './lockRules';
import { isActiveStatus } from './orderStatus';
import { getSlotWindowId, SLOT_WINDOWS, clockToMinutes } from './slotWindows';
import { withDefaults } from './gracePeriod';
import { bandDemandCm3 } from './sizeBands';
import { ISSUE, makeIssue, issueLabel } from './issueCodes';

export const RECOMMEND_HORIZON_DAYS = 14;
export const RECOMMEND_MAX_OPTIONS = 3;
/** Used when installation is ticked: there are no items to estimate from. */
export const DEFAULT_INSTALL_MINUTES = 90;

const RECOMMENDED_WINDOWS = SLOT_WINDOWS.filter(w => w.id === 'am' || w.id === 'pm');
const PROBE_ID = '__recommend__';

/** Match a typed address to a building by postal code, then by name. */
export function matchBuilding(address, buildings = []) {
  const text = String(address ?? '').toLowerCase();
  if (!text.trim()) return null;

  const postcodes = text.match(/\b\d{5}\b/g) ?? [];
  if (postcodes.length) {
    const byPostcode = buildings.filter(b => b.postalCode && postcodes.includes(String(b.postalCode)));
    if (byPostcode.length === 1) return byPostcode[0];
  }
  // Longest name first so "Residensi Kiara 2" beats "Residensi Kiara".
  return [...buildings]
    .filter(b => b.name && b.name !== 'Unnamed building')
    .sort((a, b) => b.name.length - a.name.length)
    .find(b => text.includes(b.name.toLowerCase())) ?? null;
}

const dayLabel = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
  return `${weekday} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};

/**
 * Evaluate every lorry x window x date in one snapshot.
 * @returns {{candidates: object[], blocked: Record<string, number>, evaluated: number}}
 */
export function evaluateCandidates({
  input, entities, dateKeys, config = {}, todayKey, nowMinutes = 0, building = null,
}) {
  const cfg = withDefaults(config);
  const { orders, slots, trucks, teams, employees, products } = entities;
  const truckList = trucks.allIds.map(id => trucks.byId[id]);
  const demand = bandDemandCm3(input.sizeBand, truckList);
  const jobMinutes = (cfg.duration?.baseDeliveryMinutes ?? 10)
    + (input.installation ? DEFAULT_INSTALL_MINUTES : 0);

  const teamByTruckId = {};
  for (const id of teams.allIds) {
    const t = teams.byId[id];
    if (t.truckId) teamByTruckId[t.truckId] = t;
  }
  const employeesById = employees.byId;

  const ordersBySlot = {};
  for (const id of orders.allIds) {
    const o = orders.byId[id];
    if (o.slotId) (ordersBySlot[o.slotId] ??= []).push(o);
  }
  const slotsByKey = {};
  for (const id of slots.allIds) {
    const s = slots.byId[id];
    (slotsByKey[`${s.dateKey}|${s.truckId}|${getSlotWindowId(s)}`] ??= []).push(s);
  }

  const candidates = [];
  const blocked = {};
  let evaluated = 0;

  for (const dateKey of dateKeys) {
    if (dateKey < todayKey) continue;
    if (input.notBefore && dateKey < input.notBefore) continue;

    for (const win of RECOMMENDED_WINDOWS) {
      if (dateKey === todayKey && clockToMinutes(win.start) <= nowMinutes) continue;

      // Every lorry's orders in this date + window feed the shared DO cap.
      const windowSlots = slots.allIds.map(id => slots.byId[id])
        .filter(s => s.dateKey === dateKey && getSlotWindowId(s) === win.id);
      const windowOrders = windowSlots.flatMap(s => ordersBySlot[s.id] ?? []);
      const sample = windowSlots[0];
      const start = sample?.start ?? win.start;
      const end = sample?.end ?? win.end;

      for (const truck of truckList) {
        evaluated += 1;
        const existing = slotsByKey[`${dateKey}|${truck.id}|${win.id}`]?.[0] ?? null;
        const slot = existing ?? {
          id: null, dateKey, start, end, status: 'scheduled', truckId: truck.id, teamId: null,
        };
        const slotOrders = existing ? (ordersBySlot[existing.id] ?? []) : [];
        const team = teamByTruckId[truck.id] ?? null;
        const issues = [];

        if (existing && isSlotLocked(existing, slotOrders)) issues.push(makeIssue(ISSUE.SLOT_LOCKED));

        if (!truckAvailableOn(truck, dateKey, cfg).available) issues.push(makeIssue(ISSUE.TRUCK_OFF_DAY));
        if (!team) issues.push(makeIssue(ISSUE.TEAM_UNASSIGNED));
        else if (!teamAvailableOn(team, dateKey, cfg).available) issues.push(makeIssue(ISSUE.TEAM_UNAVAILABLE));
        else if (input.installation && !teamHasInstaller(team, employeesById)) {
          issues.push(makeIssue(ISSUE.INSTALLER_TEAM_MISSING));
        }

        const probe = { id: PROBE_ID, status: 'Pending', buildingId: building?.id ?? null, items: [] };
        const cap = evaluateWindowDoCap({ orders: [...windowOrders, probe], config: cfg, windowId: win.id });
        if (cap.over) issues.push(makeIssue(ISSUE.SLOT_DO_CAP_REACHED));

        const load = evaluateSlotCapacity({
          slot, orders: slotOrders, truck, productsById: products.byId, config: cfg,
        });
        const truckCm3 = truckVolumeCm3(truck);
        if (demand !== null && truckCm3 !== null) {
          const used = slotOrders.filter(o => isActiveStatus(o.status))
            .reduce((sum, o) => sum + orderVolumeCm3(o, products.byId), 0);
          if (used + demand > truckCm3) issues.push(makeIssue(ISSUE.TRUCK_VOLUME_EXCEEDED));
        }
        if (load.slotMinutes !== null && load.serviceMinutes + jobMinutes > load.slotMinutes) {
          issues.push(makeIssue(ISSUE.SERVICE_TIME_OVERFLOW));
        }

        if (building) {
          const active = slotOrders.filter(o => isActiveStatus(o.status));
          const times = projectStopTimes({
            slot, orders: [...active, probe], productsById: products.byId, config: cfg,
          });
          const mine = times[times.length - 1] ?? {};
          const access = evaluateAccessWindow({
            order: probe, building, config: cfg,
            arrivalMinutes: mine.arrivalMinutes,
            finishMinutes: Number.isFinite(mine.arrivalMinutes) ? mine.arrivalMinutes + jobMinutes : undefined,
          });
          issues.push(...access.issues);
        }

        // A lorry with no paired crew can't take work, though the Board only warns.
        const blocking = issues.filter(i => i.severity === 'blocking' || i.code === ISSUE.TEAM_UNASSIGNED);
        if (blocking.length) {
          for (const code of new Set(blocking.map(i => i.code))) blocked[code] = (blocked[code] ?? 0) + 1;
          continue;
        }

        const sameBuilding = building
          ? slotOrders.filter(o => o.buildingId === building.id).length : 0;
        const sameZone = building?.zoneId
          ? slotOrders.filter(o => o.buildingId
            && entities.buildings.byId[o.buildingId]?.zoneId === building.zoneId).length : 0;

        candidates.push({
          dateKey, windowId: win.id, windowLabel: win.label, truckId: truck.id,
          sameBuilding, sameZone,
          fill: cap.doCount - 1, doCap: cap.doCap,
          warnings: issues.filter(i => i.severity !== 'blocking' && i.code !== ISSUE.TEAM_UNASSIGNED),
        });
      }
    }
  }
  return { candidates, blocked, evaluated };
}

const reasonFor = (c) => {
  const parts = [];
  if (c.sameBuilding) parts.push(`Already delivering to this building (${c.sameBuilding} DO${c.sameBuilding > 1 ? 's' : ''})`);
  else if (c.sameZone) parts.push(`Same zone as ${c.sameZone} DO${c.sameZone > 1 ? 's' : ''} on this lorry`);
  parts.push(`${c.windowLabel} ${c.fill} of ${c.doCap} DOs`);
  if (c.warnings.some(w => w.code === ISSUE.PERMIT_REQUIRED)) parts.push('building needs pre-registration');
  return parts.join(' · ');
};

/** Best candidate first: earliest date, then same building/zone, then emptiest window. */
const byPreference = (a, b) => (
  a.dateKey.localeCompare(b.dateKey)
  || (b.sameBuilding - a.sameBuilding)
  || (b.sameZone - a.sameZone)
  || (a.fill - b.fill)
);

/**
 * @param {object}   args
 * @param {{address, sizeBand, installation, notBefore}} args.input
 * @param {Array<{entities, dateKeys}>} args.sources  one per loaded week
 * @param {object}   [args.config]
 * @param {string}   args.todayKey
 * @param {number}   [args.nowMinutes]
 * @returns {{options: object[], reasons: string[], notCounted: number, addressMatched: boolean}}
 */
export function recommendSlots({
  input, sources, config = {}, todayKey, nowMinutes = 0, limit = RECOMMEND_MAX_OPTIONS,
}) {
  const allBuildings = sources.flatMap(s => s.entities.buildings.allIds.map(id => s.entities.buildings.byId[id]));
  const building = matchBuilding(input.address, allBuildings);

  const all = [];
  const blocked = {};
  let evaluated = 0;
  let notCounted = 0;
  for (const source of sources) {
    const r = evaluateCandidates({ ...source, input, config, todayKey, nowMinutes, building });
    all.push(...r.candidates);
    evaluated += r.evaluated;
    for (const [code, n] of Object.entries(r.blocked)) blocked[code] = (blocked[code] ?? 0) + n;
    const { orders } = source.entities;
    notCounted += orders.allIds.filter(id => {
      const o = orders.byId[id];
      return !o.slotId && isActiveStatus(o.status);
    }).length;
  }

  // One option per day: the best of that day's AM/PM across all lorries.
  const bestPerDay = new Map();
  for (const c of all.sort(byPreference)) if (!bestPerDay.has(c.dateKey)) bestPerDay.set(c.dateKey, c);

  const options = [...bestPerDay.values()].slice(0, limit).map(c => ({
    key: `${c.dateKey}-${c.windowId}`,
    dateKey: c.dateKey,
    windowId: c.windowId,
    truckId: c.truckId,
    label: `${dayLabel(c.dateKey)} · ${c.windowLabel}`,
    reason: reasonFor(c),
  }));

  const reasons = Object.entries(blocked)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, n]) => `${issueLabel(code)} — ruled out ${n} of ${evaluated} lorry-windows`);

  return { options, reasons, notCounted, addressMatched: Boolean(building), building: building?.name ?? null };
}
