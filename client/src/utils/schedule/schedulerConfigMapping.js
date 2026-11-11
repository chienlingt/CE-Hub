// Maps between GET/PUT /api/scheduler/config (snake_case, server/services/
// schedulerSettingsSpec.js) and the client config shape the rule modules read.
// Pure, so both gateways and the tests share one mapping.

// Flat client key -> server field.
const SCALAR_FIELDS = {
  graceMinutes: 'grace_minutes',
  bufferMinutes: 'buffer_minutes',
  loadMinutes: 'load_minutes',
  unloadMinutes: 'unload_minutes',
  maxDOsPerSlot: 'max_dos_per_slot',
  planningCutoff: 'planning_cutoff',
  planningRunOffsetMinutes: 'planning_run_offset_minutes',
  autoEnabled: 'enabled',
};
const DURATION_FIELDS = {
  baseDeliveryMinutes: 'base_delivery_minutes',
  fallbackInstallMinutes: 'fallback_install_minutes',
};
const WAREHOUSE_FIELDS = {
  address: 'warehouse_address',
  postal: 'warehouse_postal',
  lat: 'warehouse_latitude',
  lng: 'warehouse_longitude',
};
const BLOCKOFF_FIELDS = {
  resourceType: 'resource_type',
  resourceId: 'resource_id',
  startDate: 'start_date',
  endDate: 'end_date',
  reason: 'reason',
  note: 'note',
};

// Server field -> the client field name a form shows the error against.
const SERVER_TO_CLIENT_FIELD = {
  ...Object.fromEntries(Object.entries(SCALAR_FIELDS).map(([c, s]) => [s, c])),
  ...Object.fromEntries(Object.entries(DURATION_FIELDS).map(([c, s]) => [s, `duration.${c}`])),
  ...Object.fromEntries(Object.entries(WAREHOUSE_FIELDS).map(([c, s]) => [s, `warehouse.${c}`])),
  ...Object.fromEntries(Object.entries(BLOCKOFF_FIELDS).map(([c, s]) => [s, c])),
  service_time_catalogue: 'serviceTimeCatalogue',
};

export function catalogueEntryFromServer(e = {}) {
  return {
    id: e.id,
    label: e.label,
    odooCategories: Array.isArray(e.odoo_categories) ? e.odoo_categories : [],
    installMinutes: e.install_minutes ?? null,
    dismantleMinutes: e.dismantle_minutes ?? null,
    requiresInstaller: Boolean(e.requires_installer),
  };
}

export function catalogueEntryToServer(e = {}) {
  return {
    id: e.id,
    label: e.label,
    odoo_categories: Array.isArray(e.odooCategories) ? e.odooCategories : [],
    install_minutes: e.installMinutes ?? null,
    dismantle_minutes: e.dismantleMinutes ?? null,
    requires_installer: Boolean(e.requiresInstaller),
  };
}

export function blockoffFromServer(b = {}) {
  return {
    id: b.id,
    resourceType: b.resource_type,
    resourceId: b.resource_id,
    startDate: String(b.start_date ?? '').slice(0, 10),
    endDate: String(b.end_date ?? '').slice(0, 10),
    reason: b.reason,
    note: b.note ?? null,
  };
}

export function blockoffToServer(b = {}) {
  return {
    resource_type: b.resourceType,
    resource_id: b.resourceId,
    start_date: b.startDate,
    end_date: b.endDate,
    reason: b.reason,
    note: b.note ?? null,
  };
}

/**
 * GET /api/scheduler/config body (+ block-off rows) -> client config.
 * @param {{config: object, slot_windows?: object[], spec?: object, fleet?: object[]}} view
 */
export function configFromServer(view = {}, blockoffs = []) {
  const c = view.config ?? {};
  const out = {};
  for (const [client, server] of Object.entries(SCALAR_FIELDS)) out[client] = c[server];
  return {
    ...out,
    autoEnabled: Boolean(c.enabled),
    planningRunAt: c.planning_run_at ?? null,
    cronExpression: c.cron_expression ?? '',
    duration: Object.fromEntries(Object.entries(DURATION_FIELDS).map(([cl, s]) => [cl, c[s]])),
    serviceTimeCatalogue: (Array.isArray(c.service_time_catalogue) ? c.service_time_catalogue : [])
      .map(catalogueEntryFromServer),
    warehouse: {
      address: c.warehouse_address ?? '',
      postal: c.warehouse_postal ?? '',
      lat: c.warehouse_latitude ?? null,
      lng: c.warehouse_longitude ?? null,
    },
    lastRunAt: c.last_run_at ?? null,
    updatedAt: c.updated_at ?? null,
    updatedBy: c.updated_by ?? null,
    slotWindows: Array.isArray(view.slot_windows) ? view.slot_windows : [],
    spec: view.spec ?? {},
    fleet: Array.isArray(view.fleet) ? view.fleet : [],
    blockoffs: (Array.isArray(blockoffs) ? blockoffs : []).map(blockoffFromServer),
    configScope: 'server',
  };
}

/** Client patch -> PUT body. Only keys present in the patch are sent. */
export function patchToServer(patch = {}) {
  const body = {};
  for (const [client, server] of Object.entries(SCALAR_FIELDS)) {
    if (patch[client] !== undefined) body[server] = patch[client];
  }
  for (const [client, server] of Object.entries(DURATION_FIELDS)) {
    if (patch.duration?.[client] !== undefined) body[server] = patch.duration[client];
  }
  for (const [client, server] of Object.entries(WAREHOUSE_FIELDS)) {
    if (patch.warehouse?.[client] !== undefined) body[server] = patch.warehouse[client];
  }
  if (patch.serviceTimeCatalogue !== undefined) {
    body.service_time_catalogue = patch.serviceTimeCatalogue.map(catalogueEntryToServer);
  }
  return body;
}

/** `{ grace_minutes: 'msg' }` -> `{ graceMinutes: 'msg' }` */
export function fieldErrorsFromServer(errors = {}) {
  return Object.fromEntries(
    Object.entries(errors ?? {}).map(([k, v]) => [SERVER_TO_CLIENT_FIELD[k] ?? k, v]),
  );
}

/**
 * Minimal patch between the saved config and a draft. Nested `warehouse` and
 * `duration` are diffed per field, so changing only the address does not resend
 * the old coordinates (the server geocodes only when coordinates are absent).
 */
export function diffConfig(saved = {}, draft = {}) {
  const patch = {};
  for (const key of [...Object.keys(SCALAR_FIELDS), 'serviceTimeCatalogue']) {
    if (JSON.stringify(saved[key]) !== JSON.stringify(draft[key])) patch[key] = draft[key];
  }
  for (const key of ['warehouse', 'duration']) {
    const a = saved[key] ?? {};
    const b = draft[key] ?? {};
    const changed = Object.keys(b).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (changed.length) patch[key] = Object.fromEntries(changed.map(k => [k, b[k]]));
  }
  return patch;
}
