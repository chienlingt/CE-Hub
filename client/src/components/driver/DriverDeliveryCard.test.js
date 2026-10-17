import { sortDeliveryCards } from './DriverDeliveryCard';

test('shows active deliveries in route order, failed next, delivered last', () => {
  const jobs = [
    { id: 'done', status: 'Delivered' },
    { id: 'b', status: 'Delivering' },
    { id: 'failed', status: 'Failed' },
    { id: 'a', status: 'Scheduled' },
  ];
  const result = sortDeliveryCards(jobs, [{ order_id: 'a' }, { order_id: 'b' }]);
  expect(result.map(job => job.id)).toEqual(['a', 'b', 'failed', 'done']);
  expect(jobs.map(job => job.id)).toEqual(['done', 'b', 'failed', 'a']);
});

test('keeps filtered cards in route order without adding hidden deliveries', () => {
  const jobs = [{ id: 'b', status: 'Delivering' }, { id: 'a', status: 'Delivering' }];
  expect(sortDeliveryCards(jobs, [{ order_id: 'a' }, { order_id: 'hidden' }, { order_id: 'b' }]).map(job => job.id)).toEqual(['a', 'b']);
});

test('preserves order when route information is unavailable', () => {
  expect(sortDeliveryCards([{ id: 'b', status: 'Loaded' }, { id: 'a', status: 'Scheduled' }]).map(job => job.id)).toEqual(['b', 'a']);
});
