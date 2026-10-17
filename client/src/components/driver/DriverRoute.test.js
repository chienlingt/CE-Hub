import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import DriverRoute from './DriverRoute';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { employeeId: 'driver-1' } }) }));
jest.mock('../../hooks/useDriverJobs', () => ({ useDriverJobs: () => ({ slots: [], loading: false }) }));
jest.mock('../../hooks/useGoogleMapsScript', () => ({ useGoogleMapsScript: () => ({ loaded: false, error: null }) }));

const jobs = ['a', 'b', 'c'].map(id => ({ id, customer_name: `Customer ${id}`, status: 'Scheduled', address: 'Demo address' }));
const route = { date: '2026-10-17', stops: jobs.map(job => ({ order_id: job.id, customer_name: job.customer_name })), route_distance_m: 1000, route_duration_s: 600 };
const ids = () => [...document.querySelectorAll('[data-stop-id]')].map(element => element.getAttribute('data-stop-id'));
let oldFetch;
let oldElementFromPoint;

beforeEach(() => {
  oldFetch = global.fetch;
  oldElementFromPoint = document.elementFromPoint;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => route }));
});
afterEach(() => {
  global.fetch = oldFetch;
  document.elementFromPoint = oldElementFromPoint;
});

async function arrange() {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DriverRoute slotId="slot-1" jobs={jobs} allJobs={jobs} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Arrange' }));
}

test('native drag/drop rearranges the cards and saves that sequence', async () => {
  await arrange();
  const cards = document.querySelectorAll('[data-stop-id]');
  const transfer = { effectAllowed: '', dropEffect: '', setData: jest.fn(), getData: () => 'a' };
  fireEvent.dragStart(cards[0], { dataTransfer: transfer });
  expect(transfer.setData).toHaveBeenCalledWith('text/plain', 'a');
  fireEvent.dragOver(cards[2], { dataTransfer: transfer });
  fireEvent.drop(cards[2], { dataTransfer: transfer });
  expect(ids()).toEqual(['b', 'c', 'a']);
  fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url.endsWith('/reorder'))).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url]) => url.endsWith('/reorder'));
  expect(JSON.parse(options.body).ordered_order_ids).toEqual(['b', 'c', 'a']);
});

test('visible Up and Down controls move a delivery and disable boundary moves', async () => {
  await arrange();
  expect(screen.getAllByRole('button', { name: 'Move delivery earlier' })[0]).toBeDisabled();
  expect(screen.getAllByRole('button', { name: 'Move delivery later' })[2]).toBeDisabled();
  fireEvent.click(screen.getAllByRole('button', { name: 'Move delivery earlier' })[1]);
  expect(ids()).toEqual(['b', 'a', 'c']);
});

function pointer(element, kind) {
  const event = createEvent[kind](element, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200 })) Object.defineProperty(event, key, { value });
  fireEvent(element, event);
}

test('touch dragging the grip moves the card to the highlighted target', async () => {
  await arrange();
  const handle = screen.getByRole('button', { name: 'Drag Customer a to rearrange' });
  handle.setPointerCapture = jest.fn();
  handle.hasPointerCapture = () => true;
  handle.releasePointerCapture = jest.fn();
  document.elementFromPoint = () => document.querySelector('[data-stop-id="c"]');
  pointer(handle, 'pointerDown');
  pointer(handle, 'pointerMove');
  pointer(handle, 'pointerUp');
  expect(ids()).toEqual(['b', 'c', 'a']);
});
