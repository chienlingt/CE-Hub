import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DriverDeliveryDetail from './DriverDeliveryDetail';
import { useDriverJobs } from '../../hooks/useDriverJobs';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { employeeId: 'driver-1' } }) }));
jest.mock('../../hooks/useDriverJobs', () => ({ useDriverJobs: jest.fn() }));
jest.mock('../common/ScannerModal', () => function MockScanner({ onScan }) {
  return <button onClick={() => onScan('SERIAL-A')}>Confirm scanned serial</button>;
});

const job = { id: 'order-1', status: 'Delivering', time_slot_id: 'slot-1', odoo_order_ref: 'DO-1', customer_name: 'Demo customer', assigned_date: '2026-10-17' };
let originalFetch;
let handling;
let scanError;

beforeEach(() => {
  originalFetch = global.fetch;
  handling = 'pending';
  scanError = null;
  useDriverJobs.mockReturnValue({ jobs: [job], loading: false, error: null, refresh: jest.fn().mockResolvedValue() });
  global.fetch = jest.fn(async (url, options) => {
    if (options?.method === 'PATCH') return { ok: !scanError, json: async () => scanError ? { error: scanError } : { orderProduct: { id: 7 } } };
    if (url.includes('loading-status')) return { ok: true, json: async () => ({ items: [{ id: 7, handling_status: handling, assigned_serial: 'SERIAL-A', products: { product_name: 'Demo fridge' } }] }) };
    return { ok: true, json: async () => ({ stops: [] }) };
  });
});

afterEach(() => { global.fetch = originalFetch; });

function openDetail(container) {
  render(<MemoryRouter initialEntries={[{ pathname: '/driver/delivery/order-1', state: { stop: { order_id: 'order-1', work_type: 'Delivery' } } }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/driver/delivery/:orderId" element={<DriverDeliveryDetail />} /></Routes>
  </MemoryRouter>, container ? { container } : undefined);
}

test('opens at the top of the app scroll container and keeps Back sticky', async () => {
  const scroller = document.createElement('div');
  scroller.setAttribute('data-page-scroll', '');
  document.body.appendChild(scroller);
  scroller.scrollTop = 800;
  openDetail(scroller);
  await screen.findByText('Demo fridge');
  expect(scroller.scrollTop).toBe(0);
  expect(screen.getByRole('button', { name: 'Back' }).parentElement).toHaveClass('sticky', 'top-0');
});

test.each([['loaded', 'unloading']])('scans a %s item using the existing %s endpoint stage', async (status, stage) => {
  handling = status;
  openDetail();
  fireEvent.click(await screen.findByRole('button', { name: 'Scan Demo fridge' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm scanned serial' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => url.endsWith('/order-products/7/handling-status') && options?.method === 'PATCH')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(JSON.parse(options.body)).toEqual({ employee_id: 'driver-1', stage, serial_number: 'SERIAL-A' });
});

test('displays the existing backend serial validation error', async () => {
  handling = 'loaded';
  scanError = 'Serial mismatch: expected SERIAL-B';
  openDetail();
  fireEvent.click(await screen.findByRole('button', { name: 'Scan Demo fridge' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm scanned serial' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(scanError);
});

test.each(['pending', 'unloaded'])('does not offer detail scanning for a %s item', async status => {
  handling = status;
  openDetail();
  await screen.findByText('Demo fridge');
  expect(screen.queryByRole('button', { name: 'Scan Demo fridge' })).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
});
