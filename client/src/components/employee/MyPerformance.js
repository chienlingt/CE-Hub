import React, { useEffect, useState } from 'react';
import OrderPointsList, { formatPoints } from '../performance/OrderPointsList';
import { getMyPerformance } from '../../services/performanceApi';

// FR-10-004: an employee sees their own completed orders, points and incentive.
// The server identifies the employee from the login session, never from the URL.

const pad = n => String(n).padStart(2, '0');
const isoDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const monthRange = (year, month) => ({ from: isoDate(new Date(year, month, 1)), to: isoDate(new Date(year, month + 1, 0)) });

export default function MyPerformance() {
  const now = new Date();
  const [range, setRange] = useState(() => monthRange(now.getFullYear(), now.getMonth()));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let current = true;
    setData(null);
    setError(null);
    getMyPerformance(range)
      .then(result => { if (current) setData(result); })
      .catch(e => { if (current) setError(e.status === 401 || e.status === 403 ? 'Please sign in again to see your performance.' : e.message); });
    return () => { current = false; };
  }, [range]);

  const setMonth = value => { if (value) { const [y, m] = value.split('-').map(Number); setRange(monthRange(y, m - 1)); } };
  const summary = data?.summary;
  const cards = summary ? [
    ['Orders completed', summary.completed_orders, null],
    ['Total points', formatPoints(summary.total_points), `Items ${formatPoints(summary.item_points)} · Extra ${formatPoints(summary.manual_points)}`],
    ['Incentive', `RM ${summary.incentive_rm.toFixed(2)}`, `RM ${Number(data.rm_per_point).toFixed(2)} per point`],
  ] : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">My performance</h2>
          {data && <p className="text-sm text-gray-500">{data.employee.name}{data.employee.job_role ? ` · ${data.employee.job_role}` : ''}</p>}
        </div>
        <label className="text-xs font-medium text-gray-600">Month
          <input type="month" value={range.from.slice(0, 7)} onChange={e => setMonth(e.target.value)}
            className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900" />
        </label>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="text-sm text-gray-500">Loading...</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {cards.map(([name, value, note]) => (
              <div key={name} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium text-gray-500">{name}</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
                <div className="mt-1 min-h-[1rem] text-xs text-gray-500">{note}</div>
              </div>
            ))}
          </div>
          <OrderPointsList orders={data.orders} />
        </>
      )}
    </div>
  );
}
