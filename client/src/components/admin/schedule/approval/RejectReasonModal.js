import React, { useState } from 'react';
import Modal from '../../../common/Modal';
import Button from '../../../common/Button';
import { FOCUS_RING } from '../../../common/tokens';

// Why a reason is mandatory: a rejected trip becomes an exception, and the
// proposal's rule is that every deferral carries a recorded reason. A rejection
// with no reason is exactly the "held in Mr Lee's head" problem the system is
// meant to replace.

const PRESETS = [
  'Lorry needed elsewhere',
  'Crew unavailable',
  'Too many DOs for this window',
  'Customer rescheduled',
  'Building access not confirmed',
  'Items not ready in the warehouse',
];

export default function RejectReasonModal({
  open, lane, orderCount, onCancel, onConfirm, busy,
  // The Board rejects single DOs from inside a drawer, so it overrides these.
  title = 'Reject this trip',
  description = null,
  confirmLabel = 'Reject trip',
  zIndex,
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const submit = () => {
    const full = [reason, note.trim()].filter(Boolean).join(' — ');
    if (!full) return;
    onConfirm?.(full);
    setReason('');
    setNote('');
  };

  return (
    <Modal show={open} onClose={onCancel} maxWidth="max-w-md" zIndex={zIndex}>
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-xs text-gray-500">
        {description ?? (lane
          ? `${lane.windowLabel} ${lane.timeLabel}${lane.truckPlate ? ` · ${lane.truckPlate}` : ''} · ${orderCount} order(s) will return to the unassigned pool.`
          : '')}
      </p>

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-xs font-medium text-gray-700">Reason</legend>
        <div className="space-y-1">
          {PRESETS.map(preset => (
            <label
              key={preset}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              <input
                type="radio"
                name="reject-reason"
                value={preset}
                checked={reason === preset}
                onChange={() => setReason(preset)}
                className={FOCUS_RING}
              />
              {preset}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-gray-700">
          Note <span className="font-normal text-gray-400">(optional)</span>
        </span>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          className={`w-full rounded border border-gray-300 px-2 py-1 text-xs ${FOCUS_RING}`}
          placeholder="Anything the dispatcher should know"
        />
      </label>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" fullWidth onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          fullWidth
          onClick={submit}
          disabled={busy || !reason}
          title={!reason ? 'Pick a reason first' : undefined}
        >
          {busy ? 'Rejecting…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
