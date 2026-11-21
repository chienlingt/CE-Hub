import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import Button, { buttonClassNames } from '../../common/Button';
import { getAffected, getResources } from '../../../services/fleetAvailabilityApi';
import { blockText, formatDay, groupLabel, sessionLabel } from '../../../utils/fleet/fleetRules';

/**
 * Exceptions › Fleet Blocked (B.4, FR-10-006): open orders from today whose
 * truck or team is now blocked. Nothing is stored for this list — an order
 * leaves it once it is moved, or once the block-off is removed.
 */
export default function FleetBlocked() {
  const [affected, setAffected] = useState([]);
  const [resources, setResources] = useState({ trucks: [], teams: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, res] = await Promise.all([getAffected(), getResources()]);
      setAffected(list);
      setResources({ trucks: res.trucks, teams: res.teams });
      setError(null);
    } catch (e) {
      setError(e.status === 401 || e.status === 403 ? 'Sign in as an Admin to see orders affected by block-offs.' : e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const plateOf = id => resources.trucks.find(t => t.id === id)?.plate;
  const teamOf = id => resources.teams.find(t => t.id === id)?.name;
  const blockedBy = row => {
    if (!row) return '—';
    const target = { fleet: row.resourceType === 'fleet', targets: [row] };
    return `${groupLabel(target, resources)} · ${blockText(row)}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_20rem]">
          <h2 className="text-lg font-semibold text-gray-900">Fleet Blocked</h2>
          <p className="mt-1 text-sm text-gray-600">
            Orders booked on a truck or team that has since been blocked. Reschedule them, or remove the block-off under
            Information › Fleet Availability. An order leaves this list once it is moved.
          </p>
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={load} disabled={loading}>Refresh</Button>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
      {!error && loading && <p className="text-sm text-gray-600">Loading…</p>}
      {!error && !loading && affected.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
          No orders are affected by block-offs.
        </p>
      )}

      {!error && affected.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-700">
              <tr>
                <th scope="col" className="px-3 py-2">Order</th>
                <th scope="col" className="px-3 py-2">Date</th>
                <th scope="col" className="px-3 py-2">Session</th>
                <th scope="col" className="px-3 py-2">Truck</th>
                <th scope="col" className="px-3 py-2">Team</th>
                <th scope="col" className="px-3 py-2">Area</th>
                <th scope="col" className="px-3 py-2">Blocked by</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {affected.map(b => (
                <tr key={`${b.kind}-${b.orderId}-${b.date}-${b.session}`}>
                  <td className="px-3 py-2 font-semibold text-gray-900">
                    {b.orderRef}{b.kind === 'installation' && <span className="ml-1 text-xs font-normal text-gray-600">(installation)</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDay(b.date)}</td>
                  <td className="px-3 py-2">{sessionLabel(b.session)}</td>
                  <td className="px-3 py-2">{plateOf(b.truckId) || '—'}</td>
                  <td className="px-3 py-2">{teamOf(b.teamId) || '—'}</td>
                  <td className="px-3 py-2">{b.area || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{blockedBy(b.blockedBy)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link to="/schedule" className={buttonClassNames('secondary', 'sm')}>Reschedule</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
