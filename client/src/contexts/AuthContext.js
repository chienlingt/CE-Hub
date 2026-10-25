import React, { useContext, useState, useEffect, createContext } from 'react';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

// Create context
const AuthContext = createContext();

// Custom hook for consuming context
export function useAuth() {
  return useContext(AuthContext);
}

// Helper to normalize strings
const normalize = (s) => (s || '').toString().toLowerCase().trim();
const roleValue = role => (role && typeof role === 'object' ? role.name || role.id : role) || '';

const REACT_APP_API_BASE_URL = getApiBaseUrl();

// ---------------------------------------------------------------------------
// Demo mode (stakeholder walkthrough build — see client/DEMO.md)
//
// REACT_APP_DEMO_AUTH=1 makes the app render with no backend at all: no
// verify-session, no /api/roles, no login. It exists because every route is
// behind ProtectedRoute -> Layout, and Layout's navigation is gated on
// permissions fetched from /api/roles, so a mock-data build still needs the
// server without this seam.
//
// Defaults OFF. A normal `npm run build` never takes these branches.
// ---------------------------------------------------------------------------
// Read per-call rather than at module scope so this stays unit-testable. CRA
// inlines process.env.REACT_APP_* at build time either way.
const isDemoAuth = () => process.env.REACT_APP_DEMO_AUTH === '1';

// Must stay in sync with the keys of `navigationData` in components/Layout.js.
// Layout also short-circuits on role === 'admin', so the role below is what
// actually unlocks the nav; this list keeps hasPermission() honest too.
const DEMO_PERMISSIONS = [
  'dashboard', 'driver', 'schedule', 'schedule_edit', 'info', 'cases',
  'access', 'delivery', 'customer', 'scanning', 'settings',
];

const DEMO_EMPLOYEE = {
  id: 'demo-admin',
  EmployeeID: 'demo-admin',
  name: 'Demo Admin',
  email: 'demo@cehub.local',
  active_flag: true,
  role: { id: 'demo-role-admin', name: 'Admin', permissions: DEMO_PERMISSIONS },
};

/**
 * Fetch permissions for a given role from PostgreSQL API.
 * Tries to match by role ID or name.
 */
async function fetchPermissionsForRole(roleRaw) {
  if (!roleRaw) {
    return [];
  }

  const roleId = normalize(roleRaw);
  
  try {
    // Fetch all roles from API
    const response = await fetch(`${REACT_APP_API_BASE_URL}/api/roles`, {
      headers: { 'ngrok-skip-browser-warning': '1' },
    });
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const roles = Array.isArray(data) ? data : (data.data || []);

    // Find role by ID or name (case-insensitive)
    const role = roles.find(r => {
      const rId = normalize(r.id || '');
      const rName = normalize(r.name || '');
      const match = rId === roleId || rName === roleId;
      if (match) {
        console.log('[AuthContext] Role match found:', { roleId: r.id, roleName: r.name, permissions: r.permissions });
      }
      return match;
    });

    if (!role) {
      console.warn('[AuthContext] No role found matching:', roleId, 'Available roles:', roles.map(r => ({ id: normalize(r.id), name: normalize(r.name) })));
      return [];
    }

    if (role && Array.isArray(role.permissions)) {
      console.log('[AuthContext] Returning permissions for role:', role.name, '→', role.permissions);
      return role.permissions.map(normalize);
    }

    return [];
  } catch (err) {
    console.error('[AuthContext] fetchPermissionsForRole error:', err);
    return [];
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [employeeData, setEmployeeData] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPermissions, setLoadingPermissions] = useState(true);

  // Check authentication
  const isAuthenticated = () =>
    sessionStorage.getItem('isAuthenticated') === 'true';

  // Role helpers
  const getEmployeeRole = () => {
    const role =
      employeeData?.role ||
      sessionStorage.getItem('employeeRole') ||
      '';
    return normalize(roleValue(role));
  };

  const hasRole = (role) => getEmployeeRole() === normalize(role);

  const hasPermission = (permissionName) =>
    permissions.includes(normalize(permissionName));

  // API Login function - calls backend and handles authentication
  const login = async (email, password) => {
    try {

      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      if (!data.employee) {
        throw new Error('Incorrect Password');
      }

      // Login successful - now set up the session and fetch permissions
      if (data.admin_session) sessionStorage.setItem('adminSession', JSON.stringify(data.admin_session));
      else sessionStorage.removeItem('adminSession');
      await signIn(data.employee);

      return { success: true };
    } catch (err) {
      console.error('[AuthContext] login error:', err);
      return { success: false, error: err.message || String(err) };
    }
  };

  // Internal session setup handler
  const signIn = async (empData) => {
    if (!empData) return;
    // Extract role - could be an object with id/name, or just a string/ID
    let roleToFetch = empData.role;
    if (typeof empData.role === 'object' && empData.role !== null) {
      // If role is an object, prefer role.name, then role.id
      roleToFetch = empData.role.name || empData.role.id || empData.roleId;
    } else {
      // If role is not an object, use it directly (might be roleId or role name)
      roleToFetch = empData.role || empData.roleId;
    }
    const roleNorm = normalize(roleToFetch);
    const userObj = {
      email: empData.email,
      name: empData.name || empData.displayName || '',
      role: roleToFetch || '',
      employeeId: empData.EmployeeID || empData.id || '',
    };

    // Save locally
    setCurrentUser(userObj);
    setEmployeeData(empData);

    // Save session
    try {
      sessionStorage.setItem('isAuthenticated', 'true');
      sessionStorage.setItem('employeeData', JSON.stringify(empData));
      sessionStorage.setItem('employeeRole', roleToFetch || '');
      sessionStorage.setItem('employeeId', userObj.employeeId);
      sessionStorage.setItem('employeeName', userObj.name);
      sessionStorage.setItem('employeeEmail', userObj.email);
    } catch (err) {
      console.warn('Failed to persist sessionStorage', err);
    }

    // Fetch permissions
    setLoadingPermissions(true);
    try {
      const perms = await fetchPermissionsForRole(roleNorm);
      setPermissions(perms);
      sessionStorage.setItem('employeePermissions', JSON.stringify(perms));
    } catch (err) {
      console.warn('Failed to load permissions for role:', err);
      setPermissions([]);
    } finally {
      setLoadingPermissions(false);
    }
  };

  // Logout handler
  const logout = () => {
    try {
      const token = JSON.parse(sessionStorage.getItem('adminSession'))?.token;
      if (token) fetch(`${REACT_APP_API_BASE_URL}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    } catch { /* no admin session */ }
    setCurrentUser(null);
    setEmployeeData(null);
    setPermissions([]);
    setLoadingPermissions(false);

    sessionStorage.clear();
    console.log('🔒 Logged out successfully');
  };

  // Restore session
  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      setLoading(true);

      // Demo build: resolve the session locally and return BEFORE any fetch.
      // This must come first — verify-session failing would otherwise hit the
      // catch below, call logout(), and bounce straight to /login.
      if (isDemoAuth()) {
        console.warn('[AuthContext] DEMO AUTH ACTIVE — authentication is bypassed.');
        try {
          sessionStorage.setItem('isAuthenticated', 'true');
          sessionStorage.setItem('employeeData', JSON.stringify(DEMO_EMPLOYEE));
          sessionStorage.setItem('employeeRole', DEMO_EMPLOYEE.role.name);
          sessionStorage.setItem('employeeId', DEMO_EMPLOYEE.id);
          sessionStorage.setItem('employeeName', DEMO_EMPLOYEE.name);
          sessionStorage.setItem('employeeEmail', DEMO_EMPLOYEE.email);
          sessionStorage.setItem('employeePermissions', JSON.stringify(DEMO_PERMISSIONS));
        } catch (err) {
          console.warn('[AuthContext] demo session persist failed', err);
        }
        if (!mounted) return;
        setEmployeeData(DEMO_EMPLOYEE);
        setCurrentUser({
          email: DEMO_EMPLOYEE.email,
          name: DEMO_EMPLOYEE.name,
          role: DEMO_EMPLOYEE.role.name,
          employeeId: DEMO_EMPLOYEE.id,
        });
        setPermissions(DEMO_PERMISSIONS);
        setLoadingPermissions(false);
        setLoading(false);
        return;
      }

      try {
        const storedData = sessionStorage.getItem('employeeData');
        const isAuth = sessionStorage.getItem('isAuthenticated');

        if (storedData && isAuth === 'true') {
          let parsed = JSON.parse(storedData);

          // Demo reseeding recreates employees with new UUIDs. Validate the
          // stored employee before restoring it so an obsolete UUID cannot
          // make scoped pages silently show an empty data set.
          const storedEmployeeId = parsed.EmployeeID || parsed.id || '';
          const verifyResponse = await fetch(`${REACT_APP_API_BASE_URL}/api/auth/verify-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': '1',
            },
            body: JSON.stringify({ employeeId: storedEmployeeId }),
          });

          if (!verifyResponse.ok) {
            logout();
            return;
          }

          const verified = await verifyResponse.json();
          parsed = verified.employee || parsed;
          sessionStorage.setItem('employeeData', JSON.stringify(parsed));
          if (!mounted) return;

          setEmployeeData(parsed);
          const restoredRole = roleValue(parsed.role || parsed.roleId);
          sessionStorage.setItem('employeeRole', restoredRole);
          setCurrentUser({
            email: parsed.email,
            name: parsed.name || '',
            role: restoredRole,
            employeeId: parsed.EmployeeID || parsed.id || '',
          });

          // Never restore access from sessionStorage: an admin may have revoked it.
          // verify-session includes the current database role and permissions.
          setLoadingPermissions(true);
          const perms = Array.isArray(verified.employee?.role?.permissions)
            ? verified.employee.role.permissions.map(normalize)
            : await fetchPermissionsForRole(restoredRole);
          if (!mounted) return;
          setPermissions(perms);
          sessionStorage.setItem('employeePermissions', JSON.stringify(perms));
          setLoadingPermissions(false);

          console.log('✅ Session restored for', parsed.email);
        } else {
          logout();
        }
      } catch (err) {
        console.error('Session restore failed:', err);
        logout();
      } finally {
        if (mounted) setLoading(false);
      }
    };

    restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  const value = {
    currentUser,
    employeeData,
    permissions,
    isAuthenticated,
    login,
    logout,
    getEmployeeRole,
    hasRole,
    hasPermission,
    loading,
    loadingPermissions,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
