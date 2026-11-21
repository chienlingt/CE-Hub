import React, { useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import Button from '../../../common/Button';
import { badgeClass, FOCUS_RING } from '../../../common/tokens';
import {
  formatRange, groupLabel, plural, reasonLabel, sessionsText, targetLabel, toneKey,
} from '../../../../utils/fleet/fleetRules';

const SEG_ON = 'bg-white font-semibold text-gray-900 shadow-sm';
const SEG_OFF = 'text-gray-700 hover:text-gray-900';

function coverText(group, trucks) {
  if (group.fleet) return 'Covers every truck and every team, installer teams included. Trucks and teams added later are blocked too.';
  const types = group.targets.filter(t => t.resourceType === 'truck_type').map(t => t.scopeValue);
  if (types.length) {
    const plates = trucks.filter(t => types.includes(toneKey(t.tone))).map(t => t.plate);
    return `Covers ${plural(plates.length, 'truck')}: ${plates.join(', ') || 'none today'}. Trucks added later with this tonnage are blocked too.`;
  }
  return 'Covers only the trucks and teams below.';
}

/** Block-offs, one line per group, newest-relevant first. */
export default function BlockoffList({ view, onView, groups, loading, trucks, teams, canEdit, busyId, onDelete, onEnd, onRemoveTarget }) {
  const [expanded, setExpanded] = useState({});
  const [confirm, setConfirm] = useState(null); // { groupId, action }
  const resources = { trucks, teams };

  return (
    <section aria-labelledby="fleet-list-title">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="fleet-list-title" className="text-sm font-semibold text-gray-900">Block-offs</h3>
        <div role="group" aria-label="Show" className="inline-flex rounded-md bg-gray-200 p-1">
          {[['upcoming', 'Upcoming'], ['past', 'Past']].map(([id, label]) => (
            <button
              key={id} type="button" aria-pressed={view === id} onClick={() => onView(id)}
              className={`min-h-[2rem] rounded px-3 text-sm ${view === id ? SEG_ON : SEG_OFF} ${FOCUS_RING}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-600">Loading block-offs…</p>}
      {!loading && groups.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
          {view === 'past' ? 'No past block-offs.' : 'No upcoming block-offs.'}
        </p>
      )}

      <ul className="space-y-2">
        {groups.map(g => {
          const open = Boolean(expanded[g.groupId]);
          const label = groupLabel(g, resources);
          const busy = busyId === g.groupId;
          const asking = confirm?.groupId === g.groupId ? confirm.action : null;
          return (
            <li key={g.groupId} className="rounded-lg border border-gray-200 bg-white px-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button" aria-expanded={open}
                  onClick={() => setExpanded(e => ({ ...e, [g.groupId]: !e[g.groupId] }))}
                  className={`flex min-h-[2.75rem] min-w-0 flex-[1_1_18rem] items-center gap-2 rounded text-left ${FOCUS_RING}`}
                >
                  <ChevronRight className={`h-4 w-4 flex-none text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900">{label}</span>
                    <span className="block text-xs text-gray-600">{formatRange(g.startDate, g.endDate)} · {sessionsText(g.sessions)}</span>
                  </span>
                </button>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass('gray')}`}>{reasonLabel(g.reason)}</span>
                {g.status === 'started' && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass('blue')}`}>In progress</span>}
                {g.status === 'past' && <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClass('gray')}`}>Ended</span>}

                {canEdit && g.status !== 'past' && !asking && (
                  <Button
                    size="sm" variant={g.status === 'upcoming' ? 'alert' : 'secondary'} disabled={busy}
                    onClick={() => setConfirm({ groupId: g.groupId, action: g.status === 'upcoming' ? 'delete' : 'end' })}
                    aria-label={`${g.status === 'upcoming' ? 'Delete' : 'End early'} block-off ${label}`}
                  >
                    {g.status === 'upcoming' ? 'Delete' : 'End early'}
                  </Button>
                )}
                {asking && (
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-800">{asking === 'delete' ? 'Delete this block-off?' : 'End it today? Everything is free from today.'}</span>
                    <Button size="sm" variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>Keep</Button>
                    <Button
                      size="sm" variant="destructive" disabled={busy}
                      onClick={async () => { await (asking === 'delete' ? onDelete(g) : onEnd(g)); setConfirm(null); }}
                    >
                      {busy ? 'Working…' : asking === 'delete' ? 'Delete' : 'End early'}
                    </Button>
                  </span>
                )}
              </div>
              {g.note && <p className="ml-6 mt-0.5 text-sm text-gray-700">“{g.note}”</p>}
              {open && (
                <div className="ml-6 mt-2 border-t border-gray-100 pt-2">
                  <p className="mb-2 text-xs leading-relaxed text-gray-600">{coverText(g, trucks)}</p>
                  {!g.fleet && (
                    <ul className="flex flex-wrap gap-2">
                      {g.targets.map(t => {
                        const name = targetLabel(t, resources);
                        const canRemove = canEdit && g.status !== 'past' && g.targets.length > 1;
                        return (
                          <li key={t.id} className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-3 text-xs font-medium ${badgeClass('blue')} ${canRemove ? 'pr-1' : 'pr-3'}`}>
                            {name}
                            {canRemove && (
                              <button
                                type="button" aria-label={`Remove ${name} from this block-off`} disabled={busy}
                                onClick={() => onRemoveTarget(g, t)}
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-blue-200 ${FOCUS_RING}`}
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
