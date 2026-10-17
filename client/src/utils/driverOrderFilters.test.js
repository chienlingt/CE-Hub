import { nextDeliverySlotId } from './driverOrderFilters';

test('only the earliest unfinished slot owns the next stop, then advances after completion', () => {
  const groups = [
    { slot: { id: 'am' }, jobs: [{ status: 'Delivered' }, { status: 'Delivering' }] },
    { slot: { id: 'pm' }, jobs: [{ status: 'Scheduled' }] },
  ];
  expect(nextDeliverySlotId(groups)).toBe('am');
  groups[0].jobs[1].status = 'Delivered';
  expect(nextDeliverySlotId(groups)).toBe('pm');
  groups[1].jobs[0].status = 'Failed';
  expect(nextDeliverySlotId(groups)).toBeUndefined();
});
