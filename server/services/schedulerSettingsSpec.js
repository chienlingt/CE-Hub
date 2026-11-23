// server/services/schedulerSettingsSpec.js
//
// Pure definition of the B.1 scheduler settings: defaults, valid ranges,
// validation and the API shape. No Prisma here, so it is unit-testable and the
// client can be sent the same ranges instead of hardcoding its own.
//
// Decisions behind these values: ~/.claude/plans/b1-scheduler-settings-live.md
// (2026-11-12). Values marked "confirm" are placeholders until Mr Lee confirms.

const { APPOINTMENT_SESSIONS } = require('./odooAppointmentSessions');

const SESSION_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };

// Editable integer settings. `min`/`max` are inclusive.
const SETTINGS_SPEC = {
  // ETA tolerance: how far past the slot end a projected finish may run before
  // the trip is judged not to fit. Building access windows are NOT widened.
  grace_minutes:               { type: 'int', min: 0, max: 60,  default: 15, unit: 'min' }, // confirm
  buffer_minutes:              { type: 'int', min: 0, max: 120, default: 10, unit: 'min' }, // confirm
  load_minutes:                { type: 'int', min: 0, max: 120, default: 20, unit: 'min' }, // confirm
  unload_minutes:              { type: 'int', min: 0, max: 120, default: 10, unit: 'min' }, // confirm
  // DOs per date + window across all areas and lorries (Meeting 13-10-2026 §1).
  max_dos_per_slot:            { type: 'int', min: 1, max: 100, default: 25, unit: 'DO' },
  // Additive: delivery + install + dismantle (proposal §5: 15 + 30 = 45 min).
  base_delivery_minutes:       { type: 'int', min: 1, max: 120, default: 15, unit: 'min' }, // confirm
  // Install time for a product with no item type, or whose type has no
  // confirmed install time. Edited on Information > Item.
  fallback_install_minutes:    { type: 'int', min: 0, max: 480, default: 0,  unit: 'min' },
  // The auto-run fires this long after the cutoff, so it runs after the Odoo
  // INT-12 5:00 PM fallback sync has pulled in tomorrow's missing DOOs.
  planning_run_offset_minutes: { type: 'int', min: 0, max: 240, default: 60, unit: 'min' },
  // Slot recommendation: a booked DO within this road distance counts as
  // nearby (proposal §5 Part 1 Step 2).
  nearby_km:                   { type: 'int', min: 1, max: 50,  default: 10, unit: 'km' },
};

const CUTOFF = { default: '17:00', min: '12:00', max: '22:00', stepMinutes: 15 };
// Block-off reasons are owned by B.4 Fleet Availability; the settings view lists them.
const { BLOCKOFF_REASONS } = require('./fleetAvailabilitySpec');

const DEFAULT_WAREHOUSE = {
  address: 'Lot 33, Jalan Delima 1/3, Subang Hi-tech Industrial Park, 40000 Shah Alam, Selangor',
  postal: '40000',
};

const DEFAULT_SETTINGS = {
  ...Object.fromEntries(Object.entries(SETTINGS_SPEC).map(([k, s]) => [k, s.default])),
  planning_cutoff: CUTOFF.default,
};

// ------------------------------------------------------------------ helpers

const clockToMinutes = (hhmm) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const minutesToClock = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** Integer from a number or numeric string, else null. */
function toInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

function toCoord(v) {
  if (v === null) return null;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

// ------------------------------------------------------------------ windows / cron

/** The three delivery windows, from the single Odoo session definition. */
function slotWindows() {
  return Object.entries(APPOINTMENT_SESSIONS).map(([id, [start, end]]) => ({
    id, label: SESSION_LABELS[id] ?? id, start, end,
  }));
}

function planningRunClock(cutoff, offsetMinutes) {
  const base = clockToMinutes(cutoff) ?? clockToMinutes(CUTOFF.default);
  const offset = Number.isInteger(offsetMinutes) ? offsetMinutes : SETTINGS_SPEC.planning_run_offset_minutes.default;
  return minutesToClock(Math.min(base + offset, 23 * 60 + 59));
}

/** node-cron expression (KL timezone is set on the job) for cutoff + offset. */
function cronFromCutoff(cutoff, offsetMinutes) {
  const [h, m] = planningRunClock(cutoff, offsetMinutes).split(':').map(Number);
  return `${m} ${h} * * *`;
}

// ------------------------------------------------------------------ validation

/**
 * Validate a PUT body. Returns `{ value, errors }`; `value` holds only the
 * accepted, normalised fields. `current` is the stored row, needed for
 * cross-field rules (cutoff + offset must not pass midnight).
 */
function validateSettingsPatch(patch = {}, current = {}) {
  const value = {};
  const errors = {};

  for (const [key, raw] of Object.entries(patch ?? {})) {
    const spec = SETTINGS_SPEC[key];
    if (spec) {
      const n = toInt(raw);
      if (n === null || n < spec.min || n > spec.max) {
        errors[key] = `must be a whole number from ${spec.min} to ${spec.max}`;
      } else {
        value[key] = n;
      }
      continue;
    }

    switch (key) {
      case 'planning_cutoff': {
        const mins = clockToMinutes(raw);
        if (mins === null || mins < clockToMinutes(CUTOFF.min) || mins > clockToMinutes(CUTOFF.max)
          || mins % CUTOFF.stepMinutes !== 0) {
          errors[key] = `must be HH:MM from ${CUTOFF.min} to ${CUTOFF.max} in ${CUTOFF.stepMinutes}-minute steps`;
        } else {
          value[key] = raw;
        }
        break;
      }
      case 'enabled':
        if (typeof raw === 'boolean') value[key] = raw;
        else errors[key] = 'must be true or false';
        break;
      case 'warehouse_address': {
        const s = typeof raw === 'string' ? raw.trim() : '';
        if (!s || s.length > 300) errors[key] = 'is required (max 300 characters)';
        else value[key] = s;
        break;
      }
      case 'warehouse_postal': {
        const s = typeof raw === 'string' ? raw.trim() : String(raw ?? '');
        if (!/^\d{5}$/.test(s)) errors[key] = 'must be a 5-digit postcode';
        else value[key] = s;
        break;
      }
      case 'warehouse_latitude':
      case 'warehouse_longitude': {
        const limit = key === 'warehouse_latitude' ? 90 : 180;
        const n = toCoord(raw);
        if (n === undefined || (n !== null && Math.abs(n) > limit)) errors[key] = `must be a number from -${limit} to ${limit}, or empty`;
        else value[key] = n;
        break;
      }
      default:
        errors[key] = 'is not an editable scheduler setting';
    }
  }

  // Cross-field: the derived run time must stay on the same day.
  if (!errors.planning_cutoff && !errors.planning_run_offset_minutes) {
    const cutoff = value.planning_cutoff ?? current?.planning_cutoff ?? CUTOFF.default;
    const offset = value.planning_run_offset_minutes ?? current?.planning_run_offset_minutes
      ?? SETTINGS_SPEC.planning_run_offset_minutes.default;
    if (clockToMinutes(cutoff) + offset > 23 * 60 + 59) {
      const field = 'planning_run_offset_minutes' in value ? 'planning_run_offset_minutes' : 'planning_cutoff';
      errors[field] = 'cutoff plus run offset must be before midnight';
    }
  }

  return { value, errors };
}

// ------------------------------------------------------------------ API shape

const intOr = (v, d) => (Number.isInteger(v) ? v : d);
const coord = (v) => (v === null || v === undefined ? null : Number(v));

/** Stored row (or null) -> the object GET/PUT return. */
function toApi(row) {
  const r = row ?? {};
  const settings = Object.fromEntries(
    Object.keys(SETTINGS_SPEC).map(k => [k, intOr(r[k], SETTINGS_SPEC[k].default)]),
  );
  const planningCutoff = clockToMinutes(r.planning_cutoff) !== null ? r.planning_cutoff : CUTOFF.default;

  return {
    id: r.id ?? null,
    warehouse_address: r.warehouse_address ?? DEFAULT_WAREHOUSE.address,
    warehouse_postal: r.warehouse_postal ?? DEFAULT_WAREHOUSE.postal,
    warehouse_latitude: coord(r.warehouse_latitude),
    warehouse_longitude: coord(r.warehouse_longitude),
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    ...settings,
    planning_cutoff: planningCutoff,
    // Derived, never edited directly.
    planning_run_at: planningRunClock(planningCutoff, settings.planning_run_offset_minutes),
    cron_expression: cronFromCutoff(planningCutoff, settings.planning_run_offset_minutes),
    last_run_at: r.last_run_at ?? null,
    updated_at: r.updated_at ?? null,
    updated_by: r.updated_by ?? null,
  };
}

/** Ranges for the client, so it does not hardcode its own. */
function specForClient() {
  return {
    ...Object.fromEntries(Object.entries(SETTINGS_SPEC).map(([k, s]) => [k, { min: s.min, max: s.max, unit: s.unit }])),
    planning_cutoff: { min: CUTOFF.min, max: CUTOFF.max, step_minutes: CUTOFF.stepMinutes },
    blockoff_reasons: [...BLOCKOFF_REASONS],
  };
}

module.exports = {
  SETTINGS_SPEC,
  DEFAULT_SETTINGS,
  DEFAULT_WAREHOUSE,
  BLOCKOFF_REASONS,
  slotWindows,
  planningRunClock,
  cronFromCutoff,
  validateSettingsPatch,
  toApi,
  specForClient,
};
