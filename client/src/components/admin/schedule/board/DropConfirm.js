import React from 'react';
import { AlertTriangle, Moon } from 'lucide-react';
import Modal from '../../../common/Modal';
import Button from '../../../common/Button';
import { longDateLabel } from '../../../../utils/schedule/weekRange';

/**
 * Every manual placement — a drop or "Move to…" — is confirmed here first.
 * Place leaves the DO pending (and offers Undo); Place & approve confirms it
 * for the warehouse straight away, which writes to Odoo and has no Undo.
 */
export default function DropConfirm({ order, target, busy, onCancel, onPlace }) {
  if (!order || !target) return null;
  const { expected, verdict } = target;
  const warnings = verdict?.warnings ?? [];

  return (
    <Modal show onClose={onCancel} maxWidth="max-w-sm" zIndex="z-[60]">
      <h2 className="text-base font-semibold text-gray-900">Place {order.doNo}?</h2>

      <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-gray-500">Lorry</dt>
        <dd className="font-mono text-gray-900">{target.truckPlate ?? '—'}</dd>
        <dt className="text-gray-500">Slot</dt>
        <dd className="tabular-nums text-gray-900">{target.windowLabel} {target.timeLabel}</dd>
        <dt className="text-gray-500">Date</dt>
        <dd className="text-gray-900">{longDateLabel(target.dateKey)}</dd>
        <dt className="text-gray-500">Expected</dt>
        <dd className={expected.dateMismatch ? 'font-medium text-amber-700' : 'text-gray-900'}>
          {expected.expectedLabel ?? 'Not given by Odoo'}
        </dd>
      </dl>

      {order.assignmentStatus === 'approved' && (
        <p className="mt-3 flex gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
          <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          This DO is confirmed. Moving it returns it to Pending WH for re-approval.
        </p>
      )}

      {(target.startsNight || expected.dateMismatch || warnings.length > 0) && (
        <ul className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
          {target.startsNight && (
            <li className="flex gap-1.5">
              <Moon className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              This starts a night delivery for {longDateLabel(target.dateKey)}.
            </li>
          )}
          {expected.dateMismatch && (
            <li className="flex gap-1.5">
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              Odoo expects this DO on {expected.expectedLabel}, not this date.
            </li>
          )}
          {warnings.map(w => (
            <li key={`${w.code}|${w.detail}`} className="flex gap-1.5">
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span><span className="font-medium">{w.label}</span>{w.detail ? ` — ${w.detail}` : ''}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" fullWidth onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="secondary" fullWidth onClick={() => onPlace({ approve: false })} disabled={busy}>
          Place
        </Button>
        <Button fullWidth onClick={() => onPlace({ approve: true })} disabled={busy}>
          Place &amp; approve
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Place leaves it pending, with Undo. Place &amp; approve confirms it and writes to Odoo.
      </p>
    </Modal>
  );
}
