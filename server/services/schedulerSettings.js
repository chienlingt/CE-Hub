// server/services/schedulerSettings.js
//
// The one place B.1 settings are read and written. The new scheduling engine
// should call getSchedulerSettings() rather than reading scheduler_config or
// keeping its own constants. Rules and defaults live in schedulerSettingsSpec.js.

const prisma = require('../prismaClient');
const {
  DEFAULT_SERVICE_TIME_CATALOGUE,
  DEFAULT_WAREHOUSE,
  slotWindows,
  cronFromCutoff,
  validateSettingsPatch,
  toApi,
  specForClient,
} = require('./schedulerSettingsSpec');

class SettingsValidationError extends Error {
  constructor(errors) {
    super('Invalid scheduler settings');
    this.errors = errors;
  }
}

/** The single settings row, created with defaults on first use. */
async function getSettingsRow() {
  const existing = await prisma.scheduler_config.findUnique({ where: { singleton: true } });
  if (existing) return existing;
  return prisma.scheduler_config.upsert({
    where: { singleton: true },
    update: {},
    create: {
      singleton: true,
      warehouse_address: DEFAULT_WAREHOUSE.address,
      warehouse_postal: DEFAULT_WAREHOUSE.postal,
      cron_expression: cronFromCutoff(),
      service_time_catalogue: DEFAULT_SERVICE_TIME_CATALOGUE,
    },
  });
}

/** Settings in API shape (snake_case, defaults filled, cron derived). */
async function getSchedulerSettings() {
  return toApi(await getSettingsRow());
}

async function fleetSummary() {
  const groups = await prisma.trucks.groupBy({ by: ['tone'], _count: { _all: true } });
  return groups
    .map(g => ({ tone: g.tone, count: g._count._all }))
    .sort((a, b) => (b.tone ?? -1) - (a.tone ?? -1));
}

/** Everything the Settings screen needs in one response. */
async function getSettingsView() {
  const [settings, fleet] = await Promise.all([getSchedulerSettings(), fleetSummary()]);
  return { config: settings, slot_windows: slotWindows(), spec: specForClient(), fleet };
}

/**
 * Validate and save a patch.
 * @param {object} patch      PUT body (snake_case)
 * @param {object} opts
 * @param {string} [opts.employeeId]  recorded as updated_by
 * @param {Function} [opts.geocode]   (address) => {lat, lon}; injected for tests
 * @param {Function} [opts.onScheduleChange] called when cutoff/offset/enabled changed
 * @returns {{config: object, warnings: string[]}}
 */
async function updateSchedulerSettings(patch, { employeeId, geocode, onScheduleChange } = {}) {
  const row = await getSettingsRow();
  const { value, errors } = validateSettingsPatch(patch, row);
  if (Object.keys(errors).length) throw new SettingsValidationError(errors);

  const warnings = [];
  const addressChanged = value.warehouse_address !== undefined && value.warehouse_address !== row.warehouse_address;
  const coordsGiven = value.warehouse_latitude !== undefined || value.warehouse_longitude !== undefined;

  // Re-geocode when the address changes, unless the admin typed coordinates.
  if (addressChanged && !coordsGiven && geocode) {
    try {
      const { lat, lon } = await geocode(value.warehouse_address);
      value.warehouse_latitude = lat;
      value.warehouse_longitude = lon;
    } catch (err) {
      value.warehouse_latitude = null;
      value.warehouse_longitude = null;
      warnings.push(`Could not find coordinates for the new address (${err.message}). Enter latitude and longitude by hand.`);
    }
  }

  const cutoff = value.planning_cutoff ?? row.planning_cutoff;
  const offset = value.planning_run_offset_minutes ?? row.planning_run_offset_minutes;
  const data = {
    ...value,
    cron_expression: cronFromCutoff(cutoff, offset),
    updated_by: employeeId ?? null,
    updated_at: new Date(),
  };

  const saved = await prisma.scheduler_config.update({ where: { id: row.id }, data });

  const scheduleChanged = ['planning_cutoff', 'planning_run_offset_minutes', 'enabled']
    .some(k => k in value && value[k] !== row[k]);
  if (scheduleChanged && onScheduleChange) {
    try {
      await onScheduleChange(toApi(saved));
    } catch (err) {
      warnings.push(`Settings saved, but the auto-run schedule could not be restarted: ${err.message}`);
    }
  }

  return { config: toApi(saved), warnings };
}

module.exports = {
  SettingsValidationError,
  getSchedulerSettings,
  getSettingsView,
  updateSchedulerSettings,
};
