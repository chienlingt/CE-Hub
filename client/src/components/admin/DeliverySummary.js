// Admin-facing view of a delivery's per-item outcome, from the server's `delivery_summary`.
import { PackageCheck, PackageX } from 'lucide-react';

const ITEM_STYLES = {
  delivered:     'bg-green-100 text-green-700',
  partial:       'bg-amber-100 text-amber-700',
  not_delivered: 'bg-red-100 text-red-700',
};
const ITEM_LABELS = { delivered: 'Delivered', partial: 'Partly delivered', not_delivered: 'Not delivered' };

export function DeliveryStatusBadge({ summary }) {
  if (summary?.is_partial) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"
        title={`${summary.delivered_units} of ${summary.total_units} units delivered`}
      >
        Delivered (partial) · {summary.delivered_units}/{summary.total_units}
      </span>
    );
  }
  return null;
}

export function DeliveryItemList({ summary }) {
  if (!summary?.items?.length) return null;
  return (
    <ul className="space-y-1.5">
      {summary.items.map(item => (
        <li key={item.id} className="flex items-start gap-2 text-sm">
          {item.status === 'delivered'
            ? <PackageCheck className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
            : <PackageX className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />}
          <div className="min-w-0">
            <span className="text-gray-800">{item.name}</span>
            <span className="text-gray-400"> · {item.delivered_quantity}/{item.quantity}</span>
            <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${ITEM_STYLES[item.status]}`}>
              {ITEM_LABELS[item.status]}
            </span>
            {item.status !== 'delivered' && item.reasons.length > 0 && (
              <p className="text-xs text-gray-500">Reason: {item.reasons.join(', ')}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
