// End-to-end check of the data pipeline: generator -> normalizeSnapshot ->
// reducer -> selectors. If this passes, every surface is reading real numbers.

import { buildMockSnapshot, SCENARIOS } from '../index';
import { scheduleReducer, initialScheduleState, ACTIONS } from '../../../components/admin/schedule/scheduleReducer';
import {
  selectDaySummaries, selectKpis, selectGridMatrix,
  selectUnassignedOrders, selectOrderIdsBySlot,
} from '../../../utils/schedule/scheduleSelectors';
import { isWeekendDateKey } from '../../../utils/schedule/weekRange';

const ANCHOR = '2026-10-27';   // a Tuesday

function loadState(scenario = 'normal', anchorDateKey = ANCHOR) {
  const snapshot = buildMockSnapshot({ scenario, anchorDateKey });
  return scheduleReducer(initialScheduleState, {
    type: ACTIONS.LOAD_SUCCESS,
    payload: { ...snapshot, source: 'mock' },
  });
}

describe('buildMockSnapshot', () => {
  it('is deterministic — the same scenario renders identically every run', () => {
    const a = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    const b = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    expect(a.entities.orders.allIds).toEqual(b.entities.orders.allIds);
    expect(a.entities.slots.allIds).toEqual(b.entities.slots.allIds);
  });

  // The rule that must not bend: fixtures carry dayOffset, never dates, so the
  // demo is correct on any date. A hardcoded date would be dead next week.
  it('resolves against the anchor rather than any baked-in date', () => {
    const october = buildMockSnapshot({ scenario: 'normal', anchorDateKey: '2026-10-27' });
    const december = buildMockSnapshot({ scenario: 'normal', anchorDateKey: '2026-12-15' });

    expect(october.range.startDateKey).toBe('2026-10-26');   // Monday of that week
    expect(december.range.startDateKey).toBe('2026-12-14');
    expect(october.entities.slots.allIds.length).toBe(december.entities.slots.allIds.length);
  });

  // Weekends are delivery days like any other (stakeholder decision, B0).
  it('generates weekend slots like weekday ones', () => {
    const { entities, range } = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    expect(range.dateKeys).toHaveLength(7);
    const weekendSlots = entities.slots.allIds
      .map(id => entities.slots.byId[id])
      .filter(s => isWeekendDateKey(s.dateKey));
    expect(weekendSlots.length).toBeGreaterThan(0);
  });

  // A lorry has a slot only where it carries DOs, as the engine works.
  it('creates slots only where DOs are, and opens NIGHT only on the sample day', () => {
    const { entities } = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    const slots = entities.slots.allIds.map(id => entities.slots.byId[id]);
    const used = new Set(entities.orders.allIds.map(id => entities.orders.byId[id].slotId));
    expect(slots.every(s => used.has(s.id))).toBe(true);
    const nightDays = new Set(slots.filter(s => s.start === '19:00').map(s => s.dateKey));
    expect([...nightDays]).toEqual(['2026-10-28']);

    const paired = entities.teams.allIds.map(id => entities.teams.byId[id]).filter(t => t.truckId);
    expect(new Set(paired.map(t => t.truckId)).size).toBe(paired.length);   // one team per lorry
    expect(paired.length).toBe(entities.trucks.allIds.length - 1);         // one lorry left crewless
  });

  it('produces Mr Lee’s real volume, not a trivially empty grid', () => {
    const state = loadState('normal');
    const summaries = selectDaySummaries(state).filter(s => s.isWorkingDay);

    // Meeting_Outcomes.md §1: 70-80 DOs/day, occasionally 90, rarely over 100.
    const weekdays = summaries.filter(s => !s.isFarAreaDay).slice(0, 3);
    for (const day of weekdays) {
      expect(day.doCount).toBeGreaterThan(40);
      expect(day.doCount).toBeLessThan(110);
    }
    const total = summaries.reduce((n, s) => n + s.doCount, 0);
    expect(total).toBeGreaterThan(250);
  });

  it('gives every order a customer, building and at least one line item', () => {
    const { entities } = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    for (const id of entities.orders.allIds) {
      const order = entities.orders.byId[id];
      expect(entities.customers.byId[order.customerId]).toBeDefined();
      expect(entities.buildings.byId[order.buildingId]).toBeDefined();
      expect(order.items.length).toBeGreaterThan(0);
      for (const item of order.items) {
        expect(entities.products.byId[item.productId]).toBeDefined();
      }
    }
  });

  it('carries the fleet Mr Lee confirmed: 8 three-ton and 13 one-ton', () => {
    const { entities } = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    const trucks = entities.trucks.allIds.map(id => entities.trucks.byId[id]);
    expect(trucks.filter(t => t.tone === 3)).toHaveLength(8);
    expect(trucks.filter(t => t.tone === 1)).toHaveLength(13);
    expect(trucks).toHaveLength(21);
  });

  it('carries mock weights, so the payload meter is honest rather than derived', () => {
    const { entities } = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    for (const id of entities.products.allIds) {
      expect(entities.products.byId[id].weightKg).toBeGreaterThan(0);
    }
    for (const id of entities.trucks.allIds) {
      expect(entities.trucks.byId[id].maxPayloadKg).toBeGreaterThan(0);
    }
  });

  it('coerces building lat/lng from Prisma Decimal strings to numbers', () => {
    const { entities } = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    const building = entities.buildings.byId['b-02'];
    expect(typeof building.latitude).toBe('number');
    expect(typeof building.longitude).toBe('number');
    expect(building.latitude).toBeCloseTo(3.1073, 3);
  });

  it('spreads buildings across the Klang Valley zones the cluster story needs', () => {
    const { entities } = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    const zones = new Set(entities.buildings.allIds.map(id => entities.buildings.byId[id].zoneName));
    expect(zones).toContain('Petaling Jaya');
    expect(zones).toContain('Klang');
  });

  it('includes buildings with access windows and permit requirements', () => {
    const { entities } = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    const buildings = entities.buildings.allIds.map(id => entities.buildings.byId[id]);
    expect(buildings.filter(b => b.accessStart && b.accessEnd).length).toBeGreaterThan(3);
    expect(buildings.filter(b => b.permitRequired).length).toBeGreaterThan(0);
  });

  it('exposes every scenario named in the walkthrough script', () => {
    expect(Object.keys(SCENARIOS)).toEqual(
      expect.arrayContaining(['normal', 'overbooked', 'locked', 'exceptions', 'awaitingApproval']),
    );
  });
});

describe('scenarios differ in the way the demo needs', () => {
  it('overbooked pushes days over capacity', () => {
    const normal = selectDaySummaries(loadState('normal')).filter(s => s.isWorkingDay);
    const over = selectDaySummaries(loadState('overbooked')).filter(s => s.isWorkingDay);
    const overCapCount = over.filter(d => d.doCount > d.doCapacity).length;
    expect(overCapCount).toBeGreaterThan(0);
    expect(over[0].doCount).toBeGreaterThan(normal[0].doCount);
  });

  it('exceptions leaves a substantial unassigned pool', () => {
    expect(selectUnassignedOrders(loadState('exceptions')).length).toBeGreaterThan(10);
  });

  it('awaitingApproval leaves nothing approved, so the queue has content', () => {
    const state = loadState('awaitingApproval');
    const approved = state.entities.orders.allIds
      .filter(id => state.entities.orders.byId[id].assignmentStatus === 'approved');
    expect(approved).toHaveLength(0);
  });
});

describe('selectors over the mock snapshot', () => {
  const state = loadState('normal');

  it('computes a day summary with a capacity derived from its window count', () => {
    const summaries = selectDaySummaries(state);
    const working = summaries.filter(s => s.isWorkingDay);
    expect(working.length).toBeGreaterThan(0);

    for (const day of working) {
      // AM + PM share the cap; NIGHT is uncapped, each night DO adding one.
      const night = day.windows.find(w => w.windowId === 'night')?.doCount ?? 0;
      expect(day.doCapacity).toBe(2 * state.config.maxDOsPerSlot + night);
      expect(day.windows.length).toBeGreaterThan(0);
    }
  });

  it('treats the weekend as a delivery day, with orders on it', () => {
    const weekend = selectDaySummaries(state).filter(s => isWeekendDateKey(s.dateKey));
    expect(weekend).toHaveLength(2);
    for (const day of weekend) {
      expect(day.isWorkingDay).toBe(true);
      expect(day.doCount).toBeGreaterThan(0);
    }
  });

  it('keeps every window of a normal week within the shared 25-DO cap', () => {
    for (const day of selectDaySummaries(state)) {
      for (const window of day.windows) expect(window.doCount).toBeLessThanOrEqual(25);
    }
  });

  it('produces KPIs whose scheduled + unscheduled reconcile', () => {
    const kpis = selectKpis(state);
    const booked = kpis.find(k => k.id === 'booked').value;
    const scheduled = kpis.find(k => k.id === 'scheduled').value;
    const unscheduled = kpis.find(k => k.id === 'unscheduled').value;
    expect(scheduled + unscheduled).toBe(booked);
  });

  it('builds a grid matrix with one row group per rostered lorry', () => {
    const matrix = selectGridMatrix(state);
    expect(matrix.rowGroups.length).toBeGreaterThan(0);
    expect(matrix.dateKeys).toEqual(state.range.dateKeys);

    for (const group of matrix.rowGroups) {
      for (const row of group.rows) {
        expect(row.cells).toHaveLength(matrix.dateKeys.length);
      }
    }
  });

  it('reconciles the grid’s grand total with the sum of its row groups', () => {
    const matrix = selectGridMatrix(state);
    const summed = matrix.rowGroups.reduce((n, g) => n + g.total, 0);
    expect(matrix.grandTotal).toBe(summed);
  });

  it('closes no grid column when every day has slots', () => {
    const matrix = selectGridMatrix(state);
    expect(matrix.columnTotals.filter(c => c.closed)).toEqual([]);
  });

  it('assigns every slotted order to exactly one slot', () => {
    const grouped = selectOrderIdsBySlot(state);
    const seen = new Set();
    for (const ids of Object.values(grouped)) {
      for (const id of ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    const unassignedCount = selectUnassignedOrders(state).length;
    expect(seen.size + unassignedCount).toBe(state.entities.orders.allIds.length);
  });
});

describe('staged moves flow through the selectors', () => {
  it('moves an order between slots without mutating entities', () => {
    let state = loadState('normal');
    const grouped = selectOrderIdsBySlot(state);
    const [fromSlot, toSlot] = Object.keys(grouped);
    const orderId = grouped[fromSlot][0];

    state = scheduleReducer(state, {
      type: ACTIONS.STAGE_MOVE,
      payload: { orderId, toSlotId: toSlot },
    });

    const after = selectOrderIdsBySlot(state);
    expect(after[fromSlot]).not.toContain(orderId);
    expect(after[toSlot]).toContain(orderId);

    // entities untouched: the move lives in draft until committed.
    expect(state.entities.orders.byId[orderId].slotId).toBe(fromSlot);
    expect(state.draft.dirty).toBe(true);
  });

  it('un-stages a move that returns an order to where it started', () => {
    let state = loadState('normal');
    const grouped = selectOrderIdsBySlot(state);
    const [fromSlot, toSlot] = Object.keys(grouped);
    const orderId = grouped[fromSlot][0];

    state = scheduleReducer(state, { type: ACTIONS.STAGE_MOVE, payload: { orderId, toSlotId: toSlot } });
    state = scheduleReducer(state, { type: ACTIONS.STAGE_MOVE, payload: { orderId, toSlotId: fromSlot } });

    expect(state.draft.moves[orderId]).toBeUndefined();
    expect(state.draft.dirty).toBe(false);
  });

  it('a background refresh preserves staged moves rather than clobbering them', () => {
    let state = loadState('normal');
    const grouped = selectOrderIdsBySlot(state);
    const [fromSlot, toSlot] = Object.keys(grouped);
    const orderId = grouped[fromSlot][0];

    state = scheduleReducer(state, { type: ACTIONS.STAGE_MOVE, payload: { orderId, toSlotId: toSlot } });

    const fresh = buildMockSnapshot({ scenario: 'normal', anchorDateKey: ANCHOR });
    state = scheduleReducer(state, {
      type: ACTIONS.MERGE_SNAPSHOT,
      payload: { entities: fresh.entities, asOf: new Date().toISOString() },
    });

    expect(state.draft.moves[orderId]).toBeDefined();
    expect(selectOrderIdsBySlot(state)[toSlot]).toContain(orderId);
  });

  it('folds applied moves into entities on commit and keeps rejected ones staged', () => {
    let state = loadState('normal');
    const grouped = selectOrderIdsBySlot(state);
    const [fromSlot, toSlot] = Object.keys(grouped);
    const applied = grouped[fromSlot][0];
    const refused = grouped[fromSlot][1];

    state = scheduleReducer(state, { type: ACTIONS.STAGE_MOVE, payload: { orderId: applied, toSlotId: toSlot } });
    state = scheduleReducer(state, { type: ACTIONS.STAGE_MOVE, payload: { orderId: refused, toSlotId: toSlot } });

    state = scheduleReducer(state, {
      type: ACTIONS.COMMIT_RESULT,
      payload: {
        applied: [applied],
        rejected: [{ orderId: refused, code: 'TRUCK_UPGRADE_REQUIRED', message: 'No space.' }],
      },
    });

    expect(state.entities.orders.byId[applied].slotId).toBe(toSlot);
    expect(state.draft.moves[applied]).toBeUndefined();
    // Still staged, so the dispatcher can see and fix what the server refused.
    expect(state.draft.moves[refused]).toBeDefined();
    expect(state.draft.dirty).toBe(true);
  });
});
