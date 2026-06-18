import { MapPin } from 'lucide-react';
import { getOrderStatusBadge } from '../../../utils/orderHelpers';

export default function TripOrderRow({ order, index }) {
  const badge = getOrderStatusBadge(order.order_status);
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
      <td className="py-3 pl-4 pr-2 text-xs text-gray-400 font-medium w-8">{index + 1}</td>
      <td className="py-3 pr-3">
        <div className="text-xs font-mono text-gray-700 truncate max-w-[180px]" title={order.odoo_order_ref || undefined}>
          {order.odoo_order_ref || <span className="text-gray-400 italic">No Odoo ref</span>}
        </div>
        {order.customer_name && (
          <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[180px]">{order.customer_name}</div>
        )}
        {order.id && (
          <div className="text-[10px] text-gray-400 font-mono mt-0.5 break-all leading-tight max-w-[180px]" title={order.id}>
            {order.id}
          </div>
        )}
      </td>
      <td className="py-3 pr-3">
        {order.delivery_address ? (
          <div className="flex items-start gap-1 text-xs text-gray-600">
            <MapPin className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{order.delivery_address}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">—</span>
        )}
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badge.bgColor} ${badge.color}`}>
          {badge.label}
        </span>
      </td>
    </tr>
  );
}
