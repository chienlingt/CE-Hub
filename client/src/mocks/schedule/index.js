// Mock snapshot builder.
//
// TWO RULES that must not bend:
//
// 1. Nothing here stores a date. Everything is keyed on `dayOffset` from the
//    anchor, resolved against todayLocalDateKey() at build time. A fixture with
//    a hardcoded 2026-10-27 in it is dead the following week, and this will be
//    demoed more than once.
//
// 2. Output is in the API's snake_case shape and goes through the SAME
//    normalizeSnapshot the live gateway uses. So the mock path exercises the
//    real normalization, and swapping to live changes no component.
//
// Volume is generated rather than hand-written: Mr Lee's real day is 70-80 DOs
// (Meeting_Outcomes.md §1), so a week is ~450 orders. A seeded PRNG keeps it
// deterministic — the same scenario renders identically every run, which a
// stakeholder demo needs.
//
// Saturday and Sunday are delivery days like any other. Every lorry gets a
// slot per window (the Board shows the whole fleet), each slot's crew is the
// lorry's paired team, and the 25-DO cap is shared by all lorries in a window.

import { todayLocalDateKey } from '../../utils/dateKey';
import { buildWorkingRange, parseDateKey } from '../../utils/schedule/weekRange';
import { SLOT_WINDOWS } from '../../utils/schedule/slotWindows';
import { DEFAULT_SCHEDULE_CONFIG } from '../../utils/schedule/gracePeriod';
import { normalizeSnapshot } from '../../utils/schedule/scheduleNormalize';
import {
  ZONES, PRODUCTS, BUILDINGS, TRUCKS, EMPLOYEES, TEAMS,
  EMPLOYEE_TEAM_ASSIGNMENTS, CUSTOMERS, SALESPEOPLE,
} from './fixtures';

/** mulberry32 — small, fast, deterministic. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// --- Scenarios ---------------------------------------------------------------
// Each tunes the generator rather than carrying its own records, so adding a
// scenario is a few numbers and not another 450 orders.

export const SCENARIOS = {
  normal: {
    label: 'Normal week',
    description: 'A representative week: ~75 DOs/day, a few exceptions, one trip already out.',
    seed: 20261027,
    // Monday..Sunday. Weekends deliver too, a little lighter.
    dosPerDay: [74, 71, 68, 50, 63, 58, 44],
    trucksPerDay: 6,
    unassignedCount: 7,
    rejectedCount: 1,
    liveToday: true,
    approvedThroughOffset: 0,         // today is approved; tomorrow on awaits Mr Lee
    pendingTodayWindows: ['night'],   // late additions to tonight, still to approve
    overbookFactor: 1,
  },
  overbooked: {
    label: 'Overbooked',
    description: 'Peak week pushing past slot caps and lorry capacity — the capacity story.',
    seed: 918273,
    dosPerDay: [96, 94, 88, 61, 79, 72, 55],
    trucksPerDay: 5,
    unassignedCount: 23,
    rejectedCount: 2,
    liveToday: true,
    approvedThroughOffset: -1,
    overbookFactor: 1.35,
  },
  locked: {
    label: 'Trips in progress',
    description: 'Today’s morning and afternoon trips are out for delivery and locked.',
    seed: 554433,
    dosPerDay: [72, 70, 66, 50, 60, 56, 40],
    trucksPerDay: 6,
    unassignedCount: 4,
    rejectedCount: 0,
    liveToday: true,
    lockWindows: ['am', 'pm'],
    approvedThroughOffset: 2,
    overbookFactor: 1,
  },
  exceptions: {
    label: 'Exception-heavy',
    description: 'Every conflict reason represented at least once.',
    seed: 777111,
    dosPerDay: [70, 68, 64, 48, 58, 52, 38],
    trucksPerDay: 4,
    unassignedCount: 18,
    rejectedCount: 3,
    liveToday: false,
    approvedThroughOffset: -1,
    overbookFactor: 1.2,
    forceExceptions: true,
  },
  awaitingApproval: {
    label: 'Awaiting approval',
    description: 'A full week generated and assigned, nothing approved — Mr Lee’s queue.',
    seed: 246810,
    dosPerDay: [75, 73, 70, 51, 64, 60, 45],
    trucksPerDay: 6,
    unassignedCount: 5,
    rejectedCount: 0,
    liveToday: false,
    approvedThroughOffset: -1,   // nothing approved
    overbookFactor: 1,
  },
};

export const DEFAULT_SCENARIO = 'normal';

const REJECT_REASONS = ['Customer rescheduled', 'Building access not confirmed', 'Items not ready in the warehouse'];

// AM and PM carry the day. NIGHT runs only when the warehouse admin starts it,
// so the generator opens it on one sample day only.
const WINDOW_WEIGHTS = { am: 0.5, pm: 0.5 };
const NIGHT_SAMPLE_DOS = 3;

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'). */
function dayDiff(from, to) {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  return a && b ? Math.round((b - a) / 86400000) : 0;
}

/** Same substring rule as availabilityRules.truckOffDayMatches. */
function truckOffOn(truck, dateKey) {
  if (!truck.off_day) return false;
  const weekday = parseDateKey(dateKey)?.toLocaleDateString('en-US', { weekday: 'long' }) ?? '';
  return truck.off_day.includes(weekday) || truck.off_day.includes(weekday.slice(0, 3));
}

/** Odoo's picking.scheduled_date, as ingest stores it in orders.preferred_timeslot. */
const odooTimestamp = (dateKey, clock) => `${dateKey}T${clock}:00+08:00`;

function buildMockRaw({ scenario = DEFAULT_SCENARIO, anchorDateKey } = {}) {
  const config = SCENARIOS[scenario] ?? SCENARIOS[DEFAULT_SCENARIO];
  const anchor = anchorDateKey || todayLocalDateKey();
  const { dateKeys } = buildWorkingRange(anchor, { days: 7, skipWeekend: false });
  const rng = makeRng(config.seed);
  const doCap = DEFAULT_SCHEDULE_CONFIG.maxDOsPerSlot;

  const slots = [];
  const orders = [];
  const orderProducts = [];
  let orderSeq = 24000;
  let itemSeq = 1;

  const todayKey = todayLocalDateKey();
  const teamByTruck = Object.fromEntries(TEAMS.filter(t => t.truck_id).map(t => [t.truck_id, t]));
  // Tonight if today is in the week (so the default screen shows it), else Wednesday.
  const nightDay = dateKeys.includes(todayKey) ? todayKey : dateKeys[2];

  dateKeys.forEach((dateKey, dayIndex) => {
    const daysFromToday = dayDiff(todayKey, dateKey);
    const isPast = daysFromToday < 0;
    const isToday = daysFromToday === 0;
    const targetDos = config.dosPerDay[dayIndex] ?? 50;

    // The lorries the engine filled that day: paired, crew available, not off.
    // Rotated by day, so the busy lorries differ across the week.
    const usable = TRUCKS.filter(t => {
      const team = teamByTruck[t.id];
      return team && team.available_flag !== false && !truckOffOn(t, dateKey);
    });
    const offset = (dayIndex * 2) % usable.length;
    const filled = [...usable.slice(offset), ...usable.slice(0, offset)].slice(0, config.trucksPerDay);

    // A lorry gets a slot in a window only when it carries a DO there — the
    // engine attaches lorries to slots as orders land (scheduler.js:583).
    const slotFor = (window, truck) => {
      const id = `s-${dateKey}-${window.id}-${truck.id}`;
      const existing = slots.find(sl => sl.id === id);
      if (existing) return existing;

      const lockThisWindow = isToday && config.liveToday
        && (config.lockWindows ? config.lockWindows.includes(window.id) : window.id === 'am');
      // The pairing changed after this slot was generated, so the Board can
      // show its "crew changed since scheduling" note.
      const stale = dayIndex === 2 && truck.id === filled[0].id;
      // Deliberately crewless and lorry-less, so those states have content.
      const starved = config.forceExceptions && truck.id === filled[filled.length - 1].id && window.id === 'pm';

      let slotStatus = 'scheduled';
      if (isPast) slotStatus = 'completed';
      else if (lockThisWindow) slotStatus = 'out_for_delivery';

      const team = stale ? TEAMS.find(t => t.id !== teamByTruck[truck.id]?.id) : teamByTruck[truck.id];
      const slot = {
        id,
        date: dateKey,
        time_window_start: window.start,
        time_window_end: window.end,
        slot_status: slotStatus,
        available_flag: true,
        truck_id: starved ? null : truck.id,
        delivery_team_id: starved ? null : team?.id ?? null,
        departed_at: lockThisWindow ? odooTimestamp(dateKey, window.start) : null,
        // B.2's fields. Populated only where a route has "been optimised", so
        // the RoutePlanPanel shows both the integrated and the pending state.
        route_version: lockThisWindow ? 2 : 0,
        route_last_reason: lockThisWindow ? 'departure_traffic_check' : null,
        route_distance_m: lockThisWindow ? between(rng, 12000, 42000) : null,
        route_duration_s: lockThisWindow ? between(rng, 1800, 5400) : null,
      };
      slots.push(slot);
      return slot;
    };

    const windowPlan = SLOT_WINDOWS
      .map(window => {
        if (window.id === 'night') {
          return { window, count: dateKey === nightDay ? NIGHT_SAMPLE_DOS : 0, trucks: filled.slice(0, 1) };
        }
        // The engine respects the shared window cap; overbooking pushes past it.
        const base = Math.min(doCap, Math.round(targetDos * (WINDOW_WEIGHTS[window.id] ?? 0.5)));
        return { window, count: Math.round(base * config.overbookFactor), trucks: filled };
      })
      .filter(plan => plan.count > 0);

    windowPlan.forEach(({ window, count, trucks }) => {
      for (let n = 0; n < count; n += 1) {
        // Round-robin, so the window's DOs spread evenly over the busy lorries.
        const slot = slotFor(window, trucks[n % trucks.length]);
        orderSeq += 1;
        const orderId = `o-${orderSeq}`;
        const building = pick(rng, BUILDINGS);
        const customer = pick(rng, CUSTOMERS);

        let status = 'Scheduled';
        if (slot.slot_status === 'completed') {
          status = rng() < 0.94 ? 'Delivered' : 'Failed';
        } else if (slot.slot_status === 'out_for_delivery') {
          const roll = rng();
          status = roll < 0.45 ? 'Delivered' : roll < 0.85 ? 'Delivering' : 'Loaded';
        }

        const pendingTonight = isToday && (config.pendingTodayWindows ?? []).includes(window.id);
        const approved = isPast
          || slot.slot_status !== 'scheduled'
          || (daysFromToday <= config.approvedThroughOffset && !pendingTonight);

        // Most DOs sit on the day Odoo expects; a few were pushed a day out,
        // so the Board's date-mismatch marker has something to flag.
        const expectedDay = rng() < 0.06 ? dateKeys[Math.max(0, dayIndex - 1)] : dateKey;

        const itemCount = rng() < 0.72 ? 1 : 2;
        for (let k = 0; k < itemCount; k += 1) {
          const product = pick(rng, PRODUCTS);
          const needsInstall = product.installer_team_required_flag
            || product.estimated_installation_time_min;
          orderProducts.push({
            id: itemSeq++,
            order_id: orderId,
            product_id: product.id,
            // Air conditioners are bought in bulk — Meeting_Outcomes.md §2.
            quantity: product.id === 'p-aircon' && rng() < 0.3 ? between(rng, 2, 5) : 1,
            service_type: needsInstall && rng() < 0.75 ? 'delivery_installation' : 'delivery_only',
            dismantle_required: Boolean(product.dismantle_required_flag) && rng() < 0.4,
            dismantle_time_min: product.dismantle_time ?? null,
            dismantle_time_max: product.dismantle_time ? product.dismantle_time + 10 : null,
            handling_status: status === 'Scheduled' ? 'pending' : 'loaded',
          });
        }

        orders.push({
          id: orderId,
          odoo_order_ref: `DO-${orderSeq}`,
          order_status: status,
          assignment_status: approved ? 'approved' : 'assigned',
          time_slot_id: slot.id,
          customer_id: customer.id,
          building_id: building.id,
          truck_loading_sequence: n,
          delivery_address: building.address,
          salesperson_name: pick(rng, SALESPEOPLE),
          delivery_remarks: rng() < 0.12 ? 'Customer requests a call 30 minutes before arrival.' : null,
          preferred_timeslot: odooTimestamp(expectedDay, window.start),
        });
      }
    });
  });

  // --- Unassigned pool: the tray, and the exception drawer's contents --------
  // Deliberately seeded with buildings whose constraints will fail, so every
  // conflict reason has something real behind it rather than a fabricated chip.
  const EXCEPTION_BUILDINGS = ['b-02', 'b-09', 'b-10', 'b-13', 'b-04'];
  for (let i = 0; i < config.unassignedCount; i += 1) {
    orderSeq += 1;
    const orderId = `o-${orderSeq}`;
    const building = config.forceExceptions || i < EXCEPTION_BUILDINGS.length
      ? BUILDINGS.find(b => b.id === EXCEPTION_BUILDINGS[i % EXCEPTION_BUILDINGS.length])
      : pick(rng, BUILDINGS);
    const customer = pick(rng, CUSTOMERS);
    const product = i % 3 === 0
      ? PRODUCTS.find(p => p.id === 'p-sofa')          // bulky: pushes volume
      : i % 3 === 1
        ? PRODUCTS.find(p => p.id === 'p-washer')      // needs an installer
        : pick(rng, PRODUCTS);

    orderProducts.push({
      id: itemSeq++,
      order_id: orderId,
      product_id: product.id,
      quantity: i % 5 === 0 ? between(rng, 3, 6) : 1,
      service_type: product.installer_team_required_flag ? 'delivery_installation' : 'delivery_only',
      dismantle_required: Boolean(product.dismantle_required_flag),
      dismantle_time_min: product.dismantle_time ?? null,
      dismantle_time_max: product.dismantle_time ? product.dismantle_time + 10 : null,
    });

    // The first few were placed by the engine and turned down by the warehouse
    // admin, so they are back in the tray carrying the reason.
    const rejected = i < (config.rejectedCount ?? 0);

    orders.push({
      id: orderId,
      odoo_order_ref: `DO-${orderSeq}`,
      order_status: 'Pending',
      assignment_status: rejected ? 'rejected' : 'unassigned',
      reject_reason: rejected ? REJECT_REASONS[i % REJECT_REASONS.length] : null,
      time_slot_id: null,
      customer_id: customer.id,
      building_id: building.id,
      delivery_address: building.address,
      salesperson_name: pick(rng, SALESPEOPLE),
      // Spread over the week, so the tray's "due soonest" order means something.
      preferred_timeslot: odooTimestamp(dateKeys[(i * 3) % dateKeys.length], '10:00'),
      // The engine writes one of only two coarse strings today. Phase 4 replaces
      // this with structured issueCodes; the UI computes its own reasons until then.
      unscheduled_reason: rejected
        ? null
        : 'No suitable timeslot found (access window conflict or insufficient time)',
    });
  }

  return {
    slots,
    orders,
    orderProducts,
    trucks: TRUCKS,
    teams: TEAMS,
    employees: EMPLOYEES,
    employeeTeamAssignments: EMPLOYEE_TEAM_ASSIGNMENTS,
    buildings: BUILDINGS.map(b => ({
      ...b,
      zone: ZONES.find(z => z.id === b.zone_id) ?? null,
    })),
    customers: CUSTOMERS,
    products: PRODUCTS,
  };
}

/**
 * The mock gateway's snapshot. Normalized, so it is byte-identical in shape to
 * what the live gateway will return.
 */
export function buildMockSnapshot({ scenario, anchorDateKey } = {}) {
  const raw = buildMockRaw({ scenario, anchorDateKey });
  const anchor = anchorDateKey || todayLocalDateKey();
  const range = buildWorkingRange(anchor, { days: 7, skipWeekend: false });

  return {
    entities: normalizeSnapshot(raw),
    range,
    scenario: scenario ?? DEFAULT_SCENARIO,
    asOf: new Date().toISOString(),
  };
}

export { buildMockRaw };
