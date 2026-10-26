import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, AlertTriangle, ArrowRight } from 'lucide-react';
import { cm3ToM3, kgToTonnes, truckVolumeCm3 } from '../../../../utils/schedule/capacityRules';

function CrewLine({ role, person, pinned }) {
  return (
    <p className="flex items-baseline justify-between gap-2">
      <span><span className="inline-block w-12 text-gray-500">{role}</span>{person.name}</span>
      {person.phone && (pinned ? (
        <a href={`tel:${person.phone}`} className="inline-flex items-center gap-0.5 tabular-nums text-blue-700 hover:underline">
          <Phone className="h-3 w-3" aria-hidden="true" />{person.phone}
        </a>
      ) : (
        <span className="inline-flex items-center gap-0.5 tabular-nums text-gray-600">
          <Phone className="h-3 w-3" aria-hidden="true" />{person.phone}
        </span>
      ))}
    </p>
  );
}

/**
 * The lorry's details, shared by the header's hover card and its drawer: cargo
 * space, crew contacts and the day's load. CE Hub fields only. The Board never
 * edits the pairing — the drawer links to the Information panel for that.
 */
export default function LorryCard({ detail, pinned = false }) {
  if (!detail) return null;
  const { truck, availability, team, teamState, teamReason, installerCapable, driver, helpers, load, crewChanged, storedTeamNames } = detail;
  const volume = truckVolumeCm3(truck);
  const dims = [truck.lengthCm, truck.widthCm, truck.heightCm].every(Boolean)
    ? `${truck.lengthCm} × ${truck.widthCm} × ${truck.heightCm} cm`
    : null;

  return (
    <div className="space-y-2 text-xs text-gray-700">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900">
          <span className="font-mono">{truck.plate}</span>
          {truck.tone ? ` · ${truck.tone} ton` : ''}
        </span>
        {availability.available
          ? <span className="whitespace-nowrap text-[11px] font-medium text-green-700">● Available</span>
          : <span className="text-right text-[11px] font-medium text-gray-600">Off — {availability.reason}</span>}
      </div>
      {(dims || volume) && (
        <p className="tabular-nums text-gray-500">
          {[dims && `Cargo ${dims}`, volume && `${cm3ToM3(volume).toFixed(1)} m³`,
            truck.maxPayloadKg && `${kgToTonnes(truck.maxPayloadKg).toFixed(1)} t payload`]
            .filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="space-y-0.5 border-t border-gray-100 pt-2">
        {teamState === 'none' ? (
          <p className="flex items-center gap-1 font-medium text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> No team paired with this lorry
          </p>
        ) : (
          <>
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-gray-900">{team.name}</span>
              {installerCapable && <span className="text-[11px] text-gray-500">installer-capable</span>}
            </p>
            {teamState === 'unavailable' && (
              <p className="flex items-center gap-1 font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {teamReason}
              </p>
            )}
            {driver && <CrewLine role="Driver" person={driver} pinned={pinned} />}
            {helpers.map(helper => <CrewLine key={helper.id} role="Helper" person={helper} pinned={pinned} />)}
          </>
        )}
      </div>

      <div className="border-t border-gray-100 pt-2">
        <p className="mb-0.5 text-gray-500">This day</p>
        {load.map(slot => (
          <p key={slot.windowId} className="tabular-nums">
            <span className="inline-block w-12 font-medium">{slot.label}</span>
            {slot.off ? '— off —' : slot.doCount === 0 ? '—' : (
              `${slot.doCount} DO${slot.doCount === 1 ? '' : 's'}`
              + (slot.volumePct !== null ? ` · ${Math.round(slot.volumePct * 100)}% vol` : '')
            )}
          </p>
        ))}
      </div>

      {crewChanged && (
        <p className="flex items-start gap-1 text-amber-700">
          <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          Crew changed since scheduling{storedTeamNames.length ? ` (was ${storedTeamNames.join(', ')})` : ''}.
        </p>
      )}

      {pinned && (
        <div className="border-t border-gray-100 pt-2 text-right">
          <Link to="/info/team" className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">
            Edit pairing <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
