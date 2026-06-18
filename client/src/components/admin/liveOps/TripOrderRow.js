import { MapPin, Phone, MessageCircle } from 'lucide-react';
import { getOrderStatusBadge } from '../../../utils/orderHelpers';
import { callCustomer, openWhatsApp } from '../../../utils/phoneHelpers';
import { onTheWayTemplate } from '../../../utils/templateMessages';

export default function TripOrderRow({ order, index, trip }) {
  const badge = getOrderStatusBadge(order.order_status);
  const hasPhone = !!order.customer_phone;

  function handleCall() {
    callCustomer(order.customer_phone);
  }

  function handleWhatsApp() {
    const msg = onTheWayTemplate({
      customerName: order.customer_name,
      orderRef: order.odoo_order_ref || order.id?.slice(0, 8).toUpperCase(),
      slotDate: trip?.date,
      timeWindow: [trip?.time_window_start, trip?.time_window_end].filter(Boolean).join(' – '),
      address: order.delivery_address,
    });
    openWhatsApp(order.customer_phone, msg);
  }

  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
      <td className="py-3 pl-4 pr-2 text-xs text-gray-400 font-medium w-8">{index + 1}</td>
      <td className="py-3 pr-3">
        <div className="text-xs font-mono text-gray-700 truncate max-w-[120px]" title={order.odoo_order_ref || undefined}>
          {order.odoo_order_ref || <span className="text-gray-400 italic">No Odoo ref</span>}
        </div>
      </td>
      <td className="py-3 pr-3">
        {order.id ? (
          <div className="text-[10px] text-gray-500 font-mono truncate max-w-[140px]" title={order.id}>
            {order.id}
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">—</span>
        )}
      </td>
      <td className="py-3 pr-3">
        {order.customer_name ? (
          <div className="text-xs text-gray-700 truncate max-w-[120px]">{order.customer_name}</div>
        ) : (
          <span className="text-xs text-gray-400 italic">—</span>
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
      <td className="py-3 pr-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCall}
            disabled={!hasPhone}
            title={hasPhone ? `Call ${order.customer_name || 'customer'}` : 'No phone number'}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleWhatsApp}
            disabled={!hasPhone}
            title={hasPhone ? `WhatsApp ${order.customer_name || 'customer'}` : 'No phone number'}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 text-green-600 hover:bg-green-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
      <td className="py-3 pr-4 text-right">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badge.bgColor} ${badge.color}`}>
          {badge.label}
        </span>
      </td>
    </tr>
  );
}
