import React from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';

/**
 * The card that follows the cursor. It carries the verdict, so the answer to
 * "can this go here?" travels with the pointer rather than only appearing on
 * the lane the dispatcher may not be looking at.
 */
export default function DragOverlayCard({ order, customerName, verdict }) {
  const state = !verdict ? 'neutral' : verdict.ok ? (verdict.warnings?.length ? 'warn' : 'ok') : 'blocked';

  const frame = {
    neutral: 'border-gray-300',
    ok: 'border-green-500 ring-2 ring-green-200',
    warn: 'border-amber-500 ring-2 ring-amber-200',
    blocked: 'border-red-500 ring-2 ring-red-200',
  }[state];

  const Icon = { ok: Check, warn: AlertTriangle, blocked: X, neutral: null }[state];
  const iconTone = {
    ok: 'text-green-600', warn: 'text-amber-600', blocked: 'text-red-600', neutral: '',
  }[state];

  const message = state === 'blocked'
    ? verdict.blocking[0]?.label
    : state === 'warn'
      ? verdict.warnings[0]?.label
      : null;

  return (
    <div className={`w-56 cursor-grabbing rounded-md border-2 bg-white p-2 shadow-lg ${frame}`}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className={`h-4 w-4 flex-shrink-0 ${iconTone}`} aria-hidden="true" />}
        <span className="truncate font-mono text-xs font-semibold text-gray-900">{order.doNo}</span>
      </div>
      {customerName && (
        <p className="mt-0.5 truncate text-[11px] text-gray-600">{customerName}</p>
      )}
      {message && (
        <p className={`mt-1 text-[11px] font-medium ${state === 'blocked' ? 'text-red-700' : 'text-amber-700'}`}>
          {message}
        </p>
      )}
      {verdict?.ok && verdict.projected?.arrival && (
        <p className="mt-1 text-[11px] tabular-nums text-gray-500">
          Arrives ~{verdict.projected.arrival}
        </p>
      )}
    </div>
  );
}
