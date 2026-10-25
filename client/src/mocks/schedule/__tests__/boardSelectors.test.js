// The Today board's selectors over the mock snapshot: whole fleet, paired
// teams, the shared window cap, and the drop rules the Board enforces.

import { buildMockSnapshot } from '../index';
import { scheduleReducer, initialScheduleState, ACTIONS } from '../../../components/admin/schedule/scheduleReducer';
import {
  selectBoardMatrix, selectDropVerdict, selectTrayBlocks, selectOrderDetail,
  selectLorryDetail, selectMoveTargets, selectDropTarget, isNewSlotId,
} from '../../../utils/schedule/scheduleSelectors';
import { ISSUE } from '../../../utils/schedule/issueCodes';

const MONDAY = '2026-10-26';

// Pin "today" to the Monday so every day in the week is open for changes.
jest.mock('../../../utils/dateKey', () => {
  const actual = jest.requireActual('../../../utils/dateKey');
  return { ...actual, todayLocalDateKey: () => '2026-10-26' };
});

function loadState(scenario = 'normal') {
  const snapshot = buildMockSnapshot({ scenario, anchorDateKey: MONDAY });
  return scheduleReducer(initialScheduleState, {
    type: ACTIONS.LOAD_SUCCESS,
    payload: { ...snapshot, source: 'mock' },
  });
}

const rowsOf = matrix => matrix.rows;
const cellsOf = matrix => rowsOf(matrix).flatMap(r => r.cells);

describe('selectBoardMatrix', () => {
  const state = loadState();
  const matrix = selectBoardMatrix(state, '2026-10-27');

  it('shows every lorry in the fleet, busiest first, ties by size then plate', () => {
    const rows = rowsOf(matrix);
    expect(rows).toHaveLength(21);
    for (let i = 1; i < rows.length; i += 1) {
      const [a, b] = [rows[i - 1], rows[i]];
      expect(a.doCount).toBeGreaterThanOrEqual(b.doCount);
      if (a.doCount === b.doCount) expect(a.truck.tone ?? -1).toBeGreaterThanOrEqual(b.truck.tone ?? -1);
    }
  });

  it('always shows AM, PM and NIGHT; NIGHT is closed (grey, droppable) until it holds a DO', () => {
    expect(matrix.columns.map(c => c.windowId)).toEqual(['am', 'pm', 'night']);
    const night = matrix.columns.find(c => c.windowId === 'night');
    expect(night.open).toBe(false);
    expect(night.timeLabel).toBe('19:00–21:00');

    const wxx = rowsOf(matrix).find(r => r.truck.plate === 'WXX 1234');
    const cell = wxx.cells.find(c => c.windowId === 'night');
    expect(cell.state).toBe('nightclosed');
    expect(cell.reason).toBe('No night delivery');
    expect(cell.droppable).toBe(true);
    // The night total is uncapped and, empty, adds nothing to the day.
    const nightTotal = matrix.totals.find(t => t.windowId === 'night');
    expect(nightTotal.capped).toBe(false);
    expect(matrix.dayTotal.doCap).toBe(50);
  });

  it('opens NIGHT on the sample day and adds one to the day capacity per night DO', () => {
    // The mock opens tonight's NIGHT when today is in the week (pinned: Monday).
    const monday = selectBoardMatrix(state, MONDAY);
    const nightTotal = monday.totals.find(t => t.windowId === 'night');
    expect(monday.columns.find(c => c.windowId === 'night').open).toBe(true);
    expect(nightTotal.doCount).toBe(3);
    expect(nightTotal.doCap).toBeNull();
    expect(monday.dayTotal.doCap).toBe(50 + 3);
  });

  it('gives an empty cell a would-be slot that a drop can create', () => {
    const idle = rowsOf(matrix).find(r => r.doCount === 0 && r.teamState === 'ok');
    const cell = idle.cells.find(c => c.windowId === 'am');
    expect(cell.lane).toBeNull();
    expect(isNewSlotId(cell.slotId)).toBe(true);
    expect(cell.droppable).toBe(true);
  });

  it('takes each lorry’s team from the Information-panel pairing', () => {
    const wxx = rowsOf(matrix).find(r => r.truck.plate === 'WXX 1234');
    expect(wxx.team.name).toBe('Delivery Team A');
    expect(wxx.teamState).toBe('ok');
  });

  it('flags a crewless lorry and a lorry whose team is unavailable, and refuses drops on both', () => {
    const crewless = rowsOf(matrix).find(r => r.truck.id === 'tk-21');
    expect(crewless.teamState).toBe('none');
    expect(crewless.cells.every(c => !c.droppable)).toBe(true);

    const unavailable = rowsOf(matrix).find(r => r.truck.id === 'tk-08');
    expect(unavailable.teamState).toBe('unavailable');
    expect(unavailable.cells.every(c => c.state === 'noteam')).toBe(true);
  });

  it('totals each window across all lorries; AM and PM share the 25 cap', () => {
    for (const total of matrix.totals) {
      const summed = cellsOf(matrix)
        .filter(c => c.windowId === total.windowId)
        .reduce((n, c) => n + (c.lane?.capacity.doCount ?? 0), 0);
      expect(total.doCount).toBe(summed);
      expect(total.doCap).toBe(total.windowId === 'night' ? null : 25);
    }
  });

  it('collects pending DOs for "Approve all", and only pending ones are draggable', () => {
    const blocks = cellsOf(matrix).flatMap(c => c.blocks);
    expect(matrix.pendingOrderIds.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.draggable).toBe(block.state === 'pending');
    }
  });
});

describe('selectDropVerdict', () => {
  it('refuses a drop once the window has 25 DOs across all lorries', () => {
    const state = loadState('overbooked');
    const matrix = selectBoardMatrix(state, '2026-10-27');
    const full = matrix.totals.find(t => t.full);
    expect(full).toBeDefined();

    const [tray] = selectTrayBlocks(state);
    const openCell = cellsOf(matrix).find(c => c.windowId === full.windowId && c.droppable);
    const verdict = selectDropVerdict(state, tray.orderId, openCell.slotId);
    expect(verdict.ok).toBe(false);
    expect(verdict.blocking.map(i => i.code)).toContain(ISSUE.SLOT_DO_CAP_REACHED);
  });

  it('refuses a lorry with no paired team', () => {
    const state = loadState();
    const matrix = selectBoardMatrix(state, '2026-10-27');
    const crewless = rowsOf(matrix).find(r => r.truck.id === 'tk-21');
    const [tray] = selectTrayBlocks(state);
    const verdict = selectDropVerdict(state, tray.orderId, crewless.cells[0].slotId);
    expect(verdict.ok).toBe(false);
    expect(verdict.blocking.map(i => i.code)).toContain(ISSUE.TEAM_UNASSIGNED);
  });
});

describe('tray, details and lorry card', () => {
  const state = loadState();

  it('puts unscheduled and rejected DOs in the tray, rejected ones with their reason', () => {
    const tray = selectTrayBlocks(state);
    const rejected = tray.filter(b => b.state === 'rejected');
    expect(tray.length).toBeGreaterThan(rejected.length);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toBeTruthy();
    expect(tray.every(b => b.draggable)).toBe(true);
  });

  it('returns a rejected DO to the tray', () => {
    const matrix = selectBoardMatrix(state, '2026-10-27');
    const [orderId] = matrix.pendingOrderIds;
    const next = scheduleReducer(state, {
      type: ACTIONS.SET_APPROVAL,
      payload: { orderIds: [orderId], assignmentStatus: 'rejected', rejectReason: 'Customer rescheduled' },
    });
    expect(selectTrayBlocks(next).map(b => b.orderId)).toContain(orderId);
  });

  it('details a scheduled DO with its customer, lorry slot, ETA and items', () => {
    const matrix = selectBoardMatrix(state, '2026-10-27');
    const detail = selectOrderDetail(state, matrix.pendingOrderIds[0]);
    expect(detail.customer.name).toBeTruthy();
    expect(detail.slot).toBeTruthy();
    expect(detail.eta).toMatch(/^\d{2}:\d{2}$/);
    expect(detail.items.length).toBeGreaterThan(0);
  });

  it('gives the lorry card a driver and helper with phone numbers', () => {
    const lorry = selectLorryDetail(state, 'tk-01', '2026-10-27');
    expect(lorry.driver.phone).toBeTruthy();
    expect(lorry.helpers.length).toBeGreaterThan(0);
    expect(lorry.load.length).toBe(3);
  });

  it('notes when the crew changed after scheduling', () => {
    // Wednesday's busiest lorry had its slots generated with another team.
    const wednesday = selectBoardMatrix(state, '2026-10-28');
    const changed = rowsOf(wednesday).find(r => r.crewChanged);
    expect(changed).toBeDefined();
    expect(selectLorryDetail(state, changed.truck.id, '2026-10-28').crewChanged).toBe(true);
  });

  it('sorts the tray by Odoo’s expected date, earliest first', () => {
    const due = selectTrayBlocks(state).map(b => b.expectedDateKey);
    expect(due.every(Boolean)).toBe(true);
    expect([...due].sort()).toEqual(due);
  });

  it('flags a DO placed on a different date from the one Odoo expects', () => {
    const blocks = ['2026-10-27', '2026-10-28', '2026-10-29']
      .flatMap(d => cellsOf(selectBoardMatrix(state, d)).flatMap(c => c.blocks));
    const mismatched = blocks.filter(b => b.dateMismatch);
    expect(mismatched.length).toBeGreaterThan(0);
    expect(mismatched.length).toBeLessThan(blocks.length / 5);
  });

  it('describes a drop into closed NIGHT as starting a night delivery', () => {
    const [tray] = selectTrayBlocks(state);
    const wxx = rowsOf(selectBoardMatrix(state, '2026-10-27')).find(r => r.truck.plate === 'WXX 1234');
    const target = selectDropTarget(state, tray.orderId, wxx.cells.find(c => c.windowId === 'night').slotId);
    expect(target.startsNight).toBe(true);
    expect(target.isNew).toBe(true);
  });

  it('offers only slots that would accept the DO as "Move to…" targets', () => {
    const [tray] = selectTrayBlocks(state);
    for (const target of selectMoveTargets(state, tray.orderId, '2026-10-27')) {
      expect(selectDropVerdict(state, tray.orderId, target.slotId).ok).toBe(true);
    }
  });
});
