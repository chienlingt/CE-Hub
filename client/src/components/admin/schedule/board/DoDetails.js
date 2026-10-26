import React from 'react';
import { Phone, AlertTriangle } from 'lucide-react';
import BlockGlyph from './BlockGlyph';
import { blockMeta } from './boardStates';
import { weekdayLabel, shortDateLabel } from '../../../../utils/schedule/weekRange';

/**
 * The DO's details, shared by the hover popover and the pinned drawer. CE Hub
 * fields only; an empty field is left out rather than shown as "—".
 */
export default function DoDetails({ detail, pinned = false }) {
  if (!detail) return null;
  const { order, blockState, customer, building, lane, eta, expected, items, issues, rejectReason, unscheduledReason } = detail;
  const meta = blockMeta(blockState);

  const zoneLine = [
    building?.zoneName && `Zone: ${building.zoneName}`,
    building?.name && `Building: ${building.name}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-2 text-xs text-gray-700">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-gray-900">{order.doNo}</span>
        <span className="whitespace-nowrap text-[11px] font-medium text-gray-600">
          <span aria-hidden="true"><BlockGlyph state={detail.blockState} glyph={meta.glyph} /></span> {meta.label}
        </span>
      </div>

      <div className="space-y-0.5">
        {customer && (
          <p className="flex flex-wrap items-center gap-x-1">
            <span className="font-medium text-gray-900">{customer.name}</span>
            {customer.phone && (pinned ? (
              <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-0.5 text-blue-700 hover:underline">
                · <Phone className="h-3 w-3" aria-hidden="true" />{customer.phone}
              </a>
            ) : <span>· {customer.phone}</span>)}
          </p>
        )}
        {order.deliveryAddress && <p>{order.deliveryAddress}</p>}
        {zoneLine && <p className="text-gray-500">{zoneLine}</p>}
        {order.salespersonName && <p className="text-gray-500">Salesperson: {order.salespersonName}</p>}
      </div>

      {expected?.expectedLabel && (
        <p className={`tabular-nums ${expected.dateMismatch ? 'font-medium text-amber-700' : 'text-gray-600'}`}>
          {expected.dateMismatch && <span aria-hidden="true">⚠ </span>}
          Expected (Odoo): {expected.expectedLabel}
          {expected.dateMismatch && lane && ` · placed ${weekdayLabel(lane.dateKey)} ${shortDateLabel(lane.dateKey)}`}
        </p>
      )}

      {lane && (
        <div className="border-t border-gray-100 pt-2">
          <p className="tabular-nums">
            {[lane.truckPlate, `${weekdayLabel(lane.dateKey)} ${shortDateLabel(lane.dateKey)}`, `${lane.windowLabel} ${lane.timeLabel}`]
              .filter(Boolean).join(' · ')}
          </p>
          {eta && <p className="tabular-nums text-gray-500">ETA ≈ {eta}</p>}
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-0.5 border-t border-gray-100 pt-2">
          {items.map((item, i) => (
            <li key={`${item.name}-${i}`} className="tabular-nums">{item.quantity} × {item.name}</li>
          ))}
        </ul>
      )}

      {order.deliveryRemarks && (
        <p className="border-t border-gray-100 pt-2">Remarks: {order.deliveryRemarks}</p>
      )}

      {(rejectReason || issues.length > 0 || unscheduledReason) && (
        <ul className="space-y-1 border-t border-gray-100 pt-2">
          {rejectReason && (
            <li className="flex gap-1 font-medium text-red-700">
              <span aria-hidden="true">✕</span> Rejected: {rejectReason}
            </li>
          )}
          {unscheduledReason && !rejectReason && (
            <li className="flex gap-1 text-red-700">
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              {unscheduledReason}
            </li>
          )}
          {issues.map(issue => (
            <li key={`${issue.code}|${issue.detail}`} className="flex gap-1 text-red-700">
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span><span className="font-medium">{issue.label}</span>{issue.detail ? ` — ${issue.detail}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
