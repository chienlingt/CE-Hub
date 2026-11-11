import React, { useCallback, useMemo, useState } from 'react';
import { Settings, Save, RotateCcw, Truck, Clock, Gauge, Wrench, Info, MapPin, CalendarOff } from 'lucide-react';
import ScheduleProvider, { useScheduleState, useScheduleActions } from './ScheduleProvider';
import BufferField from './settings/BufferField';
import ConfigImpactPreview from './settings/ConfigImpactPreview';
import ServiceTimeCatalogue from './settings/ServiceTimeCatalogue';
import BlockoffEditor from './settings/BlockoffEditor';
import Button from '../../common/Button';
import EmptyState from '../../common/EmptyState';
import { badgeClass, FOCUS_RING } from '../../common/tokens';
import { useAuth } from '../../../contexts/AuthContext';
import { adminSessionHeaders } from '../../../utils/adminSessionHeaders';
import { withDefaults } from '../../../utils/schedule/gracePeriod';
import { diffConfig } from '../../../utils/schedule/schedulerConfigMapping';
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

/**
 * Saving needs an Admin login session: PUT /api/scheduler/config is behind
 * requireReviewAdmin. Outside an AuthProvider (tests, demo) it stays editable.
 */
function useCanEditSettings(configScope) {
  const auth = useAuth();
  if (configScope === 'mock' || !auth) return true;
  const role = auth.employeeData?.role;
  const roleName = String((typeof role === 'object' ? role?.name : role) ?? '').trim().toLowerCase();
  return roleName === 'admin' && Boolean(adminSessionHeaders().Authorization);
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

function TextField({ label, value, onChange, error, disabled, type = 'text', inputMode, placeholder, className = 'w-full' }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-700">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value ?? ''}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={`mt-1 rounded border ${error ? 'border-red-400' : 'border-gray-300'} px-2 py-1 text-sm ${FOCUS_RING} disabled:bg-gray-100 ${className}`}
      />
      {error && <span role="alert" className="mt-0.5 block text-[11px] text-red-600">{label} {error}</span>}
    </label>
  );
}

// Kept as typed (so "3.10" can be entered); the server parses and range-checks it.
const toCoord = (raw) => (String(raw).trim() === '' ? null : String(raw).trim());

/** 'HH:MM' + minutes -> 'HH:MM', for previewing an unsaved change. */
function addMinutes(clock, minutes) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(clock ?? ''));
  if (!m) return null;
  const total = Math.min(Number(m[1]) * 60 + Number(m[2]) + (Number(minutes) || 0), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function SettingsInner() {
  const state = useScheduleState();
  const actions = useScheduleActions();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);

  const saved = state.config;
  const working = draft ?? saved;
  const patchBody = useMemo(() => (draft ? diffConfig(saved, draft) : {}), [saved, draft]);
  const dirty = Object.keys(patchBody).length > 0;
  const canEdit = useCanEditSettings(saved.configScope);
  const spec = saved.spec ?? {};
  const range = (key, fallback) => ({ min: spec[key]?.min ?? fallback[0], max: spec[key]?.max ?? fallback[1] });

  const patch = useCallback((key, value) => {
    setDraft(prev => ({ ...(prev ?? saved), [key]: value }));
  }, [saved]);
  const patchNested = useCallback((key, sub, value) => {
    setDraft(prev => {
      const base = prev ?? saved;
      return { ...base, [key]: { ...(base[key] ?? {}), [sub]: value } };
    });
  }, [saved]);

  const impact = useMemo(() => {
    if (state.status !== 'ready' || !dirty) return null;
    return { before: measure(state, saved), after: measure(state, working) };
  }, [state, saved, working, dirty]);

  const discard = () => { setDraft(null); setErrors({}); };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setErrors({});
    setNotice(null);
    try {
      const result = await actions.patchConfig(patchBody);
      setDraft(null);
      const warnings = result?.saveWarnings ?? [];
      setNotice(warnings.length ? { tone: 'amber', text: warnings.join(' ') } : { tone: 'green', text: 'Saved. Applies to the next run and new bookings.' });
    } catch (err) {
      setErrors(err?.fieldErrors ?? {});
      setNotice({ tone: 'red', text: err?.fieldErrors ? 'Some values were rejected. Fix the highlighted fields.' : (err?.message ?? 'Save failed.') });
    } finally {
      setSaving(false);
    }
  };

  if (state.status === 'error') {
    return <EmptyState title="Could not load settings" description={state.error} />;
  }
  if (saved.configScope === 'error') {
    return <EmptyState title="Could not load scheduler settings" description={saved.configError} />;
  }
  if (saved.configScope === 'default') {
    return <p className="p-6 text-sm text-gray-500">Loading settings…</p>;
  }

  const disabled = !canEdit || saving;
  const runAt = addMinutes(working.planningCutoff, working.planningRunOffsetMinutes) ?? working.planningRunAt;
  const trucks = state.entities.trucks.allIds.map(id => state.entities.trucks.byId[id]);
  const teams = state.entities.teams.allIds.map(id => state.entities.teams.byId[id]);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Settings className="h-5 w-5 text-blue-600" aria-hidden="true" />
            Scheduler settings
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            The constraints B.1 schedules against. Changes apply to the next run and new bookings; nothing already booked is moved.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass(saved.configScope === 'mock' ? 'amber' : 'green')}`}>
            {saved.configScope === 'mock' ? 'Demo data — not saved to the server' : 'Saved on the server'}
          </span>
          {dirty && (
            <>
              <Button variant="secondary" size="sm" icon={RotateCcw} onClick={discard} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" icon={Save} onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {!canEdit && (
        <p className="mb-3 flex items-start gap-1.5 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <Info className="mt-px h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden="true" />
          View only. Changing scheduler settings needs an Admin login; sign in again as an Admin if your session expired.
        </p>
      )}
      {notice && (
        <p role="status" className={`mb-3 rounded px-3 py-2 text-xs ${badgeClass(notice.tone)}`}>{notice.text}</p>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-3">
          <Section
            icon={Gauge}
            title="Slot capacity"
            description="The most DOs that can be booked into one delivery window."
          >
            <BufferField
              label="Maximum DOs per slot"
              hint="Per date and window, across every area and lorry, so a day holds three times this."
              value={working.maxDOsPerSlot}
              onChange={v => patch('maxDOsPerSlot', v)}
              {...range('max_dos_per_slot', [1, 100])}
              unit="DO"
              disabled={disabled}
              error={errors.maxDOsPerSlot}
            />
          </Section>

          <Section
            icon={Clock}
            title="Grace period and buffers"
            description="Absorbs the gap between when a trip is planned at the cutoff and when it is actually driven."
          >
            <BufferField
              label="Grace period"
              hint="How far a trip's projected finish may run past the slot end and still count as fitting. Building access hours are never widened."
              value={working.graceMinutes}
              onChange={v => patch('graceMinutes', v)}
              {...range('grace_minutes', [0, 60])}
              disabled={disabled}
              error={errors.graceMinutes}
            />
            <BufferField
              label="Inter-stop buffer"
              hint="Slack added between consecutive stops."
              value={working.bufferMinutes}
              onChange={v => patch('bufferMinutes', v)}
              {...range('buffer_minutes', [0, 120])}
              disabled={disabled}
              error={errors.bufferMinutes}
            />
            <BufferField
              label="Loading time"
              hint="Deducted from the usable slot window before the first stop."
              value={working.loadMinutes}
              onChange={v => patch('loadMinutes', v)}
              {...range('load_minutes', [0, 120])}
              disabled={disabled}
              error={errors.loadMinutes}
            />
            <BufferField
              label="Unloading / return"
              value={working.unloadMinutes}
              onChange={v => patch('unloadMinutes', v)}
              {...range('unload_minutes', [0, 120])}
              disabled={disabled}
              error={errors.unloadMinutes}
            />
          </Section>

          <Section
            icon={Wrench}
            title="Service durations"
            description="Service time per order is base delivery + installation + dismantling."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <BufferField
                label="Base delivery time"
                hint="Per order, added to any installation."
                value={working.duration?.baseDeliveryMinutes}
                onChange={v => patchNested('duration', 'baseDeliveryMinutes', v)}
                {...range('base_delivery_minutes', [1, 120])}
                disabled={disabled}
                error={errors['duration.baseDeliveryMinutes']}
              />
              <BufferField
                label="Fallback install time"
                hint="When an item type has no confirmed install time."
                value={working.duration?.fallbackInstallMinutes}
                onChange={v => patchNested('duration', 'fallbackInstallMinutes', v)}
                {...range('fallback_install_minutes', [0, 480])}
                disabled={disabled}
                error={errors['duration.fallbackInstallMinutes']}
              />
            </div>
            <ServiceTimeCatalogue
              rows={working.serviceTimeCatalogue ?? []}
              onChange={rows => patch('serviceTimeCatalogue', rows)}
              range={spec.catalogue_minutes ?? { min: 0, max: 480 }}
              disabled={disabled}
              error={errors.serviceTimeCatalogue}
            />
          </Section>

          <Section
            icon={Truck}
            title="Fleet and availability"
            description="Fleet counts come from the Trucks list. Block a lorry or team for leave, MC, events or maintenance here."
          >
            <div className="flex flex-wrap gap-2">
              {(saved.fleet ?? []).length === 0 && <span className="text-xs text-gray-500">No trucks recorded.</span>}
              {(saved.fleet ?? []).map(f => (
                <span key={String(f.tone)} className="rounded border border-gray-200 px-2 py-1 text-xs tabular-nums text-gray-700">
                  <span className="font-semibold text-gray-900">{f.count}</span> × {f.tone != null ? `${f.tone}-ton` : 'unknown tonnage'}
                </span>
              ))}
            </div>
            <h3 className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-gray-700">
              <CalendarOff className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" /> Block-offs
            </h3>
            <BlockoffEditor
              blockoffs={saved.blockoffs ?? []}
              trucks={trucks}
              teams={teams}
              reasons={spec.blockoff_reasons}
              onAdd={actions.addBlockoff}
              onRemove={actions.removeBlockoff}
              disabled={!canEdit}
            />
          </Section>
        </div>

        <div className="min-w-0 space-y-3">
          <ConfigImpactPreview before={impact?.before} after={impact?.after} />

          <Section icon={Clock} title="Planning cutoff and auto-run" description="When the daily plan is compiled.">
            <label className="block">
              <span className="block text-xs font-medium text-gray-700">Cutoff time</span>
              <input
                type="time"
                step={(spec.planning_cutoff?.step_minutes ?? 15) * 60}
                min={spec.planning_cutoff?.min}
                max={spec.planning_cutoff?.max}
                value={working.planningCutoff ?? ''}
                disabled={disabled}
                onChange={e => patch('planningCutoff', e.target.value)}
                className={`mt-1 rounded border ${errors.planningCutoff ? 'border-red-400' : 'border-gray-300'} px-2 py-1 text-sm tabular-nums ${FOCUS_RING} disabled:bg-gray-100`}
              />
              {errors.planningCutoff && <span role="alert" className="mt-0.5 block text-[11px] text-red-600">Cutoff {errors.planningCutoff}</span>}
            </label>
            <BufferField
              label="Run the auto-scheduler after the cutoff by"
              hint="Lets late orders for tomorrow arrive before the schedule is built."
              value={working.planningRunOffsetMinutes}
              onChange={v => patch('planningRunOffsetMinutes', v)}
              {...range('planning_run_offset_minutes', [0, 240])}
              step={15}
              disabled={disabled}
              error={errors.planningRunOffsetMinutes}
            />
            <p className="text-xs text-gray-700">
              Auto-run: daily at <span className="font-semibold tabular-nums">{runAt ?? '—'}</span> (Kuala Lumpur)
            </p>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(working.autoEnabled)}
                disabled={disabled}
                onChange={e => patch('autoEnabled', e.target.checked)}
              />
              Run the auto-scheduler automatically
            </label>
          </Section>

          <Section icon={Clock} title="Delivery windows" description="The bookable delivery sessions. Read-only.">
            <ul className="space-y-1">
              {(saved.slotWindows ?? []).map(w => (
                <li key={w.id} className="flex items-baseline gap-2 text-xs">
                  <span className="flex-1 text-gray-700">{w.label}</span>
                  <span className="tabular-nums text-gray-500">{w.start}–{w.end}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section icon={MapPin} title="Warehouse" description="Trips start here. Coordinates are looked up automatically when the address changes.">
            <TextField
              label="Address"
              value={working.warehouse?.address}
              onChange={v => patchNested('warehouse', 'address', v)}
              disabled={disabled}
              error={errors['warehouse.address']}
            />
            <TextField
              label="Postcode"
              value={working.warehouse?.postal}
              onChange={v => patchNested('warehouse', 'postal', v)}
              inputMode="numeric"
              className="w-24"
              disabled={disabled}
              error={errors['warehouse.postal']}
            />
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label="Latitude"
                value={working.warehouse?.lat ?? ''}
                onChange={v => patchNested('warehouse', 'lat', toCoord(v))}
                inputMode="decimal"
                placeholder="auto"
                disabled={disabled}
                error={errors['warehouse.lat']}
              />
              <TextField
                label="Longitude"
                value={working.warehouse?.lng ?? ''}
                onChange={v => patchNested('warehouse', 'lng', toCoord(v))}
                inputMode="decimal"
                placeholder="auto"
                disabled={disabled}
                error={errors['warehouse.lng']}
              />
            </div>
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
