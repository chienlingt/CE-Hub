import React, { useEffect, useState } from 'react';
import { MoveRight, XCircle } from 'lucide-react';
import SlideOver from '../../../common/SlideOver';
import Button from '../../../common/Button';
import DoDetails from './DoDetails';
import { blockMeta } from './boardStates';
import RejectReasonModal from '../approval/RejectReasonModal';
import { FOCUS_RING } from '../../../common/tokens';

/**
 * The DO pinned on the same page (?order=). This is where touch and keyboard
 * users get everything hover gives, plus the actions: Move to… for anything
 * still unapproved, Reject… for a pending DO. Approved and departed DOs offer
 * no actions — re-opening them is a separate, out-of-scope step.
 */
export default function DoDrawer({ detail, moveTargets = [], past, busy, onClose, onMove, onReject }) {
  const [target, setTarget] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const orderId = detail?.order.id;
  useEffect(() => { setTarget(''); setRejecting(false); }, [orderId]);

  if (!detail) return null;
  const { order, blockState } = detail;
  const movable = !past && ['pending', 'rejected', 'unscheduled'].includes(blockState);
  const rejectable = !past && blockState === 'pending';

  const footer = (movable || rejectable) ? (
    <div className="space-y-2">
      {movable && (
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="do-move-target">Move to</label>
          <select
            id="do-move-target"
            value={target}
            onChange={e => setTarget(e.target.value)}
            className={`min-h-10 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm ${FOCUS_RING}`}
          >
            <option value="">
              {moveTargets.length ? 'Move to…' : 'No open slot fits this DO on this day'}
            </option>
            {moveTargets.map(t => (
              <option key={t.slotId} value={t.slotId}>
                {t.windowLabel} {t.timeLabel} · {t.truckPlate ?? 'no lorry'}
                {t.startsNight ? ' · starts night delivery' : ''}
              </option>
            ))}
          </select>
          <Button icon={MoveRight} disabled={!target || busy} onClick={() => onMove(order.id, target)}>
            Move
          </Button>
        </div>
      )}
      {rejectable && (
        <Button variant="secondary" fullWidth icon={XCircle} disabled={busy} onClick={() => setRejecting(true)}>
          Reject…
        </Button>
      )}
    </div>
  ) : null;

  return (
    <>
      <SlideOver
        open
        onClose={onClose}
        title={order.doNo}
        subtitle={blockMeta(blockState).label}
        width="sm:w-[420px]"
        footer={footer}
      >
        <DoDetails detail={detail} pinned />
      </SlideOver>

      <RejectReasonModal
        open={rejecting}
        orderCount={1}
        busy={busy}
        title={`Reject ${order.doNo}`}
        description="It goes back to the unscheduled tray with this reason, so it can be placed again."
        confirmLabel="Reject DO"
        zIndex="z-[60]"
        onCancel={() => setRejecting(false)}
        onConfirm={(reason) => { setRejecting(false); onReject(order.id, reason); }}
      />
    </>
  );
}
