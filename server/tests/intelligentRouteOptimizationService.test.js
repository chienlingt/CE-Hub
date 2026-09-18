const test = require('node:test');
const assert = require('node:assert/strict');
const { selectBestSequence, shouldApplyDynamicRoute } = require('../services/intelligentRouteOptimizationService');

test('prioritises a hard access window over the geographically nearest stop', () => {
  const slot = { date: '2026-09-16', time_window_start: '08:00', time_window_end: '12:00' };
  const orders = [
    {
      id: 'window-first', truck_loading_sequence: 1,
      buildings: { access_time_window_start: '08:00', access_time_window_end: '08:30' },
      order_products: [],
    },
    {
      id: 'nearer', truck_loading_sequence: 2,
      buildings: { access_time_window_start: '08:00', access_time_window_end: '12:00' },
      order_products: [],
    },
  ];
  const metrics = {
    // origin, window-first, nearer
    durations: [[0, 600, 300], [600, 0, 300], [300, 1800, 0]],
    distances: [[0, 10000, 5000], [10000, 0, 5000], [5000, 20000, 0]],
  };
  const departure = new Date('2026-09-16T08:00:00+08:00').getTime();
  const best = selectBestSequence(orders, slot, metrics, departure);

  assert.deepEqual(best.sequence, [0, 1]);
  assert.equal(best.hardViolationSeconds, 0);
  assert.equal(best.stops[0].loading_sequence, 2);
  assert.equal(best.stops[1].loading_sequence, 1);
});

test('preserves route for insignificant gains but applies meaningful or feasibility improvements', () => {
  assert.equal(shouldApplyDynamicRoute({
    dynamic: true, hasExistingPlan: true, preventsViolation: false,
    savedSeconds: 120, savedRatio: 0.04,
  }), false);
  assert.equal(shouldApplyDynamicRoute({
    dynamic: true, hasExistingPlan: true, preventsViolation: false,
    savedSeconds: 601, savedRatio: 0.05,
  }), true);
  assert.equal(shouldApplyDynamicRoute({
    dynamic: true, hasExistingPlan: true, preventsViolation: true,
    savedSeconds: -60, savedRatio: -0.01,
  }), true);
});
