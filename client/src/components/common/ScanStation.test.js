import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { compareLoadingOrders, compareUnloadingOrders, ItemTable, orderDate } from './ScanStation';

const order = (id, slot, start, sequence) => ({ id, time_slot_id: slot, time_slots: { time_window_start: start }, truck_loading_sequence: sequence });

test('departed orders remain on the slot date when recalculated ETA crosses midnight', () => {
  expect(orderDate({ time_slots: { date: '2026-10-17' }, scheduled_start_date_time: '2026-10-17T19:40:59.038Z', order_status: 'Delivering' })).toBe('2026-10-17');
});

test('unslotted orders use Malaysia dates, not the browser timezone', () => {
  expect(orderDate({ scheduled_start_date_time: '2026-10-17T19:40:59.038Z' })).toBe('2026-10-18');
  expect(orderDate({})).toBe('');
});

test('uses saved LIFO loading numbers rather than DO reference order', () => {
  const rows = [order('DO-A', 'am', '09:00', 3), order('DO-Z', 'am', '09:00', 1), order('DO-B', 'am', '09:00', 2)];
  expect([...rows].sort(compareLoadingOrders).map(o => o.id)).toEqual(['DO-Z', 'DO-B', 'DO-A']);
  expect(rows[0].id).toBe('DO-A');
});

test('keeps trips separate and puts missing sequences after ranked orders', () => {
  const rows = [order('PM', 'pm', '14:00', 1), order('Unknown', 'am', '09:00', null), order('AM', 'am', '09:00', 2)];
  expect(rows.sort(compareLoadingOrders).map(o => o.id)).toEqual(['PM', 'AM', 'Unknown']);
});

test('orders slots latest first, without prioritising delivery status', () => {
  const rows = [{ ...order('Delivered', 'am', '08:00', 1), order_status: 'Delivered' }, { ...order('Failed', 'am', '08:00', 2), order_status: 'Failed' }, order('Active', 'pm', '14:00', 3)];
  expect(rows.sort(compareLoadingOrders).map(o => o.id)).toEqual(['Active', 'Delivered', 'Failed']);
});

test('groups three identical products but keeps every serial and status visible', () => {
  const assigned = { ...order('DO-1', 'am', '09:00', 1), odoo_order_ref: 'DO-1', order_status: 'Scheduled', customers: { full_name: 'Customer' } };
  assigned.time_slots.truck = { plate_no: 'ABC123' };
  const rows = ['SERIAL-A', 'SERIAL-B', 'SERIAL-C'].map((serial, index) => ({ id: index + 1, product_id: 'fridge', products: { product_name: 'Fridge' }, assigned_serial: serial, handling_status: index ? 'pending' : 'loaded', _orderId: assigned.id, _order: assigned }));
  render(<ItemTable rows={rows} tab="loading" />);
  const card = screen.getByRole('article', { name: 'DO-1' });
  expect(within(card).getAllByText('Fridge', { exact: false })).toHaveLength(1);
  ['SERIAL-A', 'SERIAL-B', 'SERIAL-C'].forEach(serial => expect(within(card).getByText(serial)).toBeVisible());
  expect(within(card).getByText('×3')).toBeVisible();
  expect(within(card).getByText('Next load')).toBeVisible();
  expect(within(card).getByText('1/3 loaded')).toBeVisible();
  expect(screen.getAllByText(/ABC123/)).toHaveLength(1);
  expect(within(card).queryByText(/ABC123/)).not.toBeInTheDocument();
});

test('search does not highlight a later load as next', () => {
  const allRows = [1, 2].map(n => ({ id: n, products: { product_name: `Item ${n}` }, handling_status: 'pending', _orderId: `DO-${n}`, _order: order(`DO-${n}`, 'am', '09:00', n) }));
  render(<ItemTable rows={[allRows[1]]} allRows={allRows} tab="loading" />);
  expect(screen.queryByText('Next load')).not.toBeInTheDocument();
});

test('shows night then afternoon then morning, with one heading per slot and loaded cards at each slot bottom', () => {
  const rows = [
    ['Morning', 'am', '09:00', 1, 'pending'],
    ['Night loaded', 'night', '18:00', 1, 'loaded'],
    ['Night pending', 'night', '18:00', 2, 'pending'],
    ['Afternoon', 'pm', '14:00', 1, 'pending'],
  ].map(([id, slot, start, seq, status]) => ({ id, _orderId: id, _order: order(id, slot, start, seq), products: { product_name: 'Item' }, handling_status: status }));
  render(<ItemTable rows={rows} tab="loading" />);
  expect(screen.getAllByRole('article').map(card => card.getAttribute('aria-label'))).toEqual(['Night pending', 'Night loaded', 'Afternoon', 'Morning']);
  expect(screen.getAllByRole('heading').map(heading => heading.textContent)).toEqual(['18:00', '14:00', '09:00']);
  expect(screen.getByRole('article', { name: 'Night loaded' })).toHaveClass('bg-gray-50');
  expect(within(screen.getByRole('article', { name: 'Night pending' })).getByText('Next load')).toBeVisible();
});

test('unloading follows morning to night and reverses saved loading order within each slot', () => {
  const rows = [order('Night', 'night', '18:00', 2), order('Morning last', 'am', '09:00', 1), order('Morning first', 'am', '09:00', 2), order('Unknown rank', 'am', '09:00', null), order('Afternoon', 'pm', '14:00', 1)];
  expect(rows.sort(compareUnloadingOrders).map(o => o.id)).toEqual(['Morning first', 'Morning last', 'Unknown rank', 'Afternoon', 'Night']);
});

test('unloading uses cards, highlights the next delivery and mutes only fully unloaded cards', () => {
  const rows = [
    ['First delivered', 'am', '09:00', 3, 'unloaded'],
    ['Next delivery', 'am', '09:00', 2, 'loaded'],
    ['Last delivery', 'am', '09:00', 1, 'loaded'],
    ['Night delivery', 'night', '18:00', 1, 'loaded'],
  ].map(([id, slot, start, sequence, status]) => ({ id, _orderId: id, _order: { ...order(id, slot, start, sequence), order_status: 'Delivering' }, products: { product_name: 'Fridge' }, loaded_serial: `${id}-SERIAL`, handling_status: status }));
  render(<ItemTable rows={rows} tab="unloading" isAdmin />);
  expect(screen.getAllByRole('article').map(card => card.getAttribute('aria-label'))).toEqual(['Next delivery', 'Last delivery', 'Night delivery', 'First delivered']);
  expect(screen.getAllByRole('heading').map(heading => heading.textContent)).toEqual(['09:00', '18:00', 'Unloaded']);
  const next = screen.getByRole('article', { name: 'Next delivery' });
  expect(within(next).getByText('Next unload')).toBeVisible();
  expect(within(next).getByText('0/1 unloaded')).toBeVisible();
  expect(within(next).getByText('Next delivery-SERIAL')).toBeVisible();
  expect(screen.getByRole('article', { name: 'First delivered' })).toHaveClass('bg-gray-50');
  expect(screen.queryByRole('button', { name: 'Edit serial number' })).not.toBeInTheDocument();
});
