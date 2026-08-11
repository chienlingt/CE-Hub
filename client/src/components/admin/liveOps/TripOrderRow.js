import { useState } from 'react';
import { MapPin, Phone, MessageCircle, Bell, AlertTriangle } from 'lucide-react';
import { getOrderStatusBadge } from '../../../utils/orderHelpers';
import { callCustomer, openWhatsApp } from '../../../utils/phoneHelpers';
import { onTheWayTemplate } from '../../../utils/templateMessages';
import { isOrderOverdue } from '../../../utils/liveOpsFilters';
import { API_BASE_URL } from '../../../utils/apiBaseUrl';

function fmtTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TripOrderRow({ order, index, trip, onOrderUpdate }) {
  const badge = getOrderStatusBadge(order.order_status);
  const hasPhone = !!order.customer_phone;
  const overdue  = isOrderOverdue(order, trip?.date);

  const [reminding,    setReminding]    = useState(false);
  const [remindError,  setRemindError]  = useState(null);
  const [remindedAt,   setRemindedAt]   = useState(order.overdue_reminder_sent_at || null);

  function handleCall() {
    callCustomer(order.customer_phone);
  }

  function handleWhatsApp() {
    const msg = onTheWayTemplate({
      customerName: order.customer_name,
      orderRef: order.odoo_order_ref || 'Not Synced',
      slotDate: trip?.date,
      timeWindow: [trip?.time_window_start, trip?.time_window_end].filter(Boolean).join(' – '),
      address: order.delivery_address,
    });
    openWhatsApp(order.customer_phone, msg);
  }

  async function handleRemindDriver() {
    setReminding(true);
    setRemindError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${order.id}/remind-driver`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const ts = data.order?.overdue_reminder_sent_at || new Date().toISOString();
      setRemindedAt(ts);
      onOrderUpdate?.({ ...order, overdue_reminder_sent_at: ts });
    } catch (err) {
      setRemindError(err.message);
    } finally {
      setReminding(false);
    }
  }

  return (
    <tr className={`border-b border-gray-100 last:border-0 transition-colors ${overdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
      <td className="py-3 pl-4 pr-2 text-xs text-gray-400 font-medium w-8">{index + 1}</td>
      <td className="py-3 pr-3">
        <div className="text-xs font-mono text-gray-700 truncate max-w-[120px]" title={order.odoo_order_ref || undefined}>
          {order.odoo_order_ref || <span className="text-gray-400 italic">No Odoo ref</span>}
        </div>
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
      <td className="py-3 pr-4 min-w-[11rem]">
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            {overdue && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                <AlertTriangle className="w-2.5 h-2.5" />
                Overdue
              </span>
            )}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badge.bgColor} ${badge.color}`}>
              {badge.label}
            </span>
          </div>
          {overdue && (
            remindedAt ? (
              <span className="text-[10px] text-gray-500 italic">Reminded {fmtTime(remindedAt)}</span>
            ) : (
              <div className="flex flex-col items-end gap-0.5">
                <button
                  onClick={handleRemindDriver}
                  disabled={reminding}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition-colors"
                >
                  <Bell className="w-2.5 h-2.5" />
                  {reminding ? 'Sending…' : 'Remind Driver'}
                </button>
                {remindError && (
                  <span className="text-[9px] text-red-600 max-w-[140px] text-right">{remindError}</span>
                )}
              </div>
            )
          )}
        </div>
      </td>
    </tr>
  );
}
