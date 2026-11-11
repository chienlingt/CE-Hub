// Scheduler config defaults, the grace period and the travel fallback.
//
// The real values come from the server (GET /api/scheduler/config, defaults and
// ranges in server/services/schedulerSettingsSpec.js). DEFAULT_SCHEDULE_CONFIG
// mirrors those server defaults ONLY for the mock/demo data source and for the
// first render before the server answers; the live gateway replaces it.
//
// Decisions (2026-11-12):
//   - Travel times come from B.2 / Google predictive traffic. The hourly traffic
//     matrix and multiplier settings were dropped; FALLBACK_LEG_MINUTES is the
//     one documented estimate used until a slot has a B.2 route plan.
//   - Grace = ETA tolerance: how far past the slot end a projected finish may
//     run. Building access windows are hard (constraint #2) and are NOT widened.

/**
 * Per-leg travel estimate when no B.2 route plan exists yet. Same figure as the
 * engine's own fallback (server/routes/orders.js TRAVEL_FALLBACK_MINUTES).
 */
export const FALLBACK_LEG_MINUTES = 17;

export const DEFAULT_SCHEDULE_CONFIG = {
  graceMinutes: 15,
  bufferMinutes: 10,
  loadMinutes: 20,
  unloadMinutes: 10,
  maxDOsPerSlot: 25,
  planningCutoff: '17:00',
  planningRunOffsetMinutes: 60,
  planningRunAt: '18:00',
  autoEnabled: true,
  duration: { baseDeliveryMinutes: 15, fallbackInstallMinutes: 0 },
  serviceTimeCatalogue: [],
  warehouse: { address: '', postal: '', lat: null, lng: null },
  slotWindows: [],
  spec: {},
  fleet: [],
  blockoffs: [],
  // 'default' until a gateway answers; then 'server' (live) or 'mock'.
  configScope: 'default',
};

/** Merge a partial config over the defaults, keeping nested objects intact. */
export function withDefaults(config = {}) {
  return {
    ...DEFAULT_SCHEDULE_CONFIG,
    ...config,
    duration: { ...DEFAULT_SCHEDULE_CONFIG.duration, ...(config.duration ?? {}) },
    serviceTimeCatalogue: config.serviceTimeCatalogue ?? [],
    blockoffs: config.blockoffs ?? [],
  };
}

/** Grace minutes as a non-negative number. */
export function graceMinutesOf(config = DEFAULT_SCHEDULE_CONFIG) {
  return Math.max(0, Number(config?.graceMinutes) || 0);
}
