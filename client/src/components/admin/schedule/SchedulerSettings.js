import React, { useCallback, useMemo, useState } from 'react';
import { Settings, Save, RotateCcw, Truck, Clock, Gauge, Wrench, Info } from 'lucide-react';
import ScheduleProvider, { useScheduleState, useScheduleActions } from './ScheduleProvider';
import BufferField from './settings/BufferField';
import ConfigImpactPreview from './settings/ConfigImpactPreview';
import Button from '../../common/Button';
import EmptyState from '../../common/EmptyState';
import { badgeClass, FOCUS_RING } from '../../common/tokens';
import { DEFAULT_SCHEDULE_CONFIG, withDefaults } from '../../../utils/schedule/gracePeriod';
import { SLOT_WINDOWS } from '../../../utils/schedule/slotWindows';
import { selectSlotIdsByDate, selectOrderIdsBySlot, selectSlotLaneVM } from '../../../utils/schedule/scheduleSelectors';
import { evaluateSlotAccessWindows } from '../../../utils/schedule/accessWindowRules';

/** Count what a given config would produce, so the impact preview is real. */
function measure(state, config) {
  const cfg = withDefaults(config);
  const cache = { orderIdsBySlot: selectOrderIdsBySlot(state), slotIdsByDate: selectSlotIdsByDate(state) };
  const probe = { ...state, config: cfg };

  let blocking = 0;
  let access = 0;
  let overtime = 0;
  let capacity = 0;

  for (const slotId of state.entities.slots.allIds) {
    const lane = selectSlotLaneVM(probe, slotId, cache);
    if (!lane || lane.capacity.doCount === 0) continue;

    blocking += lane.capacity.issues.filter(i => i.severity === 'blocking').length;
    if (lane.capacity.over.includes('time')) overtime += 1;
    if (lane.capacity.over.includes('volume') || lane.capacity.over.includes('weight')
      || lane.window.over) capacity += 1;

    const stops = evaluateSlotAccessWindows({
      slot: { id: lane.id, dateKey: lane.dateKey, start: lane.start, end: lane.end, routePlan: lane.route.plan },
      orders: lane.orders,
      buildingsById: state.entities.buildings.byId,
      productsById: state.entities.products.byId,
      config: cfg,
    });
    access += stops.filter(s => !s.ok).length;
  }

  return { blocking, access, overtime, capacity };
}

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="rounded-md border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-3 py-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[11px] text-gray-500">{description}</p>}
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  );
}

function SettingsInner() {
  const state = useScheduleState();
  const actions = useScheduleActions();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const saved = state.config;
  const working = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  const patch = useCallback((key, value) => {
    setDraft(prev => ({ ...(prev ?? saved), [key]: value }));
  }, [saved]);

  const impact = useMemo(() => {
    if (state.status !== 'ready' || !dirty) return null;
    return { before: measure(state, saved), after: measure(state, working) };
  }, [state, saved, working, dirty]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    await actions.patchConfig(draft);
    setSaving(false);
    setDraft(null);
  };

  if (state.status === 'error') {
    return <EmptyState title="Could not load settings" description={state.error} />;
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Settings className="h-5 w-5 text-blue-600" aria-hidden="true" />
            Scheduler settings
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            The constraints B.1 schedules against. Changes affect the next scheduler run.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Honest about where this is stored. Until the scheduler_config
              migration lands, these live in this browser only. */}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass('amber')}`}>
            {saved.configScope === 'local' ? 'Local only — not saved to the server' : 'Saved on the server'}
          </span>
          {dirty && (
            <>
              <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => setDraft(null)}>
                Discard
              </Button>
              <Button size="sm" icon={Save} onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Section
            icon={Clock}
            title="Grace period and buffers"
            description="Absorbs the gap between when a route is planned at the 5pm cutoff and when it is actually driven the next morning."
          >
            <BufferField
              label="Grace period"
              hint="Tolerance either side of a building's access window. Dr Chiew's point: evening-peak traffic at planning time overstates the next morning's journey."
              value={working.graceMinutes}
              onChange={v => patch('graceMinutes', v)}
              max={120}
            />
            <BufferField
              label="Inter-stop buffer"
              hint="Slack added between consecutive stops."
              value={working.bufferMinutes}
              onChange={v => patch('bufferMinutes', v)}
              max={60}
            />
            <BufferField
              label="Loading time"
              hint="Deducted from the usable slot window before the first stop."
              value={working.loadMinutes}
              onChange={v => patch('loadMinutes', v)}
              max={120}
            />
            <BufferField
              label="Unloading / return"
              value={working.unloadMinutes}
              onChange={v => patch('unloadMinutes', v)}
              max={120}
            />
          </Section>

          <Section
            icon={Gauge}
            title="Slot capacity"
            description="Mr Lee and KF set 25 DOs per delivery slot as the initial limit (Meeting §1)."
          >
            <BufferField
              label="Maximum DOs per slot"
              hint="Shared by every lorry in the AM and in the PM window, so a day holds twice this. NIGHT runs only when the warehouse admin starts it and has no cap — each night DO adds one."
              value={working.maxDOsPerSlot}
              onChange={v => patch('maxDOsPerSlot', v)}
              min={1}
              max={60}
              step={1}
              unit="DO"
            />
          </Section>

          <Section
            icon={Clock}
            title="Delivery windows"
            description="Generated slot templates. These are hardcoded in the engine today, which is why the three sources in the codebase disagree about them."
          >
            <div className="overflow-hidden rounded border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Window</th>
                    <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Start</th>
                    <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">End</th>
                  </tr>
                </thead>
                <tbody>
                  {SLOT_WINDOWS.map(w => (
                    <tr key={w.id} className="border-t border-gray-100">
                      <td className="px-2 py-1 font-medium text-gray-800">{w.longLabel}</td>
                      <td className="px-2 py-1 tabular-nums text-gray-700">{w.start}</td>
                      <td className="px-2 py-1 tabular-nums text-gray-700">{w.end}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
              <Info className="mt-px h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden="true" />
              Editing these needs the <code className="font-mono">slot_templates</code> column on
              scheduler_config, so the engine reads them instead of its hardcoded array.
            </p>
          </Section>

          <Section
            icon={Truck}
            title="Fleet availability"
            description="Mr Lee confirmed 8 × 3-ton and 13 × 1-ton, and asked to adjust availability himself (Meeting §4)."
          >
            {state.status !== 'ready' ? (
              <p className="text-xs text-gray-500">Loading fleet…</p>
            ) : (
              <div className="overflow-hidden rounded border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Lorry</th>
                      <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Tone</th>
                      <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Load space</th>
                      <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Payload</th>
                      <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Off day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.entities.trucks.allIds.map((id) => {
                      const t = state.entities.trucks.byId[id];
                      const m3 = (t.lengthCm && t.widthCm && t.heightCm)
                        ? ((t.lengthCm * t.widthCm * t.heightCm) / 1e6).toFixed(1)
                        : null;
                      return (
                        <tr key={id} className="border-t border-gray-100">
                          <td className="px-2 py-1 font-mono text-gray-800">{t.plate}</td>
                          <td className="px-2 py-1 tabular-nums text-gray-700">{t.tone ?? '—'}t</td>
                          <td className="px-2 py-1 tabular-nums text-gray-700">{m3 ? `${m3} m³` : '—'}</td>
                          <td className="px-2 py-1 tabular-nums text-gray-700">
                            {/* Never a fabricated figure. */}
                            {t.maxPayloadKg ? `${t.maxPayloadKg} kg` : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-2 py-1 text-gray-600">{t.offDay ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
              <Info className="mt-px h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden="true" />
              Payload is mock data. There is no weight column in the database yet, so on live data
              this reads “—” rather than showing a derived figure.
            </p>
          </Section>

          <Section
            icon={Wrench}
            title="Service durations"
            description="B.1 estimates service time from these. Calibrate against Mr Lee's real figures — washing-machine install 1.5h with 3–4 people, large-TV bracket 2–3h, fridge 1h (condo 1h+)."
          >
            {state.status !== 'ready' ? (
              <p className="text-xs text-gray-500">Loading products…</p>
            ) : (
              <div className="overflow-hidden rounded border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Product</th>
                      <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Install min–max</th>
                      <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Dismantle</th>
                      <th scope="col" className="px-2 py-1 text-left font-medium text-gray-600">Installer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.entities.products.allIds.map((id) => {
                      const p = state.entities.products.byId[id];
                      return (
                        <tr key={id} className="border-t border-gray-100">
                          <td className="px-2 py-1 text-gray-800">{p.name}</td>
                          <td className="px-2 py-1 tabular-nums text-gray-700">
                            {p.installMinutesMin || p.installMinutesMax
                              ? `${p.installMinutesMin ?? '—'}–${p.installMinutesMax ?? '—'} min`
                              : <span className="text-gray-400">none</span>}
                          </td>
                          <td className="px-2 py-1 tabular-nums text-gray-700">
                            {p.dismantleMinutes ? `${p.dismantleMinutes} min` : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-2 py-1 text-gray-700">{p.installerRequired ? 'Required' : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-3">
          <ConfigImpactPreview before={impact?.before} after={impact?.after} />

          <Section icon={Gauge} title="Traffic matrix" description="Per-hour multipliers applied to travel estimates.">
            <ul className="space-y-1">
              {(working.trafficMatrix ?? DEFAULT_SCHEDULE_CONFIG.trafficMatrix).map(band => (
                <li key={band.id} className="flex items-baseline gap-2 text-xs">
                  <span className="flex-1 text-gray-700">{band.label}</span>
                  <span className="tabular-nums text-gray-500">
                    {String(band.fromHour).padStart(2, '0')}:00–{String(band.toHour).padStart(2, '0')}:00
                  </span>
                  <span className="w-10 text-right tabular-nums font-medium text-gray-900">
                    ×{band.multiplier}
                  </span>
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
              <Info className="mt-px h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden="true" />
              These bands already exist in <code className="font-mono">routingService.js</code> but
              are orphaned — the live engine uses a flat ×1.5.
            </p>
          </Section>

          <Section icon={Clock} title="Planning cutoff" description="When the daily plan is compiled.">
            <label className="block">
              <span className="block text-xs font-medium text-gray-700">Cutoff time</span>
              <input
                type="time"
                value={working.planningCutoff ?? '17:00'}
                onChange={e => patch('planningCutoff', e.target.value)}
                className={`mt-1 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums ${FOCUS_RING}`}
              />
            </label>
            <p className="text-[11px] text-gray-500">
              Mr Lee compiles the schedule around 5pm today, which is the behaviour this mirrors.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function SchedulerSettings() {
  return (
    <ScheduleProvider>
      <SettingsInner />
    </ScheduleProvider>
  );
}
