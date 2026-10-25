import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import SlideOver from '../../../common/SlideOver';
import EmptyState from '../../../common/EmptyState';
import { badgeClass, FOCUS_RING } from '../../../common/tokens';
import { issueDefinition } from '../../../../utils/schedule/issueCodes';
import { weekdayLabel, shortDateLabel } from '../../../../utils/schedule/weekRange';

/**
 * Every order that could not be scheduled, with the reason.
 *
 * This is the proposal's central promise made visible: "an infeasible plan is
 * never committed silently. Every delivery that could not be scheduled has a
 * recorded reason, visible to operations staff rather than discovered when the
 * truck arrives."
 */
function SuggestedSlotList({ suggestions, onAssign }) {
  if (!suggestions.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {suggestions.map(s => (
        <button
          key={s.slotId}
          type="button"
          onClick={() => onAssign?.(s.slotId)}
          className={`rounded border border-green-300 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-800 hover:bg-green-100 ${FOCUS_RING}`}
        >
          {weekdayLabel(s.dateKey)} {shortDateLabel(s.dateKey)} {s.windowLabel}
          {s.truckPlate && <span className="ml-1 font-mono opacity-70">{s.truckPlate}</span>}
          {s.arrival && <span className="ml-1 tabular-nums opacity-70">~{s.arrival}</span>}
        </button>
      ))}
    </div>
  );
}

function ExceptionRow({ entry, onAssign, onOpenOrder }) {
  const { order, building, customer, blocking, suggestions, schedulable } = entry;

  return (
    <li className="px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpenOrder?.(order.id)}
            className={`truncate font-mono text-xs font-semibold text-gray-900 hover:text-blue-700 ${FOCUS_RING} rounded`}
          >
            {order.doNo}
          </button>
          <p className="truncate text-[11px] text-gray-600">
            {customer?.name ?? 'Unknown customer'}
          </p>
          <p className="truncate text-[11px] text-gray-400">
            {building?.name ?? order.deliveryAddress ?? 'No address on record'}
          </p>
        </div>

        {schedulable ? (
          <span className={`flex-shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${badgeClass('green')}`}>
            Can be placed
          </span>
        ) : null}
      </div>

      {/* The reasons, spelled out. */}
      <div className="mt-1 flex flex-wrap gap-1">
        {blocking.map((issue) => {
          const def = issueDefinition(issue.code);
          return (
            <span
              key={issue.code}
              title={issue.detail || def.detail}
              className={`rounded-full px-1.5 py-px text-[10px] font-medium ${badgeClass(def.tone)}`}
            >
              {def.label}
            </span>
          );
        })}
      </div>

      {blocking[0]?.detail && (
        <p className="mt-1 text-[11px] text-gray-500">{blocking[0].detail}</p>
      )}

      <SuggestedSlotList
        suggestions={suggestions}
        onAssign={slotId => onAssign?.(order.id, slotId)}
      />
    </li>
  );
}

export default function ExceptionDrawer({
  open,
  onClose,
  groups = [],
  focusCode = null,
  autoRun = null,
  onAssign,
  onOpenOrder,
}) {
  const [expanded, setExpanded] = useState(() => new Set(focusCode ? [focusCode] : []));

  // Opening from a constraint chip should land on that group already expanded.
  const effectiveExpanded = useMemo(() => {
    if (focusCode && !expanded.has(focusCode)) return new Set([...expanded, focusCode]);
    return expanded;
  }, [expanded, focusCode]);

  const toggle = (code) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });

  const total = groups.reduce((n, g) => n + g.entries.length, 0);

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Exceptions"
      subtitle={total ? `${total} order${total === 1 ? '' : 's'} need a decision` : 'Nothing outstanding'}
      footer={(
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">
            {autoRun
              ? `Last run: ${autoRun.scheduled} scheduled, ${autoRun.unscheduled} left`
              : 'Placed DOs move from here onto the Board.'}
          </p>
          {/* The scheduler runs on the Engine page; this drawer only explains. */}
          <Link to="/schedule/engine" className={`text-xs font-medium text-blue-700 hover:underline ${FOCUS_RING}`}>
            Engine →
          </Link>
        </div>
      )}
    >
      {groups.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No exceptions"
          description="Every booked order has a slot. Nothing has been deferred."
        />
      ) : (
        <div className="space-y-2">
          {autoRun?.warnings?.length > 0 && (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>{autoRun.warnings.join(' ')}</span>
            </div>
          )}

          {groups.map((group) => {
            const isOpen = effectiveExpanded.has(group.code);
            return (
              <div key={group.code} className="overflow-hidden rounded-md border border-gray-200">
                <button
                  type="button"
                  onClick={() => toggle(group.code)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center gap-2 bg-gray-50 px-3 py-2 text-left ${FOCUS_RING}`}
                >
                  {isOpen
                    ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden="true" />
                    : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" aria-hidden="true" />}
                  <span className={`rounded-full px-1.5 py-px text-[10px] font-medium ${badgeClass(group.tone)}`}>
                    {group.label}
                  </span>
                  <span className="ml-auto tabular-nums text-xs font-semibold text-gray-700">
                    {group.entries.length}
                  </span>
                </button>

                {isOpen && (
                  <ul className="divide-y divide-gray-100 bg-white">
                    {group.entries.map(entry => (
                      <ExceptionRow
                        key={entry.order.id}
                        entry={entry}
                        onAssign={onAssign}
                        onOpenOrder={onOpenOrder}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SlideOver>
  );
}
