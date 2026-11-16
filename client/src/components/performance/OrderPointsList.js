import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';

export const formatPoints = value => {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
};

const formatDate = value => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Same columns in the header and every row so the numbers line up.
const GRID = 'grid items-center gap-x-3 grid-cols-[minmax(0,1fr)_3rem_5.5rem_3.5rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_4.5rem]';

/**
 * Extra points of one order. For admins it is a number that looks like text until
 * you hover it: type a new value and press Enter or click away to save, Escape to
 * undo. The server sets the order's extra to exactly that value.
 */
function ExtraCell({ order, onSet }) {
  const [text, setText] = useState(String(order.manual_points));
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [message, setMessage] = useState('');
  useEffect(() => { setText(String(order.manual_points)); }, [order.manual_points]);

  if (!onSet) return <span className="tabular-nums">{formatPoints(order.manual_points)}</span>;

  async function commit() {
    const number = text.trim() === '' ? 0 : Number(text);
    if (!Number.isFinite(number)) { setText(String(order.manual_points)); return; }
    if (number === Number(order.manual_points)) { setText(String(order.manual_points)); return; }
    setState('saving');
    setMessage('');
    try {
      await onSet(order, number);
      setState('saved');
      setTimeout(() => setState(current => (current === 'saved' ? 'idle' : current)), 1500);
    } catch (error) {
      setState('error');
      setMessage(error.message);
      setText(String(order.manual_points));
    }
  }

  return (
    <span className="relative inline-flex items-center justify-end gap-1">
      {state === 'saved' && <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Saved" />}
      <input type="number" step="0.01" value={text} disabled={state === 'saving'}
        aria-label={`Extra points for ${order.do_ref || 'order'}`}
        title={state === 'error' ? message : 'Extra points for everyone on this order. Press Enter to save.'}
        onChange={e => { setText(e.target.value); if (state !== 'idle') setState('idle'); }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setText(String(order.manual_points)); e.currentTarget.blur(); }
        }}
        className={`w-20 rounded-md border bg-transparent px-2 py-1 text-right text-sm tabular-nums outline-none transition-colors disabled:opacity-50
          ${state === 'error' ? 'border-red-400 bg-red-50' : 'border-transparent hover:border-gray-300 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-200'}`} />
      {state === 'error' && <span role="alert" className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md bg-red-600 px-2 py-1 text-left text-xs text-white shadow">{message}</span>}
    </span>
  );
}

function Items({ items }) {
  if (!items?.length) return <p className="text-xs text-gray-500">No item detail recorded.</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-500">
          <th className="py-1 pr-3 font-medium">Item</th>
          <th className="w-20 py-1 pr-3 text-right font-medium">Delivered</th>
          <th className="w-20 py-1 pr-3 text-right font-medium">Pts each</th>
          <th className="w-16 py-1 text-right font-medium">Points</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200/70">
        {items.map(item => (
          <tr key={item.order_product_id}>
            <td className="py-1.5 pr-3 text-gray-800">{item.product_name || `Item #${item.order_product_id}`}</td>
            <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600">{item.delivered_quantity} / {item.quantity}</td>
            <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600">{formatPoints(item.points_per_item)}</td>
            <td className="py-1.5 text-right font-medium tabular-nums text-gray-900">{formatPoints(item.points)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Completed orders of one employee: items points, extra points and total per order.
 * Click an order to see its items and the points per item. `onSetExtra` is only
 * passed for admins, who can edit each order's extra points in place.
 */
export default function OrderPointsList({ orders, onSetExtra }) {
  const [open, setOpen] = useState({});
  if (!orders.length) return <p className="py-2 text-sm text-gray-500">No completed deliveries in this period.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className={`${GRID} bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500`}>
        <span>Order</span>
        <span className="text-right">Items</span>
        <span className="text-right">Extra</span>
        <span className="text-right">Total</span>
      </div>
      <div className="divide-y divide-gray-100">
        {orders.map(order => {
          const expanded = !!open[order.order_id];
          return (
            <div key={order.order_id}>
              <div className={`${GRID} px-3 py-2`}>
                <button type="button" onClick={() => setOpen(state => ({ ...state, [order.order_id]: !expanded }))}
                  aria-expanded={expanded} className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:outline-emerald-600">
                  {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {order.do_ref || 'Not synced'}
                      {order.estimated && <span title="Points are worked out from the current item points and not saved yet" className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Estimated</span>}
                    </span>
                    <span className="block truncate text-xs text-gray-500">{order.customer || 'No customer'} · {formatDate(order.completed_at)}</span>
                  </span>
                </button>
                <span className="text-right text-sm tabular-nums text-gray-600">{formatPoints(order.item_points)}</span>
                <span className="text-right text-sm tabular-nums text-gray-600"><ExtraCell order={order} onSet={onSetExtra} /></span>
                <span className="text-right text-sm font-semibold tabular-nums text-emerald-700">{formatPoints(order.total_points)}</span>
              </div>
              {expanded && <div className="bg-gray-50 px-4 py-3 sm:pl-9"><Items items={order.items} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
