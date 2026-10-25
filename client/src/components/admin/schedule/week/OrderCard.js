import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Wrench, Lock, ShieldAlert, Clock } from 'lucide-react';
import { badgeClass, FOCUS_RING } from '../../../common/tokens';

/**
 * One draggable DO. Takes plain props from a view model built once per render
 * by the parent and is memoized — no per-card context subscription, which is
 * what keeps a ~200-card board responsive during a drag.
 */
function OrderCard({
  order,
  customerName,
  buildingName,
  sequence,
  needsInstaller,
  permitRequired,
  accessWindow,
  locked,
  disabled,
  staged,
  onOpen,
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: order.id,
    // A locked slot's cards must be undraggable, not merely dimmed.
    disabled: disabled || locked,
    data: { type: 'order', orderId: order.id },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'group rounded border bg-white p-1.5 text-xs',
        staged ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200',
        locked ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-1">
        {!locked && !disabled && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Move ${order.doNo}`}
            // touch-none is required or the page scrolls instead of dragging.
            className={`-ml-0.5 mt-px flex-shrink-0 cursor-grab touch-none rounded text-gray-300 hover:text-gray-600 ${FOCUS_RING}`}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        {locked && (
          <Lock className="mt-px h-3.5 w-3.5 flex-shrink-0 text-orange-500" aria-label="locked" />
        )}

        <button
          type="button"
          onClick={() => onOpen?.(order.id)}
          className={`min-w-0 flex-1 text-left ${FOCUS_RING} rounded`}
        >
          <span className="flex items-baseline gap-1">
            {sequence != null && (
              <span className="tabular-nums text-[10px] text-gray-400">{sequence}.</span>
            )}
            <span className="truncate font-mono text-[11px] font-semibold text-gray-900">
              {order.doNo}
            </span>
            {needsInstaller && (
              <Wrench className="h-3 w-3 flex-shrink-0 text-purple-500" aria-label="needs installer" />
            )}
            {permitRequired && (
              <ShieldAlert className="h-3 w-3 flex-shrink-0 text-amber-500" aria-label="permit required" />
            )}
          </span>
          {customerName && (
            <span className="block truncate text-[11px] text-gray-600">{customerName}</span>
          )}
          {buildingName && (
            <span className="block truncate text-[10px] text-gray-400">{buildingName}</span>
          )}
          {accessWindow && (
            <span className="mt-0.5 flex items-center gap-0.5 text-[10px] text-gray-500">
              <Clock className="h-2.5 w-2.5" aria-hidden="true" />
              <span className="tabular-nums">{accessWindow}</span>
            </span>
          )}
        </button>

        {order.status !== 'Scheduled' && order.status !== 'Pending' && (
          <span className={`flex-shrink-0 rounded-full px-1 py-px text-[9px] font-medium ${badgeClass(
            order.status === 'Delivered' ? 'green'
              : order.status === 'Failed' ? 'red'
                : 'orange',
          )}`}
          >
            {order.status}
          </span>
        )}
      </div>
    </div>
  );
}

export default React.memo(OrderCard);
