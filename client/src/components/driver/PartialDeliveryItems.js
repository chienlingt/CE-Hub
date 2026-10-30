// client/src/components/driver/PartialDeliveryItems.js
// FRD INT-09 — per-unit outcome review inside the Delivered (POD) step.
// Unloaded units count as delivered unless the driver flips them; units still on the van
// are undelivered. Every undelivered unit needs a reason.
import { UNDELIVERED_REASONS } from '../../utils/partialDelivery';

/**
 * @param {{
 *   units: Array,                                  // from classifyUnits()
 *   onChange: (key: string, patch: object) => void,
 *   disabled?: boolean,
 * }}
 */
export default function PartialDeliveryItems({ units, onChange, disabled = false }) {
  return (
    <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
      {units.map(unit => {
        const reasons = unit.scanned ? UNDELIVERED_REASONS.filter(r => r !== 'Not unloaded') : UNDELIVERED_REASONS;
        return (
          <div key={unit.key} className={`p-3 space-y-2 ${unit.delivered ? '' : 'bg-amber-50/60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{unit.name}</p>
                <p className="font-mono text-xs text-gray-500 break-all">{unit.serial || `Unit #${unit.unit_number}`}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${unit.scanned ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                  {unit.scanned ? 'Unloaded' : 'Still on van'}
                </span>
                {unit.scanned && (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={!unit.delivered}
                    onClick={() => onChange(unit.key, unit.delivered ? { undelivered: true, reason: '' } : { undelivered: false })}
                    className={`rounded-lg border px-2 py-1 text-xs font-medium ${unit.delivered
                      ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      : 'border-amber-300 bg-amber-100 text-amber-800'}`}
                  >
                    {unit.delivered ? 'Not delivered' : 'Undo'}
                  </button>
                )}
              </div>
            </div>

            {!unit.delivered && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">Reason <span className="text-red-500">*</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {reasons.map(reason => (
                    <button
                      key={reason}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(unit.key, { reason })}
                      className={`rounded-full border px-2.5 py-1 text-xs ${unit.choice === reason
                        ? 'border-amber-500 bg-amber-500 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                {unit.choice === 'Other' && (
                  <input
                    type="text"
                    value={unit.otherText}
                    disabled={disabled}
                    maxLength={150}
                    onChange={e => onChange(unit.key, { otherText: e.target.value })}
                    placeholder="Describe why this unit was not delivered…"
                    aria-label={`Other reason for ${unit.serial || unit.name}`}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
