import { validateAssignment, evaluateSlotFeasibility } from '../validateAssignment';
import { ISSUE } from '../issueCodes';

// Mirrors seedDemo.js's fleet so the numbers are recognisable.
const TRUCK_3T = {
  id: 't3', plate: 'WXX 1234', tone: 3,
  lengthCm: 420, widthCm: 190, heightCm: 200,   // 15.96 m³
  maxPayloadKg: 3000, offDay: null,
};
const TRUCK_1T = {
  id: 't1', plate: 'WYY 5678', tone: 1,
  lengthCm: 280, widthCm: 160, heightCm: 170,   // 7.616 m³
  maxPayloadKg: 1000, offDay: 'Sunday',
};

const PRODUCTS = {
  tv:     { id: 'tv',     packageLengthCm: 120, packageWidthCm: 20,  packageHeightCm: 80,  weightKg: 18 },
  fridge: { id: 'fridge', packageLengthCm: 80,  packageWidthCm: 80,  packageHeightCm: 180, weightKg: 95 },
  washer: {
    id: 'washer', packageLengthCm: 70, packageWidthCm: 70, packageHeightCm: 90, weightKg: 75,
    installerRequired: true, installMinutesMin: 80, installMinutesMax: 100,
  },
  // Deliberately heavy and bulky, for pushing a slot over its limits.
  sofa:   { id: 'sofa',   packageLengthCm: 240, packageWidthCm: 110, packageHeightCm: 90, weightKg: 400 },
};

const EMPLOYEES = {
  e1: { id: 'e1', name: 'Razif',  roleName: 'Delivery Team' },
  e2: { id: 'e2', name: 'Suresh', roleName: 'Installer' },
  e3: { id: 'e3', name: 'Ah Meng', roleName: 'Delivery Team' },
};

const TEAM_WITH_INSTALLER = { id: 'teamA', name: 'Team A', memberIds: ['e1', 'e2'], availableFlag: true };
const TEAM_NO_INSTALLER   = { id: 'teamB', name: 'Team B', memberIds: ['e1', 'e3'], availableFlag: true };

const BUILDING_OPEN = { id: 'bOpen', name: 'Terrace house', accessStart: null, accessEnd: null };
const BUILDING_CONDO = {
  id: 'bCondo', name: 'Sri Puteri Condo',
  accessStart: '10:00', accessEnd: '16:00', permitRequired: true,
};
const BUILDING_TIGHT = {
  id: 'bTight', name: 'Mid Valley Residence',
  accessStart: '08:00', accessEnd: '09:00',
};

const AM_SLOT = {
  id: 's-am', dateKey: '2026-10-27', start: '08:00', end: '12:00',
  status: 'scheduled', truckId: 't3', teamId: 'teamA',
};

const codes = (list) => list.map(i => i.code);

function order(overrides = {}) {
  return {
    id: 'o-new', doNo: 'DO-0001', status: 'Pending', assignmentStatus: 'unassigned',
    buildingId: 'bOpen',
    items: [{ productId: 'tv', quantity: 1, serviceType: 'delivery_only' }],
    ...overrides,
  };
}

function run(overrides = {}) {
  return validateAssignment({
    order: order(),
    targetSlot: AM_SLOT,
    slotOrders: [],
    truck: TRUCK_3T,
    team: TEAM_WITH_INSTALLER,
    building: BUILDING_OPEN,
    productsById: PRODUCTS,
    employeesById: EMPLOYEES,
    config: {},
    ...overrides,
  });
}

describe('validateAssignment — happy path', () => {
  it('accepts a simple delivery into an empty, well-resourced slot', () => {
    const result = run();
    expect(result.ok).toBe(true);
    expect(result.blocking).toEqual([]);
  });

  it('reports the projected arrival and finish', () => {
    const result = run();
    expect(result.projected.arrival).toMatch(/^\d{2}:\d{2}$/);
    expect(result.projected.finish).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns a capacity breakdown for the drag preview', () => {
    const result = run();
    expect(result.capacity).toMatchObject({ doCount: 1, doCap: 25 });
    expect(result.capacity.volumePct).toBeGreaterThan(0);
    expect(result.capacity.volumePct).toBeLessThan(1);
  });

  it('refuses gracefully when the order or slot is missing', () => {
    expect(validateAssignment({ order: null, targetSlot: AM_SLOT }).ok).toBe(false);
    expect(validateAssignment({ order: order(), targetSlot: null }).ok).toBe(false);
  });
});

describe('lock rules — the "Delivering must be locked" requirement', () => {
  it('blocks a slot whose status is out_for_delivery', () => {
    const result = run({ targetSlot: { ...AM_SLOT, status: 'out_for_delivery' } });
    expect(result.ok).toBe(false);
    expect(codes(result.blocking)).toContain(ISSUE.SLOT_LOCKED);
  });

  it('blocks a completed slot distinctly from a departed one', () => {
    const result = run({ targetSlot: { ...AM_SLOT, status: 'completed' } });
    expect(codes(result.blocking)).toContain(ISSUE.SLOT_COMPLETED);
  });

  // The slot's own status and its orders' statuses can disagree in real data,
  // so either signal alone must lock it.
  it('blocks on an order already Delivering even when the slot still says scheduled', () => {
    const result = run({
      slotOrders: [{ id: 'o-live', status: 'Delivering', items: [] }],
    });
    expect(result.ok).toBe(false);
    expect(codes(result.blocking)).toContain(ISSUE.SLOT_LOCKED);
  });

  it.each(['Loaded', 'Installing', 'In Progress'])(
    'blocks on an in-flight order in %s', (status) => {
      const result = run({ slotOrders: [{ id: 'x', status, items: [] }] });
      expect(codes(result.blocking)).toContain(ISSUE.SLOT_LOCKED);
    },
  );

  // When every live order has finished, the slot reports the more specific
  // "completed" rather than "locked". Both refuse the drop.
  it.each(['Delivered', 'Failed'])(
    'reports a slot whose only order is %s as completed', (status) => {
      const result = run({ slotOrders: [{ id: 'x', status, items: [] }] });
      expect(result.ok).toBe(false);
      expect(codes(result.blocking)).toContain(ISSUE.SLOT_COMPLETED);
    },
  );

  it('still reports locked when finished and in-flight orders are mixed', () => {
    const result = run({
      slotOrders: [
        { id: 'done', status: 'Delivered', items: [] },
        { id: 'live', status: 'Delivering', items: [] },
      ],
    });
    expect(codes(result.blocking)).toContain(ISSUE.SLOT_LOCKED);
  });

  it('does NOT lock on orders that are merely Pending or Scheduled', () => {
    const result = run({
      slotOrders: [
        { id: 'a', status: 'Pending', items: [] },
        { id: 'b', status: 'Scheduled', items: [] },
      ],
    });
    expect(codes(result.blocking)).not.toContain(ISSUE.SLOT_LOCKED);
  });
});

describe('capacity rules', () => {
  // The 25-DO cap is per date + window across ALL lorries, not per lorry.
  const busyWindow = (n) => Array.from({ length: n }, (_, i) => ({
    id: `w${i}`, status: 'Scheduled', items: [],
  }));

  it('blocks when the window is already at its DO cap across lorries', () => {
    // This lorry is empty; the other lorries in the window hold 25 DOs.
    const result = run({ slotOrders: [], windowOrders: busyWindow(25) });
    expect(result.ok).toBe(false);
    expect(codes(result.blocking)).toContain(ISSUE.SLOT_DO_CAP_REACHED);
  });

  it('does not cap DOs on a single lorry — only volume and weight limit it', () => {
    const slotOrders = busyWindow(25);
    const result = run({ slotOrders, windowOrders: slotOrders, config: { maxDOsPerSlot: 30 } });
    expect(codes(result.blocking)).not.toContain(ISSUE.SLOT_DO_CAP_REACHED);
  });

  it('does not count the order twice when it is already in the window', () => {
    const windowOrders = [...busyWindow(24), order()];
    const result = run({ windowOrders });
    expect(codes(result.blocking)).not.toContain(ISSUE.SLOT_DO_CAP_REACHED);
  });

  it('skips the cap when the caller cannot see the window', () => {
    const result = run({ slotOrders: busyWindow(30) });
    expect(codes(result.blocking)).not.toContain(ISSUE.SLOT_DO_CAP_REACHED);
  });

  it('respects a configured cap other than 25', () => {
    const result = run({ windowOrders: busyWindow(1), config: { maxDOsPerSlot: 1 } });
    expect(codes(result.blocking)).toContain(ISSUE.SLOT_DO_CAP_REACHED);
  });

  it('blocks when the items overflow the lorry’s load space', () => {
    // 1-ton lorry is 7.616 m³; four sofas are ~9.5 m³.
    const result = run({
      truck: TRUCK_1T,
      order: order({ items: [{ productId: 'sofa', quantity: 4, serviceType: 'delivery_only' }] }),
    });
    expect(result.ok).toBe(false);
    expect(codes(result.blocking)).toContain(ISSUE.TRUCK_VOLUME_EXCEEDED);
  });

  it('blocks when the items overflow the payload (the "Overweight" reason)', () => {
    // 3 sofas = 1200 kg against a 1000 kg payload, but only ~7.1 m³ so volume is fine.
    const result = run({
      truck: TRUCK_1T,
      order: order({ items: [{ productId: 'sofa', quantity: 3, serviceType: 'delivery_only' }] }),
    });
    expect(codes(result.blocking)).toContain(ISSUE.TRUCK_TONNAGE_EXCEEDED);
    expect(codes(result.blocking)).not.toContain(ISSUE.TRUCK_VOLUME_EXCEEDED);
  });

  it('counts orders already in the slot toward the projected load', () => {
    const existing = {
      id: 'o-existing', status: 'Scheduled',
      items: [{ productId: 'sofa', quantity: 2, serviceType: 'delivery_only' }],
    };
    const result = run({
      truck: TRUCK_1T,
      slotOrders: [existing],
      order: order({ items: [{ productId: 'sofa', quantity: 1, serviceType: 'delivery_only' }] }),
    });
    expect(codes(result.blocking)).toContain(ISSUE.TRUCK_TONNAGE_EXCEEDED);
  });

  // A slot holding only cancellations is effectively empty: its load must not
  // count, and it must not read as "completed" and lock itself.
  it('ignores cancelled orders when computing the load, and stays editable', () => {
    const cancelled = {
      id: 'o-cancelled', status: 'Cancelled',
      items: [{ productId: 'sofa', quantity: 10, serviceType: 'delivery_only' }],
    };
    const result = run({ slotOrders: [cancelled] });
    expect(result.ok).toBe(true);
    expect(codes(result.blocking)).not.toContain(ISSUE.SLOT_COMPLETED);
    expect(result.capacity.doCount).toBe(1);   // only the newly placed order
  });

  it('warns rather than blocks when weight data is missing', () => {
    const noWeight = { nw: { id: 'nw', packageLengthCm: 10, packageWidthCm: 10, packageHeightCm: 10 } };
    const result = run({
      productsById: { ...PRODUCTS, ...noWeight },
      order: order({ items: [{ productId: 'nw', quantity: 1, serviceType: 'delivery_only' }] }),
    });
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).toContain(ISSUE.WEIGHT_DATA_MISSING);
    expect(result.capacity.weightKnown).toBe(false);
  });

  it('blocks when the work overruns the usable slot window', () => {
    // AM slot is 240 min; minus 20 load + 10 unload + 10 buffer = 200 usable.
    const manyWashers = Array.from({ length: 3 }, (_, i) => ({
      id: `w${i}`, status: 'Scheduled',
      items: [{ productId: 'washer', quantity: 1, serviceType: 'delivery_installation' }],
    }));
    const result = run({ slotOrders: manyWashers });
    expect(codes(result.blocking)).toContain(ISSUE.SERVICE_TIME_OVERFLOW);
  });
});

describe('resource availability', () => {
  it('blocks a lorry on its off day', () => {
    // 2026-11-01 is a Sunday; TRUCK_1T has off_day 'Sunday'.
    const result = run({
      truck: TRUCK_1T,
      targetSlot: { ...AM_SLOT, dateKey: '2026-11-01' },
    });
    expect(codes(result.blocking)).toContain(ISSUE.TRUCK_OFF_DAY);
  });

  it('blocks a lorry blocked by an admin override', () => {
    const result = run({
      config: { fleetOverrides: { t3: [{ from: '2026-10-26', to: '2026-10-28', reason: 'Servicing' }] } },
    });
    expect(codes(result.blocking)).toContain(ISSUE.TRUCK_OFF_DAY);
    expect(result.blocking.find(i => i.code === ISSUE.TRUCK_OFF_DAY).detail).toBe('Servicing');
  });

  it('ignores an override outside the date range', () => {
    const result = run({
      config: { fleetOverrides: { t3: [{ from: '2026-11-10', to: '2026-11-12', reason: 'Servicing' }] } },
    });
    expect(codes(result.blocking)).not.toContain(ISSUE.TRUCK_OFF_DAY);
  });

  it('blocks an unavailable crew', () => {
    const result = run({ team: { ...TEAM_WITH_INSTALLER, availableFlag: false } });
    expect(codes(result.blocking)).toContain(ISSUE.TEAM_UNAVAILABLE);
  });

  it('warns when no crew is assigned yet, rather than blocking', () => {
    const result = run({ team: null });
    expect(codes(result.warnings)).toContain(ISSUE.TEAM_UNASSIGNED);
    expect(result.ok).toBe(true);
  });

  it('warns when no lorry is assigned, since capacity cannot be checked', () => {
    const result = run({ truck: null, slotOrders: [{ id: 'a', status: 'Scheduled', items: [] }] });
    expect(codes(result.warnings)).toContain(ISSUE.TRUCK_UNASSIGNED);
  });
});

describe('crew skill match', () => {
  it('blocks an install order when the crew has no installer', () => {
    const result = run({
      team: TEAM_NO_INSTALLER,
      order: order({ items: [{ productId: 'washer', quantity: 1, serviceType: 'delivery_installation' }] }),
    });
    expect(result.ok).toBe(false);
    expect(codes(result.blocking)).toContain(ISSUE.INSTALLER_TEAM_MISSING);
  });

  it('allows the same order for a crew that has one', () => {
    const result = run({
      team: TEAM_WITH_INSTALLER,
      order: order({ items: [{ productId: 'washer', quantity: 1, serviceType: 'delivery_installation' }] }),
    });
    expect(codes(result.blocking)).not.toContain(ISSUE.INSTALLER_TEAM_MISSING);
  });

  it('does not require an installer for a plain delivery', () => {
    const result = run({ team: TEAM_NO_INSTALLER });
    expect(result.ok).toBe(true);
  });
});

describe('building access windows', () => {
  it('blocks when the projected finish falls after the building closes', () => {
    const result = run({
      building: BUILDING_TIGHT,   // 08:00-09:00, slot starts 08:00 + 20 min load
      order: order({
        buildingId: 'bTight',
        items: [{ productId: 'washer', quantity: 1, serviceType: 'delivery_installation' }],
      }),
    });
    expect(result.ok).toBe(false);
    expect(codes(result.blocking)).toContain(ISSUE.ACCESS_WINDOW_MISS);
  });

  it('blocks when arrival is before the building opens', () => {
    const result = run({
      building: BUILDING_CONDO,   // opens 10:00; AM slot arrival is ~08:20
      order: order({ buildingId: 'bCondo' }),
    });
    expect(codes(result.blocking)).toContain(ISSUE.ACCESS_WINDOW_MISS);
  });

  // The grace period's whole purpose: absorb the gap between planning and driving.
  it('a large enough grace period rescues a near-miss', () => {
    const base = {
      building: BUILDING_CONDO,
      order: order({ buildingId: 'bCondo' }),
    };
    expect(run({ ...base, config: { graceMinutes: 15 } }).ok).toBe(false);
    expect(run({ ...base, config: { graceMinutes: 180 } }).ok).toBe(true);
  });

  it('surfaces a permit requirement as a warning, not a block', () => {
    const result = run({
      building: { ...BUILDING_CONDO, accessStart: null, accessEnd: null },
      order: order({ buildingId: 'bCondo' }),
    });
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).toContain(ISSUE.PERMIT_REQUIRED);
  });

  // vehicle_size_limit is free text in the schema and never parsed, so it
  // cannot be a hard check — advisory only.
  it('surfaces a vehicle size limit as advisory only', () => {
    const result = run({
      building: { ...BUILDING_OPEN, vehicleSizeLimit: '3 ton max, basement 2.1m' },
    });
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).toContain(ISSUE.VEHICLE_SIZE_ADVISORY);
  });

  it('imposes no window when the building records none', () => {
    const result = run({ building: BUILDING_OPEN });
    expect(codes(result.blocking)).not.toContain(ISSUE.ACCESS_WINDOW_MISS);
  });

  it('prefers B.2’s ETA over the internal estimate when a route plan exists', () => {
    const result = run({
      building: BUILDING_CONDO,
      order: order({ buildingId: 'bCondo' }),
      targetSlot: {
        ...AM_SLOT,
        routePlan: { stops: [{ orderId: 'o-new', eta: '10:30' }] },
      },
    });
    // 10:30 is inside the condo's 10:00-16:00 window, so B.2's ETA rescues it.
    expect(codes(result.blocking)).not.toContain(ISSUE.ACCESS_WINDOW_MISS);
    expect(result.projected.arrival).toBe('10:30');
  });
});

describe('moving an order already in the slot', () => {
  it('does not double-count it against capacity', () => {
    const existing = order({
      id: 'o-mine', status: 'Scheduled',
      items: [{ productId: 'sofa', quantity: 2, serviceType: 'delivery_only' }],
    });
    const result = validateAssignment({
      order: existing,
      targetSlot: AM_SLOT,
      slotOrders: [existing],
      truck: TRUCK_1T,
      team: TEAM_WITH_INSTALLER,
      building: BUILDING_OPEN,
      productsById: PRODUCTS,
      employeesById: EMPLOYEES,
    });
    expect(result.capacity.doCount).toBe(1);
    expect(codes(result.blocking)).not.toContain(ISSUE.TRUCK_TONNAGE_EXCEEDED);
  });
});

describe('issue de-duplication', () => {
  it('never reports the same code and detail twice', () => {
    const result = run({
      building: { ...BUILDING_CONDO },
      order: order({ buildingId: 'bCondo' }),
    });
    const keys = [...result.blocking, ...result.warnings].map(i => `${i.code}|${i.detail}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('evaluateSlotFeasibility', () => {
  const args = {
    slot: AM_SLOT,
    orders: [order({ id: 'a', status: 'Scheduled' })],
    truck: TRUCK_3T,
    team: TEAM_WITH_INSTALLER,
    buildingsById: { bOpen: BUILDING_OPEN },
    productsById: PRODUCTS,
    employeesById: EMPLOYEES,
  };

  it('returns the §5 constraint checklist', () => {
    const checks = evaluateSlotFeasibility(args);
    expect(checks.map(c => c.id)).toEqual([
      'booked-slot', 'access-window', 'do-cap', 'team-availability',
      'skill-match', 'truck-availability', 'truck-capacity',
      'service-duration', 'editable',
    ]);
  });

  it('passes every check for a healthy slot', () => {
    expect(evaluateSlotFeasibility(args).every(c => c.ok)).toBe(true);
  });

  it('fails the skill check and names the count', () => {
    const checks = evaluateSlotFeasibility({
      ...args,
      team: TEAM_NO_INSTALLER,
      orders: [order({
        id: 'a', status: 'Scheduled',
        items: [{ productId: 'washer', quantity: 1, serviceType: 'delivery_installation' }],
      })],
    });
    const skill = checks.find(c => c.id === 'skill-match');
    expect(skill.ok).toBe(false);
    expect(skill.detail).toMatch(/1 order\(s\) need an installer/);
  });

  it('fails the editable check for a departed slot', () => {
    const checks = evaluateSlotFeasibility({
      ...args,
      slot: { ...AM_SLOT, status: 'out_for_delivery' },
    });
    expect(checks.find(c => c.id === 'editable').ok).toBe(false);
  });

  it('reports no-lorry and no-crew rather than claiming they pass', () => {
    const checks = evaluateSlotFeasibility({ ...args, truck: null, team: null });
    expect(checks.find(c => c.id === 'truck-availability')).toMatchObject({ ok: false, detail: 'No lorry assigned' });
    expect(checks.find(c => c.id === 'team-availability')).toMatchObject({ ok: false, detail: 'No crew assigned' });
  });

  it('says weight is unknown rather than showing a fabricated figure', () => {
    const checks = evaluateSlotFeasibility({
      ...args,
      truck: { ...TRUCK_3T, maxPayloadKg: null },
    });
    expect(checks.find(c => c.id === 'truck-capacity').detail).toMatch(/weight unknown/);
  });
});
