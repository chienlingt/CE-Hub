import {
  orderServiceMinutes, lineDuration, totalServiceMinutes, formatMinutes,
  DEFAULT_DURATION_CONFIG,
} from '../serviceDuration';

const PRODUCTS = {
  tv: {
    id: 'tv', name: 'Television',
    installerRequired: false, installMinutesMin: null, installMinutesMax: null,
  },
  washer: {
    id: 'washer', name: 'Washing machine',
    installerRequired: true, installMinutesMin: 80, installMinutesMax: 100,
    dismantleMinutes: 20,
  },
  fridge: {
    id: 'fridge', name: 'Refrigerator',
    installerRequired: false, installMinutesMin: 60, installMinutesMax: 60,
  },
};

const order = (items) => ({ id: 'o1', items });

describe('orderServiceMinutes', () => {
  it('charges the base delivery time for a pure-delivery order', () => {
    const result = orderServiceMinutes(
      order([{ productId: 'tv', quantity: 1, serviceType: 'delivery_only' }]),
      PRODUCTS,
    );
    expect(result).toMatchObject({
      deliveryMinutes: DEFAULT_DURATION_CONFIG.baseDeliveryMinutes,
      installMinutes: 0,
      dismantleMinutes: 0,
      totalMinutes: 10,
      requiresInstaller: false,
    });
  });

  it('uses the midpoint of the install estimate, times quantity', () => {
    const result = orderServiceMinutes(
      order([{ productId: 'washer', quantity: 2, serviceType: 'delivery_installation' }]),
      PRODUCTS,
    );
    // midpoint(80,100) = 90, x2 = 180
    expect(result.installMinutes).toBe(180);
    expect(result.requiresInstaller).toBe(true);
  });

  // The engine's current behaviour: base delivery time applies ONLY when there
  // is no installation at all. Preserved so the UI agrees with the API, even
  // though the design proposal shows delivery and install as additive.
  it('drops the base delivery time once anything is installed', () => {
    const result = orderServiceMinutes(
      order([{ productId: 'washer', quantity: 1, serviceType: 'delivery_installation' }]),
      PRODUCTS,
    );
    expect(result.deliveryMinutes).toBe(0);
    expect(result.totalMinutes).toBe(90);
  });

  describe('dismantle time (the phantom-column bug)', () => {
    // server/services/scheduler.js:460 and Schedule.js:277 both read
    // op.custom_dismantle_time, which is NOT a column on order_products. The
    // real fields are dismantle_time_min / dismantle_time_max, so dismantle
    // time has been silently zero. These pin the corrected behaviour.
    it('reads dismantleMinutesMin/Max from the line', () => {
      const result = orderServiceMinutes(
        order([{
          productId: 'washer', quantity: 1, serviceType: 'delivery_installation',
          dismantleRequired: true, dismantleMinutesMin: 10, dismantleMinutesMax: 30,
        }]),
        PRODUCTS,
      );
      expect(result.dismantleMinutes).toBe(20);   // midpoint(10,30)
      expect(result.totalMinutes).toBe(110);      // 90 install + 20 dismantle
    });

    it('falls back to the product’s dismantle time when the line has none', () => {
      const result = orderServiceMinutes(
        order([{
          productId: 'washer', quantity: 1, serviceType: 'delivery_installation',
          dismantleRequired: true,
        }]),
        PRODUCTS,
      );
      expect(result.dismantleMinutes).toBe(20);   // from PRODUCTS.washer
    });

    it('charges nothing when dismantle is not required', () => {
      const result = orderServiceMinutes(
        order([{
          productId: 'washer', quantity: 1, serviceType: 'delivery_installation',
          dismantleRequired: false, dismantleMinutesMin: 10, dismantleMinutesMax: 30,
        }]),
        PRODUCTS,
      );
      expect(result.dismantleMinutes).toBe(0);
    });

    it('scales dismantle time by quantity', () => {
      const result = orderServiceMinutes(
        order([{
          productId: 'washer', quantity: 3, serviceType: 'delivery_installation',
          dismantleRequired: true, dismantleMinutesMin: 20, dismantleMinutesMax: 20,
        }]),
        PRODUCTS,
      );
      expect(result.dismantleMinutes).toBe(60);
    });
  });

  describe('inference when service_type is absent', () => {
    it('counts as installation when the product needs an installer', () => {
      const result = orderServiceMinutes(
        order([{ productId: 'washer', quantity: 1 }]),
        PRODUCTS,
      );
      expect(result.installMinutes).toBe(90);
      expect(result.requiresInstaller).toBe(true);
    });

    it('counts as installation when the product merely has an estimate', () => {
      const result = orderServiceMinutes(
        order([{ productId: 'fridge', quantity: 1 }]),
        PRODUCTS,
      );
      expect(result.installMinutes).toBe(60);
      expect(result.requiresInstaller).toBe(false);  // no installer flag
    });

    it('stays a plain delivery for a product with neither', () => {
      const result = orderServiceMinutes(
        order([{ productId: 'tv', quantity: 1 }]),
        PRODUCTS,
      );
      expect(result.totalMinutes).toBe(10);
    });
  });

  it('sums mixed lines and reports requiresInstaller if ANY line needs one', () => {
    const result = orderServiceMinutes(
      order([
        { productId: 'tv', quantity: 1, serviceType: 'delivery_only' },
        { productId: 'washer', quantity: 1, serviceType: 'delivery_installation' },
      ]),
      PRODUCTS,
    );
    expect(result.installMinutes).toBe(90);
    expect(result.deliveryMinutes).toBe(0);
    expect(result.requiresInstaller).toBe(true);
  });

  it('treats a missing or zero quantity as one unit', () => {
    expect(orderServiceMinutes(
      order([{ productId: 'washer', serviceType: 'delivery_installation' }]), PRODUCTS,
    ).installMinutes).toBe(90);

    expect(orderServiceMinutes(
      order([{ productId: 'washer', quantity: 0, serviceType: 'delivery_installation' }]), PRODUCTS,
    ).installMinutes).toBe(90);
  });

  it('handles an empty or malformed order without throwing', () => {
    expect(orderServiceMinutes(order([]), PRODUCTS).totalMinutes).toBe(0);
    expect(orderServiceMinutes(null, PRODUCTS).totalMinutes).toBe(0);
    expect(orderServiceMinutes(order([{ productId: 'nope', quantity: 1 }]), PRODUCTS).totalMinutes).toBe(10);
  });

  it('honours a custom base delivery time, so Mr Lee’s figures can be entered', () => {
    const result = orderServiceMinutes(
      order([{ productId: 'tv', quantity: 1, serviceType: 'delivery_only' }]),
      PRODUCTS,
      { ...DEFAULT_DURATION_CONFIG, baseDeliveryMinutes: 15 },
    );
    expect(result.totalMinutes).toBe(15);
  });

  it('prefers a per-line custom install estimate over the product’s', () => {
    const result = orderServiceMinutes(
      order([{
        productId: 'washer', quantity: 1, serviceType: 'delivery_installation',
        customInstallMinutesMin: 30, customInstallMinutesMax: 30,
      }]),
      PRODUCTS,
    );
    expect(result.installMinutes).toBe(30);
  });
});

describe('lineDuration', () => {
  it('uses a lone min when max is absent', () => {
    expect(lineDuration(
      { productId: 'x', quantity: 1, serviceType: 'delivery_installation' },
      { installMinutesMin: 45 },
    ).installMinutes).toBe(45);
  });

  it('uses a lone max when min is absent', () => {
    expect(lineDuration(
      { productId: 'x', quantity: 1, serviceType: 'delivery_installation' },
      { installMinutesMax: 75 },
    ).installMinutes).toBe(75);
  });
});

describe('totalServiceMinutes', () => {
  it('sums across orders', () => {
    const orders = [
      order([{ productId: 'tv', quantity: 1, serviceType: 'delivery_only' }]),
      order([{ productId: 'washer', quantity: 1, serviceType: 'delivery_installation' }]),
    ];
    expect(totalServiceMinutes(orders, PRODUCTS)).toBe(100);
  });

  it('is zero for no orders', () => {
    expect(totalServiceMinutes([], PRODUCTS)).toBe(0);
  });
});

describe('formatMinutes', () => {
  it.each([
    [0, '0m'], [-5, '0m'], [45, '45m'], [60, '1h'], [105, '1h 45m'], [120, '2h'],
  ])('formats %p as %s', (input, expected) => {
    expect(formatMinutes(input)).toBe(expected);
  });
});
