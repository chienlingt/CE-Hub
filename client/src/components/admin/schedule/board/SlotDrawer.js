import React, { useMemo } from 'react';
import SlideOver from '../../../common/SlideOver';
import SlotFeasibilityPanel from '../day/SlotFeasibilityPanel';
import { evaluateSlotFeasibility } from '../../../../utils/schedule/validateAssignment';
import { longDateLabel } from '../../../../utils/schedule/weekRange';

/**
 * One lorry-slot's §5 checklist, so the stated reason for every check survives
 * the retirement of the Day tab. The DO cap row reads the shared window total.
 */
export default function SlotDrawer({ lane, entities, config, onClose, onOpenOrder }) {
  const checks = useMemo(() => (lane ? evaluateSlotFeasibility({
    slot: { id: lane.id, dateKey: lane.dateKey, start: lane.start, end: lane.end, status: lane.status },
    orders: lane.orders,
    windowOrders: lane.windowOrders,
    truck: lane.truck,
    team: lane.team,
    buildingsById: entities.buildings.byId,
    productsById: entities.products.byId,
    employeesById: entities.employees.byId,
    config,
  }) : []), [lane, entities, config]);

  if (!lane) return null;

  return (
    <SlideOver
      open
      onClose={onClose}
      title={`${lane.truckPlate ?? 'No lorry'} · ${lane.windowLabel} ${lane.timeLabel}`}
      subtitle={`${longDateLabel(lane.dateKey)}${lane.teamName ? ` · ${lane.teamName}` : ''}`}
      width="sm:w-[440px]"
    >
      <SlotFeasibilityPanel checks={checks} />
      {lane.orders.length > 0 && (
        <ol className="mt-3 space-y-1 text-xs">
          {lane.orders.map((order, i) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => onOpenOrder(order.id)}
                className="w-full rounded px-1 py-0.5 text-left hover:bg-gray-50"
              >
                <span className="mr-1 tabular-nums text-gray-400">{i + 1}.</span>
                <span className="font-mono">{order.doNo}</span>
                <span className="ml-1 text-gray-500">{order.deliveryAddress}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </SlideOver>
  );
}
