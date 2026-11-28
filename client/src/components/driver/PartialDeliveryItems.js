// client/src/components/driver/PartialDeliveryItems.js
// FRD INT-09 — per-unit outcome review inside the Delivered (POD) step.
// Loaded units count as delivered unless the driver flips them; a unit that was never
// loaded is undelivered. Every undelivered unit needs a reason. The reason "Damaged" makes
// the unit damaged (FRD INT-10), and a damaged unit needs at least one photo.
import PhotoPicker from './PhotoPicker';
import { UNDELIVERED_REASONS, DAMAGED_REASON } from '../../utils/partialDelivery';

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
        const reasons = unit.loaded ? UNDELIVERED_REASONS.filter(r => r !== 'Not loaded') : UNDELIVERED_REASONS;
        return (
          <div key={unit.key} className={`p-3 space-y-2 ${unit.delivered ? '' : 'bg-amber-50/60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{unit.name}</p>
                <p className="font-mono text-xs text-gray-500 break-all">{unit.serial || `Unit #${unit.unit_number}`}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${unit.loaded ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  {unit.loaded ? 'Loaded' : 'Not loaded'}
                </span>
                {unit.loaded && (
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
                      onClick={() => onChange(unit.key, { reason, ...(reason !== DAMAGED_REASON && { damagePhotos: [] }) })}
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
                {unit.damaged && (
                  <div className="rounded-lg border border-red-200 bg-white p-2 space-y-1.5">
                    <PhotoPicker
                      onFilesSelected={files => onChange(unit.key, { damagePhotos: [...unit.damagePhotos, ...files] })}
                      label={`Photo of the damage (${unit.serial || `unit #${unit.unit_number}`})`}
                      variant="issue"
                      photosRequired
                    />
                    {unit.damagePhotos.length > 0 ? (
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>{unit.damagePhotos.length} photo{unit.damagePhotos.length === 1 ? '' : 's'} added</span>
                        <button type="button" disabled={disabled} onClick={() => onChange(unit.key, { damagePhotos: [] })}
                          className="text-red-600 hover:underline">Remove</button>
                      </div>
                    ) : (
                      <p className="text-xs text-red-600">A damaged unit needs at least one photo.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
