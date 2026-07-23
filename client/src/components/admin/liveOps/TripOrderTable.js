import TripOrderRow from './TripOrderRow';

export default function TripOrderTable({ items, trip }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No orders on this trip.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[800px]">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
            <th className="py-2 pl-4 pr-2 text-left w-8">#</th>
            <th className="py-2 pr-3 text-left">Odoo ref</th>
            <th className="py-2 pr-3 text-left">Order ID</th>
            <th className="py-2 pr-3 text-left">Customer</th>
            <th className="py-2 pr-3 text-left">Address</th>
            <th className="py-2 pr-3 text-left">Contact</th>
            <th className="py-2 pr-4 text-right min-w-[11rem]">Status / Overdue</th>
          </tr>
        </thead>
        <tbody>
          {items.map((order, i) => (
            <TripOrderRow key={order.id} order={order} index={i} trip={trip} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
