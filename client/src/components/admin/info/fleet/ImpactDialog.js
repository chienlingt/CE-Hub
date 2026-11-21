import React from 'react';
import FleetDialog from './FleetDialog';
import Button from '../../../common/Button';
import { formatDay, plural, sessionLabel } from '../../../../utils/fleet/fleetRules';

/**
 * The open orders a block-off would land on (FR-10-006). Confirming saves the
 * block-off; the orders are listed under Exceptions › Fleet Blocked, not moved.
 */
export default function ImpactDialog({ affected, summary, trucks, teams, busy, serverError, onBack, onConfirm }) {
  const plateOf = id => trucks.find(t => t.id === id)?.plate;
  const teamOf = id => teams.find(t => t.id === id)?.name;
  const n = affected.length;

  return (
    <FleetDialog
      open
      maxWidth="max-w-3xl"
      title={`${plural(n, 'booked order')} ${n === 1 ? 'is' : 'are'} in this time`}
      subtitle={summary}
      onClose={onBack}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onBack} disabled={busy}>Back</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving…' : `Block and flag ${plural(n, 'order')}`}
          </Button>
        </div>
      )}
    >
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-700">
            <tr>
              <th scope="col" className="px-3 py-2">Order</th>
              <th scope="col" className="px-3 py-2">Date</th>
              <th scope="col" className="px-3 py-2">Session</th>
              <th scope="col" className="px-3 py-2">Truck / team</th>
              <th scope="col" className="px-3 py-2">Area</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {affected.map(b => (
              <tr key={`${b.kind}-${b.orderId}-${b.date}-${b.session}`}>
                <td className="px-3 py-2 font-semibold text-gray-900">{b.orderRef}{b.kind === 'installation' && <span className="ml-1 text-xs font-normal text-gray-600">(installation)</span>}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatDay(b.date)}</td>
                <td className="px-3 py-2">{sessionLabel(b.session)}</td>
                <td className="px-3 py-2">{[plateOf(b.truckId), teamOf(b.teamId)].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-3 py-2">{b.area || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-gray-700">
        These orders will be listed under Exceptions › Fleet Blocked for rescheduling. Nothing is moved automatically.
      </p>
      {serverError && <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</p>}
    </FleetDialog>
  );
}
