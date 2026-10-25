// B.1 responsibility: "Estimate service duration".
//
// Ported from the duplicated logic in:
//   client/src/components/admin/schedule/Schedule.js:244  calculateServiceTimes
//   server/services/scheduler.js:425                        calculateOrderTimes
//
// Both of those read `op.custom_dismantle_time`, A COLUMN THAT DOES NOT EXIST.
// order_products has dismantle_time_min / dismantle_time_max, so dismantle time
// has been silently zero in production. This reads the real columns.
//
// The odd "delivery minutes only count when there is no installation" rule is
// preserved deliberately: the engine behaves that way today, and the UI must
// agree with the engine or a dispatcher sees "fits" and the API says otherwise.
// It is wrong per the design proposal (§5 shows 15 min delivery + 30 min install
// as additive) — fix it in both places at once, not here alone.

export const DEFAULT_DURATION_CONFIG = {
  baseDeliveryMinutes: 10,
  // Fallback when a product carries no installation estimate at all.
  fallbackInstallMinutes: 0,
};

/** Mean of a min/max pair, tolerating either being absent. */
function midpoint(min, max) {
  const lo = Number.isFinite(min) ? Number(min) : null;
  const hi = Number.isFinite(max) ? Number(max) : null;
  if (lo !== null && hi !== null) return (lo + hi) / 2;
  if (lo !== null) return lo;
  if (hi !== null) return hi;
  return null;
}

/**
 * Per-line breakdown so the UI can explain a number rather than just show it.
 * @returns {{installMinutes, dismantleMinutes, requiresInstaller, countsAsInstall}}
 */
export function lineDuration(item, product, config = DEFAULT_DURATION_CONFIG) {
  const qty = Math.max(1, Number(item?.quantity) || 1);
  const serviceType = String(item?.serviceType ?? '').toLowerCase();

  const installMid = midpoint(
    item?.customInstallMinutesMin ?? product?.installMinutesMin,
    item?.customInstallMinutesMax ?? product?.installMinutesMax,
  );
  const hasEstimate = installMid !== null;
  const requiresInstaller = Boolean(product?.installerRequired);

  // An explicit service_type wins; otherwise infer from the product.
  const countsAsInstall = serviceType
    ? serviceType === 'delivery_installation'
    : (hasEstimate || requiresInstaller);

  if (!countsAsInstall) {
    return { installMinutes: 0, dismantleMinutes: 0, requiresInstaller: false, countsAsInstall: false };
  }

  const installMinutes = (hasEstimate ? installMid : config.fallbackInstallMinutes) * qty;

  // The real columns — not the phantom custom_dismantle_time.
  let dismantleMinutes = 0;
  if (item?.dismantleRequired) {
    const dismantleMid = midpoint(item?.dismantleMinutesMin, item?.dismantleMinutesMax)
      ?? (Number.isFinite(product?.dismantleMinutes) ? Number(product.dismantleMinutes) : null);
    if (dismantleMid !== null) dismantleMinutes = dismantleMid * qty;
  }

  return {
    installMinutes,
    dismantleMinutes,
    requiresInstaller: requiresInstaller && countsAsInstall,
    countsAsInstall: true,
  };
}

/**
 * Total service minutes for one order.
 * @param {object} order         normalized order (with `items`)
 * @param {Record<string, object>} productsById
 * @returns {{totalMinutes, deliveryMinutes, installMinutes, dismantleMinutes, requiresInstaller}}
 */
export function orderServiceMinutes(order, productsById = {}, config = DEFAULT_DURATION_CONFIG) {
  const items = Array.isArray(order?.items) ? order.items : [];

  let installMinutes = 0;
  let dismantleMinutes = 0;
  let requiresInstaller = false;
  let anyInstall = false;

  for (const item of items) {
    const product = productsById[item?.productId] ?? {};
    const line = lineDuration(item, product, config);
    installMinutes += line.installMinutes;
    dismantleMinutes += line.dismantleMinutes;
    if (line.requiresInstaller) requiresInstaller = true;
    if (line.countsAsInstall) anyInstall = true;
  }

  // Matches the engine: base delivery time applies only to pure-delivery orders.
  const deliveryMinutes = items.length > 0 && !anyInstall ? config.baseDeliveryMinutes : 0;

  return {
    totalMinutes: deliveryMinutes + installMinutes + dismantleMinutes,
    deliveryMinutes,
    installMinutes,
    dismantleMinutes,
    requiresInstaller,
  };
}

/** Sum of service minutes across a set of orders. */
export function totalServiceMinutes(orders = [], productsById = {}, config = DEFAULT_DURATION_CONFIG) {
  return orders.reduce(
    (sum, order) => sum + orderServiceMinutes(order, productsById, config).totalMinutes,
    0,
  );
}

/** '1h 45m' / '45m' */
export function formatMinutes(minutes) {
  const total = Math.round(Number(minutes) || 0);
  if (total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}
