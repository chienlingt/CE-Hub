// Verifies the live gateway against the REAL server response shapes, so the
// seeded-data path is not discovered broken during a walkthrough.
//
// fetch is stubbed per-path; the assertions are about the shapes the Express
// routes actually return, which were read from the server rather than assumed.

import liveScheduleGateway from '../liveScheduleGateway';

const SLOT = {
  id: 'slot-1',
  date: '2026-10-26',
  time_window_start: '08:00',
  time_window_end: '12:00',
  slot_status: 'scheduled',
  available_flag: true,
  truck_id: 'truck-1',
  delivery_team_id: 'team-1',
  route_version: 0,
};

const ORDER = {
  id: 'order-1',
  odoo_order_ref: 'DO-24001',
  order_status: 'Scheduled',
  assignment_status: 'assigned',
  time_slot_id: 'slot-1',
  customer_id: 'cust-1',
  building_id: 'bldg-1',
  truck_loading_sequence: 1,
  order_products: [{
    id: 1,
    order_id: 'order-1',
    product_id: 'prod-1',
    quantity: 2,
    service_type: 'delivery_installation',
    dismantle_required: true,
    dismantle_time_min: 20,
    dismantle_time_max: 30,
  }],
};

const BUILDING = {
  id: 'bldg-1',
  building_name: 'Sri Puteri Condominium',
  access_time_window_start: '10:00',
  access_time_window_end: '16:00',
  pre_registration_required: true,
  // Prisma Decimal columns serialise to JSON as STRINGS.
  latitude: '3.10730000',
  longitude: '101.63120000',
  zone: { zone_name: 'Petaling Jaya' },
};

const TRUCK = {
  id: 'truck-1', plate_no: 'WXX 1234', tone: 3,
  length_cm: 420, width_cm: 190, height_cm: 200, off_day: null,
};

const PRODUCT = {
  id: 'prod-1', product_name: 'Front Load Washer',
  package_length_cm: 68, package_width_cm: 70, package_height_cm: 90,
  installer_team_required_flag: true,
  estimated_installation_time_min: 80, estimated_installation_time_max: 100,
};

/** Route a stubbed fetch by path, with per-test overrides. */
function stubFetch(overrides = {}) {
  return jest.fn(async (url, options = {}) => {
    const path = String(url).split('/api/')[1] ?? '';
    const method = options.method ?? 'GET';
    const key = `${method} ${path.split('?')[0]}`;

    if (overrides[key]) return overrides[key];

    const json = (body, ok = true, status = 200) => ({
      ok, status,
      headers: { get: () => 'application/json' },
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    switch (path.split('?')[0]) {
      case 'time-slots':  return json([SLOT]);
      case 'orders':      return json([ORDER]);
      case 'trucks':      return json([TRUCK]);
      case 'teams':       return json([{ id: 'team-1', team_type: 'Delivery Team A', available_flag: true, primary_driver_id: 'emp-1' }]);
      case 'employees':   return json([{ id: 'emp-1', name: 'Razif', role: { name: 'Installer' } }]);
      case 'assignments': return json([{ employee_id: 'emp-1', team_id: 'team-1' }]);
      case 'buildings':   return json([BUILDING]);
      case 'customers':   return json([{ id: 'cust-1', full_name: 'Nurul Aina' }]);
      case 'products':    return json([PRODUCT]);
      case 'scheduler/config':
        return json({ success: true, config: {
          warehouse_address: 'Lot 33, Shah Alam', warehouse_postal: '40000',
          cron_expression: '0 0 * * *', enabled: true, last_run_at: '2026-10-24T16:00:00Z',
        } });
      default:
        return json({}, false, 404);
    }
  });
}

const jsonResponse = (body, ok = true, status = 200) => ({
  ok, status,
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
});

describe('loadSnapshot', () => {
  it('normalizes every collection into the store shape', async () => {
    global.fetch = stubFetch();
    const snapshot = await liveScheduleGateway.loadSnapshot({ startDateKey: '2026-10-26' });

    expect(snapshot.entities.slots.allIds).toEqual(['slot-1']);
    expect(snapshot.entities.orders.allIds).toEqual(['order-1']);
    expect(snapshot.entities.trucks.byId['truck-1'].plate).toBe('WXX 1234');
    expect(snapshot.scenario).toBeNull();
    expect(snapshot.asOf).toBeTruthy();
  });

  it('coerces Prisma Decimal lat/lng strings to numbers', async () => {
    global.fetch = stubFetch();
    const snapshot = await liveScheduleGateway.loadSnapshot({ startDateKey: '2026-10-26' });
    const building = snapshot.entities.buildings.byId['bldg-1'];

    // Without coercion these stay strings and every distance calculation breaks.
    expect(typeof building.latitude).toBe('number');
    expect(building.latitude).toBeCloseTo(3.1073, 4);
    expect(building.zoneName).toBe('Petaling Jaya');
    expect(building.permitRequired).toBe(true);
  });

  it('reads order_products embedded by include_products=true', async () => {
    global.fetch = stubFetch();
    const snapshot = await liveScheduleGateway.loadSnapshot({ startDateKey: '2026-10-26' });
    const order = snapshot.entities.orders.byId['order-1'];

    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      productId: 'prod-1',
      quantity: 2,
      serviceType: 'delivery_installation',
      // The real columns, not the phantom custom_dismantle_time.
      dismantleMinutesMin: 20,
      dismantleMinutesMax: 30,
    });
  });

  it('requests orders with products embedded, saving a round trip', async () => {
    global.fetch = stubFetch();
    await liveScheduleGateway.loadSnapshot({ startDateKey: '2026-10-26' });
    const urls = global.fetch.mock.calls.map(c => String(c[0]));
    expect(urls.some(u => u.includes('orders?include_products=true'))).toBe(true);
  });

  // GET /api/time-slots has no date filter, so the range must be applied here.
  it('filters slots to the requested week', async () => {
    global.fetch = stubFetch({
      'GET time-slots': jsonResponse([
        SLOT,
        { ...SLOT, id: 'slot-old', date: '2026-09-01' },
        { ...SLOT, id: 'slot-future', date: '2027-01-15' },
        { ...SLOT, id: 'slot-nodate', date: null },
      ]),
    });

    const snapshot = await liveScheduleGateway.loadSnapshot({ startDateKey: '2026-10-26' });
    expect(snapshot.entities.slots.allIds).toEqual(['slot-1']);
  });

  it('degrades a failed collection to empty rather than blanking the board', async () => {
    global.fetch = stubFetch({
      'GET trucks': Promise.reject(new Error('boom')),
    });

    const snapshot = await liveScheduleGateway.loadSnapshot({ startDateKey: '2026-10-26' });
    expect(snapshot.entities.trucks.allIds).toEqual([]);
    // Everything else still arrives.
    expect(snapshot.entities.orders.allIds).toEqual(['order-1']);
  });
});

describe('loadConfig', () => {
  it('merges the server config with the locally-held tuning knobs', async () => {
    global.fetch = stubFetch();
    localStorage.setItem('ce.schedule.config', JSON.stringify({ graceMinutes: 42 }));

    const config = await liveScheduleGateway.loadConfig();

    expect(config.warehouse.address).toBe('Lot 33, Shah Alam');
    expect(config.cronExpression).toBe('0 0 * * *');
    expect(config.autoEnabled).toBe(true);
    expect(config.graceMinutes).toBe(42);
    // Honest: part of this is not persisted server-side yet.
    expect(config.configScope).toBe('local');
  });

  it('still returns usable defaults when the config endpoint fails', async () => {
    global.fetch = stubFetch({ 'GET scheduler/config': jsonResponse({}, false, 500) });
    const config = await liveScheduleGateway.loadConfig();
    expect(config.maxDOsPerSlot).toBe(25);
    expect(config.warehouse.address).toBe('');
  });
});

describe('saveConfig', () => {
  it('sends only server-backed fields to the API', async () => {
    global.fetch = stubFetch({ 'PUT scheduler/config': jsonResponse({ success: true }) });

    await liveScheduleGateway.saveConfig({
      cronExpression: '0 17 * * *',
      graceMinutes: 30,          // no column for this yet
    });

    const put = global.fetch.mock.calls.find(c => c[1]?.method === 'PUT');
    expect(put).toBeDefined();
    const body = JSON.parse(put[1].body);
    expect(body).toEqual({ cron_expression: '0 17 * * *' });
    expect(body.graceMinutes).toBeUndefined();
  });

  it('persists the local-only knobs to localStorage', async () => {
    global.fetch = stubFetch();
    await liveScheduleGateway.saveConfig({ graceMinutes: 30, maxDOsPerSlot: 20 });

    const stored = JSON.parse(localStorage.getItem('ce.schedule.config'));
    expect(stored).toMatchObject({ graceMinutes: 30, maxDOsPerSlot: 20 });
  });

  it('does not call the API when nothing server-backed changed', async () => {
    global.fetch = stubFetch();
    await liveScheduleGateway.saveConfig({ graceMinutes: 30 });
    expect(global.fetch.mock.calls.some(c => c[1]?.method === 'PUT')).toBe(false);
  });
});

describe('commitMoves', () => {
  it('reassigns via PATCH, not PUT', async () => {
    global.fetch = stubFetch({ 'PATCH orders/order-1': jsonResponse({ success: true }) });

    const result = await liveScheduleGateway.commitMoves([
      { orderId: 'order-1', fromSlotId: 'slot-0', toSlotId: 'slot-1' },
    ]);

    expect(result.applied).toEqual(['order-1']);
    const call = global.fetch.mock.calls.find(c => c[1]?.method === 'PATCH');
    expect(call).toBeDefined();
    expect(JSON.parse(call[1].body)).toEqual({ time_slot_id: 'slot-1' });
  });

  it('unassigns by sending a null time_slot_id', async () => {
    global.fetch = stubFetch({ 'PATCH orders/order-1': jsonResponse({ success: true }) });
    await liveScheduleGateway.commitMoves([{ orderId: 'order-1', toSlotId: null }]);

    const call = global.fetch.mock.calls.find(c => c[1]?.method === 'PATCH');
    expect(JSON.parse(call[1].body)).toEqual({ time_slot_id: null });
  });

  // The flow Schedule.js:536 handled with window.confirm. The error BODY carries
  // the code, which is why this path cannot use the throwing apiFetch helper.
  it('surfaces TRUCK_UPGRADE_REQUIRED with the recommended tone', async () => {
    global.fetch = stubFetch({
      'PATCH orders/order-1': jsonResponse(
        { success: false, code: 'TRUCK_UPGRADE_REQUIRED', error: 'Truck space not enough.', recommended_tone: 3 },
        false, 409,
      ),
    });

    const result = await liveScheduleGateway.commitMoves([{ orderId: 'order-1', toSlotId: 'slot-1' }]);

    expect(result.applied).toEqual([]);
    expect(result.rejected[0]).toMatchObject({
      orderId: 'order-1',
      code: 'TRUCK_UPGRADE_REQUIRED',
      recovery: { recommendedTone: 3 },
    });
  });

  it('reports per-order results so a partial batch is legible', async () => {
    global.fetch = stubFetch({
      'PATCH orders/order-1': jsonResponse({ success: true }),
      'PATCH orders/order-2': jsonResponse({ success: false, error: 'Nope.' }, false, 400),
    });

    const result = await liveScheduleGateway.commitMoves([
      { orderId: 'order-1', toSlotId: 'slot-1' },
      { orderId: 'order-2', toSlotId: 'slot-1' },
    ]);

    expect(result.applied).toEqual(['order-1']);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].orderId).toBe('order-2');
  });

  it('treats a network failure as a rejection rather than throwing', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
    const result = await liveScheduleGateway.commitMoves([{ orderId: 'order-1', toSlotId: 'slot-1' }]);
    expect(result.rejected[0].message).toMatch(/offline/);
  });
});

describe('runAutoSchedule', () => {
  it('maps the engine response', async () => {
    global.fetch = stubFetch({
      'POST scheduler/run': jsonResponse({
        success: true,
        results: { scheduled: 12, unscheduled: 3, warnings: ['3 orders deferred'] },
      }),
    });

    const result = await liveScheduleGateway.runAutoSchedule();
    expect(result).toMatchObject({ scheduled: 12, unscheduled: 3, warnings: ['3 orders deferred'] });
  });

  it('throws with the server message when the run fails', async () => {
    global.fetch = stubFetch({
      'POST scheduler/run': jsonResponse({ error: 'Scheduler crashed' }, false, 500),
    });
    await expect(liveScheduleGateway.runAutoSchedule()).rejects.toThrow('Scheduler crashed');
  });
});

describe('approveOrders', () => {
  it('approves each order through the existing endpoint', async () => {
    global.fetch = stubFetch({ 'POST orders/order-1/approve': jsonResponse({ success: true }) });
    const result = await liveScheduleGateway.approveOrders(['order-1']);
    expect(result.applied).toEqual(['order-1']);
  });

  // routes/orders.js:1641 refuses an order with no timeslot; its wording is
  // more useful to the user than anything we could substitute.
  it('passes the server’s own refusal through verbatim', async () => {
    global.fetch = stubFetch({
      'POST orders/order-1/approve': jsonResponse(
        { error: 'Cannot approve — order has no timeslot assigned yet.' }, false, 400,
      ),
    });

    const result = await liveScheduleGateway.approveOrders(['order-1']);
    expect(result.applied).toEqual([]);
    expect(result.rejected[0].message).toMatch(/no timeslot assigned/);
  });
});

describe('rejectOrders', () => {
  // There is no reject endpoint. Failing loudly beats silently pretending —
  // Mr Lee would otherwise believe a trip was turned down when nothing changed.
  it('refuses clearly instead of pretending to succeed', async () => {
    global.fetch = stubFetch();
    const result = await liveScheduleGateway.rejectOrders(['order-1'], 'Lorry needed elsewhere');

    expect(result.applied).toEqual([]);
    expect(result.rejected[0].code).toBe('NOT_IMPLEMENTED');
    expect(result.rejected[0].message).toMatch(/does not exist on the server/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
