import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell from './NotificationBell';

const latest15 = Array.from({ length: 15 }, (_, i) => ({
  id: `n${i}`, user_id: 'u1', type: 'error', is_read: false, order_id: null,
  message: `Delivery failed · Customer ${i} · Address · Reason · #DO${i}`, created_at: new Date().toISOString(),
}));

function mockApi({ total, countFails = false }) {
  global.fetch = jest.fn(url => {
    if (String(url).includes('/unread-count')) {
      return countFails ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: true, json: async () => ({ count: total }) });
    }
    return Promise.resolve({ ok: true, json: async () => latest15 });
  });
}

const renderBell = () => render(<MemoryRouter><NotificationBell userId="u1" /></MemoryRouter>);

afterEach(() => { jest.restoreAllMocks(); delete global.fetch; });

test('the red number is the real unread total, not just the latest 15', async () => {
  mockApi({ total: 37 });
  renderBell();
  const bell = screen.getByRole('button', { name: 'Notifications' });
  await waitFor(() => expect(bell).toHaveTextContent('37'));
});

test('over 99 unread shows 99+', async () => {
  mockApi({ total: 120 });
  renderBell();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toHaveTextContent('99+'));
});

test('if the count request fails the number falls back to the unread items in the list', async () => {
  mockApi({ total: 37, countFails: true });
  renderBell();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toHaveTextContent('15'));
});
