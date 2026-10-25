// Guards the single invariant the whole demo build rests on: with
// REACT_APP_DEMO_AUTH=1 the app resolves a session and full navigation
// permissions WITHOUT touching the network.
//
// This is a deliberate exception to "pure-logic tests only" — it costs nothing
// (no dnd-kit, no layout measurement) and it protects the thing that silently
// breaks the walkthrough: AuthContext's restore effect calling logout() on any
// fetch failure and bouncing to /login.

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

function AuthProbe() {
  const { permissions, currentUser, loading, loadingPermissions, isAuthenticated } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="loadingPermissions">{String(loadingPermissions)}</span>
      <span data-testid="authed">{String(isAuthenticated())}</span>
      <span data-testid="email">{currentUser?.email ?? ''}</span>
      <span data-testid="role">{currentUser?.role ?? ''}</span>
      <span data-testid="permissions">{permissions.join(',')}</span>
    </div>
  );
}

// Keys of navigationData in components/Layout.js. If a nav section is added
// there without being added to DEMO_PERMISSIONS, this test fails — which is
// the point: the demo's navigation must match production's.
const NAV_KEYS = [
  'dashboard', 'driver', 'schedule', 'info', 'cases',
  'access', 'delivery', 'customer', 'scanning', 'settings',
];

describe('AuthContext demo-auth seam', () => {
  const ORIGINAL = { ...process.env };
  let fetchSpy;

  beforeEach(() => {
    sessionStorage.clear();
    // Any call is a failure, so make one loud rather than letting it resolve.
    fetchSpy = jest.fn(() => Promise.reject(new Error('network should not be used')));
    global.fetch = fetchSpy;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.restoreAllMocks();
    delete global.fetch;
  });

  it('resolves a full admin session with no network calls', async () => {
    process.env = { ...ORIGINAL, REACT_APP_DEMO_AUTH: '1' };

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('loadingPermissions')).toHaveTextContent('false');
    expect(screen.getByTestId('authed')).toHaveTextContent('true');
    expect(screen.getByTestId('email')).toHaveTextContent('demo@cehub.local');
    expect(screen.getByTestId('role')).toHaveTextContent('Admin');
  });

  it('grants every navigationData section, so the demo nav matches production', async () => {
    process.env = { ...ORIGINAL, REACT_APP_DEMO_AUTH: '1' };

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    const granted = screen.getByTestId('permissions').textContent.split(',');
    NAV_KEYS.forEach(key => expect(granted).toContain(key));
  });

  it('persists the session so isAuthenticated() survives a remount', async () => {
    process.env = { ...ORIGINAL, REACT_APP_DEMO_AUTH: '1' };

    render(<AuthProvider><AuthProbe /></AuthProvider>);
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(sessionStorage.getItem('isAuthenticated')).toBe('true');
    expect(JSON.parse(sessionStorage.getItem('employeeData')).email).toBe('demo@cehub.local');
  });

  it('is off by default — the switch cannot leak into a normal build', async () => {
    process.env = { ...ORIGINAL, REACT_APP_DEMO_AUTH: undefined };

    render(<AuthProvider><AuthProbe /></AuthProvider>);

    // No demo session; the restore effect goes down the real path instead.
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('email')).toHaveTextContent('');
    expect(sessionStorage.getItem('employeeData')).toBeNull();
  });
});
