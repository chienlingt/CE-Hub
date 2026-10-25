// The edge of the system: raw API records in, one consistent shape out.
//
// Ports the `field` accessor map from
// client/src/components/admin/schedule/Schedule.js:111-168, which every render
// path in that 1401-line component had to consult because the API mixes
// snake_case, PascalCase and camelCase. Doing it ONCE here means no component,
// selector or rule module ever sees that again.
//
// Also coerces Prisma Decimal columns. buildings.latitude/longitude are
// Decimal(10,8)/(11,8) and serialise to JSON as STRINGS, so every distance and
// map marker silently breaks without Number() here.

const first = (...values) => values.find(v => v !== undefined && v !== null);

/** Decimal-as-string -> number. Returns null rather than NaN. */
function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

const str = (value) => (value === undefined || value === null ? null : String(value));

/** 'HH:mm' from either a bare clock string or a full timestamp. */
function clock(value) {
  if (!value) return null;
  const s = String(value);
  const bare = s.match(/^(\d{1,2}:\d{2})/);
  if (bare) return bare[1].padStart(5, '0');
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' without the toISOString() UTC day-shift. */
function dateKey(value) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- per-entity normalizers -------------------------------------------------

export function normalizeTruck(raw) {
  return {
    id: str(first(raw?.id, raw?.truck_id, raw?.TruckID)),
    plate: str(first(raw?.plate_no, raw?.CarPlate, raw?.plate)) ?? 'Unknown',
    tone: num(first(raw?.tone, raw?.Tone, raw?.capacity_tons)),
    lengthCm: num(first(raw?.length_cm, raw?.LengthCM)),
    widthCm: num(first(raw?.width_cm, raw?.WidthCM)),
    heightCm: num(first(raw?.height_cm, raw?.HeightCM)),
    // Not a column yet — the Phase-3 migration adds it. Null means "unknown",
    // which the UI must render as "—" rather than zero.
    maxPayloadKg: num(first(raw?.max_payload_kg, raw?.maxPayloadKg)),
    offDay: str(first(raw?.off_day, raw?.offDay)),
    driverId: str(first(raw?.driver_id, raw?.driverId)),
    assistantId: str(first(raw?.assistant_id, raw?.assistantId)),
  };
}

export function normalizeEmployee(raw) {
  const role = raw?.role;
  const roleName = typeof role === 'object' && role !== null
    ? first(role.name, role.id)
    : first(role, raw?.role_name, raw?.roleName);
  return {
    id: str(first(raw?.id, raw?.EmployeeID, raw?.employee_id)),
    name: str(first(raw?.name, raw?.display_name, raw?.displayName)) ?? 'Unnamed',
    roleName: str(roleName) ?? '',
    activeFlag: bool(first(raw?.active_flag, raw?.activeFlag), true),
    phone: str(first(raw?.contact_number, raw?.phone)),
  };
}

export function normalizeTeam(raw, assignments = []) {
  const id = str(first(raw?.id, raw?.TeamID, raw?.team_id));
  const fromAssignments = assignments
    .filter(a => str(first(a?.team_id, a?.TeamID, a?.teamId)) === id)
    .map(a => str(first(a?.employee_id, a?.EmployeeID, a?.employeeId)))
    .filter(Boolean);

  const primaryDriverId = str(first(raw?.primary_driver_id, raw?.primaryDriverId));
  const assistantDriverId = str(first(raw?.assistant_driver_id, raw?.assistantDriverId));

  // The crew is the union of explicit assignments and the team's named drivers.
  const memberIds = Array.from(new Set([
    ...(Array.isArray(raw?.memberIds) ? raw.memberIds.map(str) : []),
    ...fromAssignments,
    primaryDriverId,
    assistantDriverId,
  ].filter(Boolean)));

  return {
    id,
    name: str(first(raw?.name, raw?.team_name, raw?.team_type, raw?.TeamType)) ?? 'Team',
    type: str(first(raw?.team_type, raw?.TeamType)),
    availableFlag: bool(first(raw?.available_flag, raw?.availableFlag), true),
    truckId: str(first(raw?.truck_id, raw?.truckId)),
    primaryDriverId,
    assistantDriverId,
    memberIds,
  };
}

export function normalizeBuilding(raw) {
  const zone = raw?.zone ?? raw?.zones;
  return {
    id: str(first(raw?.id, raw?.building_id, raw?.BuildingID)),
    name: str(first(raw?.building_name, raw?.BuildingName, raw?.name)) ?? 'Unnamed building',
    zoneName: str(first(zone?.zone_name, zone?.name, raw?.zone_name)),
    zoneId: str(first(raw?.zone_id, raw?.zoneId)),
    address: str(raw?.address),
    postalCode: str(first(raw?.postal_code, raw?.postalCode)),
    housingType: str(first(raw?.housing_type, raw?.housingType)),
    accessStart: clock(first(raw?.access_time_window_start, raw?.AccessTimeWindowStart, raw?.accessStart)),
    accessEnd: clock(first(raw?.access_time_window_end, raw?.AccessTimeWindowEnd, raw?.accessEnd)),
    permitRequired: bool(first(raw?.pre_registration_required, raw?.permitRequired), false),
    liftAvailable: bool(first(raw?.lift_available, raw?.liftAvailable), null),
    loadingBayAvailable: bool(first(raw?.loading_bay_available, raw?.loadingBayAvailable), null),
    // Free text in the schema and never parsed — advisory only, never a check.
    vehicleSizeLimit: str(first(raw?.vehicle_size_limit, raw?.vehicleSizeLimit)),
    // Prisma Decimal -> string in JSON. Coerce or every map marker breaks.
    latitude: num(first(raw?.latitude, raw?.lat)),
    longitude: num(first(raw?.longitude, raw?.lng)),
    notes: str(raw?.notes),
  };
}

export function normalizeCustomer(raw) {
  return {
    id: str(first(raw?.id, raw?.CustomerID, raw?.customer_id)),
    name: str(first(raw?.full_name, raw?.FullName, raw?.name)) ?? 'Unknown customer',
    phone: str(first(raw?.phone, raw?.contact_number)),
    address: str(raw?.address),
    postcode: str(raw?.postcode),
  };
}

export function normalizeProduct(raw) {
  return {
    id: str(first(raw?.id, raw?.product_id, raw?.ProductID)),
    name: str(first(raw?.product_name, raw?.ProductName, raw?.name)) ?? 'Product',
    packageLengthCm: num(first(raw?.package_length_cm, raw?.packageLengthCm)),
    packageWidthCm: num(first(raw?.package_width_cm, raw?.packageWidthCm)),
    packageHeightCm: num(first(raw?.package_height_cm, raw?.packageHeightCm)),
    // Not a column yet; null means unknown, and the UI must say so.
    weightKg: num(first(raw?.weight_kg, raw?.weightKg)),
    installerRequired: bool(first(raw?.installer_team_required_flag, raw?.installerRequired), false),
    installMinutesMin: num(first(raw?.estimated_installation_time_min, raw?.installMinutesMin)),
    installMinutesMax: num(first(raw?.estimated_installation_time_max, raw?.installMinutesMax)),
    dismantleMinutes: num(first(raw?.dismantle_time, raw?.dismantleMinutes)),
    dismantleRequiredFlag: bool(first(raw?.dismantle_required_flag, raw?.dismantleRequiredFlag), false),
    noLieDown: bool(first(raw?.no_lie_down_flag, raw?.noLieDown), false),
    fragile: bool(first(raw?.fragile_flag, raw?.fragile), false),
  };
}

export function normalizeOrderItem(raw) {
  return {
    id: str(first(raw?.id, raw?.order_product_id)),
    productId: str(first(raw?.product_id, raw?.ProductID, raw?.productId)),
    quantity: num(first(raw?.quantity, raw?.Quantity)) ?? 1,
    serviceType: str(first(raw?.service_type, raw?.ServiceType, raw?.serviceType)),
    dismantleRequired: bool(first(raw?.dismantle_required, raw?.dismantleRequired), false),
    // The real columns. scheduler.js:460 and Schedule.js:277 read
    // `custom_dismantle_time`, which does not exist on order_products.
    dismantleMinutesMin: num(first(raw?.dismantle_time_min, raw?.dismantleMinutesMin)),
    dismantleMinutesMax: num(first(raw?.dismantle_time_max, raw?.dismantleMinutesMax)),
    customInstallMinutesMin: num(first(raw?.custom_installation_time_min, raw?.customInstallMinutesMin)),
    customInstallMinutesMax: num(first(raw?.custom_installation_time_max, raw?.customInstallMinutesMax)),
    handlingStatus: str(first(raw?.handling_status, raw?.handlingStatus)),
  };
}

export function normalizeOrder(raw, itemsByOrderId = {}) {
  const id = str(first(raw?.id, raw?.OrderID, raw?.order_id));
  const embedded = Array.isArray(raw?.order_products) ? raw.order_products : null;
  const items = (embedded ?? itemsByOrderId[id] ?? []).map(normalizeOrderItem);

  return {
    id,
    doNo: str(first(raw?.odoo_order_ref, raw?.doNo, raw?.do_no)) ?? `DO-${String(id ?? '').slice(0, 6)}`,
    status: str(first(raw?.order_status, raw?.OrderStatus, raw?.status)) ?? 'Pending',
    assignmentStatus: str(first(raw?.assignment_status, raw?.assignmentStatus)) ?? 'unassigned',
    slotId: str(first(raw?.time_slot_id, raw?.TimeSlotID, raw?.timeSlotId)),
    customerId: str(first(raw?.customer_id, raw?.CustomerID, raw?.customerId)),
    buildingId: str(first(raw?.building_id, raw?.BuildingID, raw?.buildingId)),
    sequence: num(first(raw?.truck_loading_sequence, raw?.sequence)),
    scheduledStart: str(first(raw?.scheduled_start_date_time, raw?.ScheduledStartDateTime)),
    scheduledEnd: str(first(raw?.scheduled_end_date_time, raw?.ScheduledEndDateTime)),
    deliveryAddress: str(first(raw?.delivery_address, raw?.deliveryAddress)),
    deliveryRemarks: str(first(raw?.delivery_remarks, raw?.deliveryRemarks)),
    salespersonName: str(first(raw?.salesperson_name, raw?.salespersonName)),
    // Today the engine writes one of only two coarse free-text strings here.
    // Phase 4 replaces it with an issueCodes value.
    unscheduledReason: str(first(raw?.unscheduled_reason, raw?.unscheduledReason)),
    issueCodes: Array.isArray(raw?.issue_codes) ? raw.issue_codes.map(str) : [],
    rejectReason: str(first(raw?.reject_reason, raw?.rejectReason)),
    // When Odoo expects it delivered: picking.scheduled_date, pushed at ingest.
    expectedAt: str(first(raw?.preferred_timeslot, raw?.expectedAt)),
    items,
  };
}

export function normalizeSlot(raw) {
  const start = clock(first(raw?.time_window_start, raw?.TimeWindowStart, raw?.start));
  return {
    id: str(first(raw?.id, raw?.TimeSlotID, raw?.time_slot_id)),
    dateKey: dateKey(first(raw?.date, raw?.Date, raw?.dateKey)),
    start,
    end: clock(first(raw?.time_window_end, raw?.TimeWindowEnd, raw?.end)),
    status: str(first(raw?.slot_status, raw?.slotStatus, raw?.status)) ?? 'scheduled',
    availableFlag: bool(first(raw?.available_flag, raw?.availableFlag), true),
    truckId: str(first(raw?.truck_id, raw?.TruckID, raw?.truckId)),
    teamId: str(first(raw?.delivery_team_id, raw?.DeliveryTeamID, raw?.teamId)),
    departedAt: str(first(raw?.departed_at, raw?.departedAt)),
    // --- B.2's output. Read-only here; Chien Ling's module writes it. ---
    routePlan: raw?.route_plan ?? raw?.routePlan ?? null,
    routePolyline: str(first(raw?.route_polyline, raw?.routePolyline)),
    routeDistanceM: num(first(raw?.route_distance_m, raw?.routeDistanceM)),
    routeDurationS: num(first(raw?.route_duration_s, raw?.routeDurationS)),
    routeVersion: num(first(raw?.route_version, raw?.routeVersion)) ?? 0,
    routeLastReason: str(first(raw?.route_last_reason, raw?.routeLastReason)),
    routeComputedAt: str(first(raw?.route_computed_at, raw?.routeComputedAt)),
  };
}

// --- snapshot ---------------------------------------------------------------

const byId = (list) => {
  const map = {};
  for (const item of list) if (item?.id) map[item.id] = item;
  return map;
};

/** Group raw order_products rows by their order_id. */
function groupItems(rawItems = []) {
  const grouped = {};
  for (const row of rawItems) {
    const orderId = str(first(row?.order_id, row?.OrderID, row?.orderId));
    if (!orderId) continue;
    (grouped[orderId] ??= []).push(row);
  }
  return grouped;
}

/**
 * Normalize a whole API response set into the store's `entities` shape.
 * The mock gateway runs this too, so the mock path exercises exactly the same
 * normalization the live path will.
 */
export function normalizeSnapshot(raw = {}) {
  const assignments = raw.employeeTeamAssignments ?? raw.assignments ?? [];
  const itemsByOrderId = groupItems(raw.orderProducts ?? raw.order_products ?? []);

  const slots = (raw.slots ?? raw.timeSlots ?? []).map(normalizeSlot).filter(s => s.id);
  const orders = (raw.orders ?? []).map(o => normalizeOrder(o, itemsByOrderId)).filter(o => o.id);
  const trucks = (raw.trucks ?? []).map(normalizeTruck).filter(t => t.id);
  const teams = (raw.teams ?? []).map(t => normalizeTeam(t, assignments)).filter(t => t.id);
  const employees = (raw.employees ?? []).map(normalizeEmployee).filter(e => e.id);
  const buildings = (raw.buildings ?? []).map(normalizeBuilding).filter(b => b.id);
  const customers = (raw.customers ?? []).map(normalizeCustomer).filter(c => c.id);
  const products = (raw.products ?? []).map(normalizeProduct).filter(p => p.id);

  return {
    slots: { byId: byId(slots), allIds: slots.map(s => s.id) },
    orders: { byId: byId(orders), allIds: orders.map(o => o.id) },
    trucks: { byId: byId(trucks), allIds: trucks.map(t => t.id) },
    teams: { byId: byId(teams), allIds: teams.map(t => t.id) },
    employees: { byId: byId(employees), allIds: employees.map(e => e.id) },
    buildings: { byId: byId(buildings), allIds: buildings.map(b => b.id) },
    customers: { byId: byId(customers), allIds: customers.map(c => c.id) },
    products: { byId: byId(products), allIds: products.map(p => p.id) },
  };
}

export const __internals = { num, bool, clock, dateKey, str };
