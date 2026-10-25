import React from 'react';
import Meter from '../../../common/Meter';
import { kgToTonnes, cm3ToM3 } from '../../../../utils/schedule/capacityRules';
import { formatMinutes } from '../../../../utils/schedule/serviceDuration';

/**
 * A slot's load. `preview` is the projected capacity while a drag hovers, so
 * the dispatcher sees the consequence before dropping.
 *
 * Volume leads because it is REAL: it is computed from truck dimensions and
 * product package dimensions, both of which exist in the schema. Weight is
 * shown only when every product in the slot has a recorded weight — otherwise
 * it reads "—", never a fabricated figure.
 */
export default function CapacityMeter({ capacity, preview = null, compact = false }) {
  const shown = preview ?? capacity;
  if (!shown) return null;

  const delta = preview && capacity
    ? {
      doCount: preview.doCount - capacity.doCount,
      volumePct: (preview.volumePct ?? 0) - (capacity.volumePct ?? 0),
    }
    : null;

  const weightLabel = shown.weightKnown && shown.weightCapKg
    ? `${kgToTonnes(shown.weightKg).toFixed(1)}/${kgToTonnes(shown.weightCapKg).toFixed(1)} t`
    : '—';

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <Meter
        label="DOs"
        pct={shown.doPct}
        value={`${shown.doCount}/${shown.doCap}${delta?.doCount ? ` (+${delta.doCount})` : ''}`}
        size={compact ? 'sm' : 'md'}
      />
      <Meter
        label="Volume"
        pct={shown.volumePct}
        value={shown.volumePct === null
          ? `${cm3ToM3(shown.volumeCm3).toFixed(1)} m³`
          : `${Math.round(shown.volumePct * 100)}%`}
        size={compact ? 'sm' : 'md'}
      />
      {!compact && (
        <>
          <Meter
            label="Payload"
            pct={shown.weightPct}
            value={weightLabel}
            size="sm"
          />
          <Meter
            label="Work"
            pct={shown.timePct}
            value={shown.slotMinutes === null
              ? formatMinutes(shown.serviceMinutes)
              : `${formatMinutes(shown.serviceMinutes)} / ${formatMinutes(shown.slotMinutes)}`}
            size="sm"
          />
        </>
      )}

      {!shown.weightKnown && !compact && (
        <p className="text-[10px] leading-tight text-gray-400">
          Payload unchecked — some products have no recorded weight.
        </p>
      )}
    </div>
  );
}
