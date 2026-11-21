// server/services/slotRecommendService.js
//
// B.1 Part 1 slot recommendation: loads what slotRecommendSpec.js needs and
// asks Google (via B.2's googleRoutingService) for road distances to booked DOs.
// Advisory only: nothing is written except the shared geocode cache.
//
// Data sources
//   settings       getSchedulerSettings() (cap, grace, base/fallback minutes, nearby_km)
//   service time   serviceTime.js (item types on Information > Item)
//   item volume    products.package_* (often empty; the load check is then skipped)
//   fleet/teams    B.4 block-offs (fleetAvailabilityService / Spec)
//   booked DOs     open orders on a time slot in the horizon, plus orders Odoo
//                  booked (requested_appointment_date/session) not yet on a slot
//   distance       Google Distance Matrix, only for DOs already within nearby_km
//                  in a straight line (road km is never shorter). Without a key or
//                  when Google fails, straight-line x 1.4 is used and flagged.

const prisma = require('../prismaClient');
const spec = require('./slotRecommendSpec');
const { getSchedulerSettings } = require('./schedulerSettings');
const { computeServiceMinutes, serviceMinutesForOrders, itemKey } = require('./serviceTime');
const { loadTeams, loadRows } = require('./fleetAvailabilityService');
const { dateRange, closedSessions } = require('./availabilityService');
const { sessionForWindow } = require('./odooAppointmentSessions');
const routing = require('./googleRoutingService');
const addressLookup = require('./addressLookupService');
const { validCoords } = require('./routeGeocodeCache');

const CLOSED_ORDER = /^(delivered|completed|cancelled|canceled)$/i;
const CLOSED_SLOT = ['completed', 'cancelled'];
const ROAD_FACTOR = 1.4; // same estimate B.2 uses when Google is unreachable

const coordsOf = (row) => {
  const c = { lat: Number(row?.latitude), lon: Number(row?.longitude) };
  return row && row.latitude != null && row.longitude != null && validCoords(c) ? c : null;
};

/** Volume of order lines in cm³, or null when any line's product has no size. */
function linesVolume(lines) {
  let total = 0;
  for (const { quantity, product } of lines) {
    const v = spec.boxCm3(product?.package_length_cm, product?.package_width_cm, product?.package_height_cm);
    if (v === null) return null;
    total += v * Math.max(1, Number(quantity) || 1);
  }
  return lines.length ? total : null;
}

// ------------------------------------------------------------------ the new DO

async function describeJob(items, settings, db) {
  const keys = [...new Set(items.map(i => itemKey(i.name)))];
  const [rates, products] = await Promise.all([
    db.item_point_rates.findMany({ where: { item_key: { in: keys } }, include: { item_type: true } }),
    db.products.findMany({
      where: { OR: items.map(i => ({ product_name: { equals: i.name, mode: 'insensitive' } })) },
      select: { product_name: true, package_length_cm: true, package_width_cm: true, package_height_cm: true },
    }),
  ]);
  const rateByKey = new Map(rates.map(r => [r.item_key, r]));
  const productByKey = new Map(products.map(p => [itemKey(p.product_name), p]));

  const service = computeServiceMinutes(items.map(i => {
    const product = rateByKey.get(itemKey(i.name)) ?? null;
    return {
      line: { quantity: i.quantity, odoo_product_name: i.name, dismantle_required: i.dismantle },
      product,
      itemType: product?.item_type ?? null,
    };
  }), settings);

  const volume = linesVolume(items.map(i => ({ quantity: i.quantity, product: productByKey.get(itemKey(i.name)) })));

  return {
    service_minutes: Math.ceil(service.totalMinutes),
    requires_installer: service.requiresInstaller,
    volume_cm3: volume,
    breakdown: {
      delivery_minutes: service.deliveryMinutes,
      install_minutes: service.installMinutes,
      dismantle_minutes: service.dismantleMinutes,
      lines: service.lines.map((l, idx) => ({
        name: items[idx].name,
        quantity: l.quantity,
        known: rateByKey.has(itemKey(items[idx].name)),
        classified: l.classified,
        used_fallback: l.used_fallback,
        install_minutes: l.install_minutes,
        dismantle_minutes: l.dismantle_minutes,
      })),
    },
  };
}

// ------------------------------------------------------------------ booked DOs

const LINE_SELECT = {
  id: true, quantity: true, odoo_product_name: true, dismantle_required: true,
  dismantle_time_min: true, dismantle_time_max: true,
  custom_installation_time_min: true, custom_installation_time_max: true,
  products: { select: { product_name: true, package_length_cm: true, package_width_cm: true, package_height_cm: true } },
};

async function loadBookedOrders(db, { from, to }) {
  const orders = await db.orders.findMany({
    where: {
      OR: [
        { time_slots: { date: { gte: from, lte: to } } },
        { time_slot_id: null, requested_appointment_date: { gte: from, lte: to } },
      ],
    },
    select: {
      id: true, order_status: true, odoo_order_ref: true,
      requested_appointment_date: true, requested_appointment_session: true,
      delivery_address: true, remarks_delivery_address: true, original_delivery_address: true,
      delivery_city: true, delivery_postcode: true, delivery_state: true,
      time_slots: { select: { date: true, time_window_start: true, slot_status: true } },
      buildings: { select: { address: true, latitude: true, longitude: true, postal_code: true, building_name: true } },
      customers: { select: { address: true, city: true, postcode: true, state: true } },
      order_products: { select: LINE_SELECT },
    },
  });

  return orders.filter(o => !CLOSED_ORDER.test(o.order_status ?? '')).map(o => {
    let date = null;
    let session = null;
    if (o.time_slots) {
      if (CLOSED_SLOT.includes(o.time_slots.slot_status)) return null;
      date = o.time_slots.date;
      session = sessionForWindow(o.time_slots.time_window_start);
    } else {
      date = o.requested_appointment_date;
      session = spec.SESSIONS.includes(o.requested_appointment_session) ? o.requested_appointment_session : null;
    }
    if (!date || !session || date < from || date > to) return null;
    return { order: o, date, session };
  }).filter(Boolean);
}

// ------------------------------------------------------------------ distances

/**
 * Road km from origin to each booked order that is within nearbyKm in a straight
 * line. Orders further away get Infinity (certainly not nearby); orders with no
 * known coordinates are left out (unknown).
 */
async function nearbyDistances(origin, booked, nearbyKm) {
  const distanceKm = new Map();
  // No origin: locate() already explains why in its own note.
  if (!origin) return { distanceKm, source: 'none', note: null };

  const candidates = [];
  for (const { order } of booked) {
    // Cached coordinates only: never geocode other customers' addresses here.
    const coords = await routing.getCachedOrderCoords(order).catch(() => null);
    if (!coords) continue;
    const straight = routing.haversineKm(origin, coords);
    if (straight > nearbyKm) distanceKm.set(order.id, Infinity);
    else candidates.push({ id: order.id, coords, straight });
  }
  if (!candidates.length) return { distanceKm, source: 'google', note: null };

  // One element per distinct point (several DOs often share a building).
  const points = new Map();
  for (const c of candidates) {
    const k = `${c.coords.lat.toFixed(5)},${c.coords.lon.toFixed(5)}`;
    if (!points.has(k)) points.set(k, c.coords);
    c.pointKey = k;
  }
  const keys = [...points.keys()];
  try {
    const km = await routing.roadDistancesKm(origin, keys.map(k => points.get(k)));
    const byKey = new Map(keys.map((k, i) => [k, km[i]]));
    for (const c of candidates) distanceKm.set(c.id, byKey.get(c.pointKey) ?? c.straight * ROAD_FACTOR);
    return { distanceKm, source: 'google', note: null };
  } catch (err) {
    for (const c of candidates) distanceKm.set(c.id, c.straight * ROAD_FACTOR);
    return { distanceKm, source: 'estimate', note: `Road distance unavailable (${err.message}); straight-line estimate used` };
  }
}

/**
 * Where the new address is, best source first:
 *   location  a "Check address" match the user confirmed, or a past address B.2
 *             had already geocoded (sent by the panel)
 *   building  the picked or matched building's saved lat/lon
 *   geocode   Geocoding API on the typed text, precise matches only
 * Recommendation only: nothing here touches B.2's shared geocode cache.
 * @returns {{coords, formatted_address, source, note}}
 */
async function locate({ address, location }, building) {
  if (location) {
    return { coords: { lat: location.lat, lon: location.lon }, formatted_address: location.label ?? null, source: 'confirmed', note: null };
  }
  const fromBuilding = coordsOf(building);
  if (fromBuilding) {
    return { coords: fromBuilding, formatted_address: building.address ?? null, source: 'building', note: null };
  }
  try {
    return { ...(await addressLookup.geocodeStrict(address)), source: 'geocode', note: null };
  } catch (err) {
    const why = err.code === 'NOT_FOUND'
      ? `${err.message} Use "Check address" or pick a suggestion.`
      : err.message;
    return { coords: null, formatted_address: null, source: null, note: why };
  }
}

// ------------------------------------------------------------------ entry point

/**
 * Steps (step 1, request validation, happens in the route via spec.validateRequest):
 *   2. Dates to check
 *   3. Load everything in parallel
 *   4. Match the address to a building (access hours)
 *   5. Booked DOs' service time and volume
 *   6. Locate the new address (confirmed location > building coords > strict Google Geocoding)
 *   7. Road distance to booked DOs (Google Distance Matrix, close ones only)
 *   8. Hard checks per date + session (spec.evaluateWindows)
 *   9. Rank and reply (spec.pickOptions)
 *
 * @param {{address, items, not_before, days}} input  validated by spec.validateRequest
 * @param {{now?: Date, db?: object}} [opts]
 */
async function recommendSlots(input, { now = new Date(), db = prisma } = {}) {
  // Step 2. Dates to check: tomorrow, or the day after from 17:00, or not_before if later; then `days` days x 3 sessions.
  const settings = await getSchedulerSettings();
  const nearbyKm = Number(settings.nearby_km) || 10;
  const { first } = dateRange(now, 1);
  const dates = spec.horizon(first, { notBefore: input.not_before, days: input.days });
  const from = dates[0];
  const to = dates[dates.length - 1];

  // Step 3. Load everything in parallel. describeJob looks up the new DO's items
  // on Information > Item (install/dismantle minutes, installer need) and their
  // package sizes in products. Booked DOs are open orders on a slot plus orders
  // Odoo booked for a session that are not on a slot yet.
  const [job, truckRows, teams, blockoffs, slots, booked, buildings] = await Promise.all([
    describeJob(input.items, settings, db),
    db.trucks.findMany({ select: { id: true, tone: true, length_cm: true, width_cm: true, height_cm: true } }),
    loadTeams(db),
    loadRows(db, { from, to }),
    db.time_slots.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true, time_window_start: true, available_flag: true, slot_status: true },
    }),
    loadBookedOrders(db, { from, to }),
    db.buildings.findMany({
      select: {
        id: true, building_name: true, postal_code: true, address: true, latitude: true, longitude: true,
        access_time_window_start: true, access_time_window_end: true, pre_registration_required: true,
      },
    }),
  ]);

  // Step 4. Match the address to a building: a unique 5-digit postcode, else the
  // longest building name in the address. Gives access hours and maybe coords.
  // A building picked from the suggestions wins over text matching.
  let building = (input.building_id && buildings.find(b => b.id === input.building_id))
    || spec.matchBuilding(input.address, buildings);
  const trucks = truckRows.map(t => ({ id: t.id, tone: t.tone, volume_cm3: spec.boxCm3(t.length_cm, t.width_cm, t.height_cm) }));

  // Step 5. Booked DOs' service minutes (one batched item lookup) and volume.
  const serviceByOrder = await serviceMinutesForOrders(booked.map(b => b.order), { settings, db });

  const bookings = booked.map(({ order, date, session }) => ({
    order_id: order.id,
    date,
    session,
    service_minutes: serviceByOrder.get(order.id)?.totalMinutes ?? 0,
    volume_cm3: linesVolume((order.order_products ?? []).map(l => ({ quantity: l.quantity, product: l.products }))),
  }));

  // Step 6. Locate the new address: a location the user confirmed ("Check
  // address", or a past address with cached coords), else the building's saved
  // lat/lon, else Geocoding API on the typed text, where vague matches (typos
  // Google guesses at) are refused. If this fails, nearby DOs are not counted;
  // the other checks still run. Nothing is cached.
  const origin = await locate({ address: input.address, location: input.location }, building);
  // Google's full address carries the postcode the user may not have typed.
  if (!building && origin.formatted_address) {
    building = spec.matchBuilding(`${input.address}, ${origin.formatted_address}`, buildings);
  }

  // Step 7. Road km to booked DOs. Their coords come from the cache or their
  // building only (never geocoded here). DOs further than nearby_km in a
  // straight line are skipped; the rest go to the Google Distance Matrix API.
  // If Google fails, straight-line x 1.4 is used and a note says so.
  const distance = await nearbyDistances(origin.coords, booked, nearbyKm);

  // Step 8. Hard checks per date + session: session open, building access, DO
  // cap, delivery team, installer team, truck, truck space, visit length,
  // team hours.
  // Also counts nearby DOs per session.
  const windows = spec.evaluateWindows({
    dates, settings, job, building, trucks, teams, blockoffs, bookings,
    closedSessions: closedSessions(slots),
    distanceKm: distance.distanceKm,
    nearbyKm,
  });
  // Step 9. Rank feasible sessions (earliest date, then most nearby DOs, then
  // most room) and keep the best one per day, up to 3. When nothing fits,
  // reasons lists the checks that ruled out the most sessions.
  const { options, reasons } = spec.pickOptions(windows, { nearbyKm });

  // Caveats shown under the options in the panel.
  const notes = [];
  if (origin.note) notes.push(`Address not found on the map: ${origin.note} Nearby DOs were not counted.`);
  if (distance.note) notes.push(distance.note);
  if (job.volume_cm3 === null) notes.push('Item sizes are not recorded, so truck space was not checked.');
  if (job.breakdown.lines.some(l => l.used_fallback)) {
    notes.push('Some items have no install time (unknown or unclassified on Information > Item); the fallback was used.');
  }
  if (building?.pre_registration_required) notes.push(`${building.building_name} requires pre-registration before delivery.`);

  return {
    options,
    reasons,
    windows,
    job,
    building: building ? { id: building.id, name: building.building_name } : null,
    address_located: Boolean(origin.coords),
    located_as: origin.formatted_address,
    location_source: origin.source,
    distance_source: distance.source,
    nearby_km: nearbyKm,
    horizon: { from, to },
    notes,
  };
}

module.exports = { recommendSlots, describeJob, loadBookedOrders, nearbyDistances, linesVolume };
