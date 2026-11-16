import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Undo2 } from 'lucide-react';

export const formatPoints = value => {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
};

const formatDate = value => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
};

function Items({ items }) {
  if (!items?.length) return <p className="text-xs text-gray-500">No item detail recorded.</p>;
  return (
    <table className="min-w-full text-xs">
      <thead>
        <tr className="text-left text-gray-500">
          <th className="py-1 pr-3 font-medium">Item</th>
          <th className="py-1 pr-3 font-medium text-right">Ordered</th>
          <th className="py-1 pr-3 font-medium text-right">Delivered</th>
          <th className="py-1 pr-3 font-medium text-right">Pts / item</th>
          <th className="py-1 font-medium text-right">Points</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {items.map(item => (
          <tr key={item.order_product_id}>
            <td className="py-1 pr-3 text-gray-800">{item.product_name || `Item #${item.order_product_id}`}</td>
            <td className="py-1 pr-3 text-right">{item.quantity}</td>
            <td className="py-1 pr-3 text-right">{item.delivered_quantity}</td>
            <td className="py-1 pr-3 text-right">{formatPoints(item.points_per_item)}</td>
            <td className="py-1 text-right font-medium">{formatPoints(item.points)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Orders an employee earned points on. Each order expands to its items (points
 * per item). `onAddPoints` / `onReverse` are only passed for admins.
 */
export default function OrderPointsList({ orders, onAddPoints, onReverse }) {
  const [open, setOpen] = useState({});
  if (!orders.length) return <p className="text-sm text-gray-500">No completed orders in this period.</p>;
  return (
    <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
      {orders.map(order => {
        const expanded = !!open[order.order_id];
        return (
          <div key={order.order_id}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <button type="button" onClick={() => setOpen(state => ({ ...state, [order.order_id]: !expanded }))}
                aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} items for ${order.do_ref || 'order'}`}
                className="text-gray-500 hover:text-gray-800">
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <div className="min-w-[8rem] flex-1">
                <div className="text-sm font-medium text-gray-900">{order.do_ref || 'Not synced'}</div>
                <div className="text-xs text-gray-500">{order.customer || 'No customer'} · {formatDate(order.completed_at)} · {order.role}</div>
              </div>
              <div className="text-xs text-gray-600">Items {formatPoints(order.item_points)}</div>
              <div className="text-xs text-gray-600">Bonus {formatPoints(order.bonus_points)}</div>
              <div className="text-xs text-gray-600">Extra {formatPoints(order.manual_points)}</div>
              <div className="text-sm font-semibold text-emerald-700">{formatPoints(order.total_points)} pts</div>
              {onAddPoints && (
                <button type="button" onClick={() => onAddPoints(order)}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                  <Plus className="h-3 w-3" /> Add points
                </button>
              )}
            </div>
            {expanded && (
              <div className="space-y-3 bg-gray-50 px-4 py-3">
                <Items items={order.items} />
                {order.adjustments?.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-600">Extra points (apply to the whole order)</p>
                    <ul className="space-y-1">
                      {order.adjustments.map(adjustment => (
                        <li key={adjustment.id} className="flex items-center gap-2 text-xs text-gray-700">
                          <span className={`font-semibold ${adjustment.points < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                            {adjustment.points > 0 ? '+' : ''}{formatPoints(adjustment.points)}
                          </span>
                          <span className="flex-1">{adjustment.reason}</span>
                          {onReverse && !adjustment.reverses_id && !order.adjustments.some(a => a.reverses_id === adjustment.id) && (
                            <button type="button" onClick={() => onReverse(adjustment)}
                              className="inline-flex items-center gap-1 text-gray-500 hover:text-red-600">
                              <Undo2 className="h-3 w-3" /> Reverse
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
