import React, { useContext, useState, useEffect, createContext } from 'react';

// Create context
const AuthContext = createContext();

// Custom hook for consuming context
export function useAuth() {
  return useContext(AuthContext);
}

// Helper to normalize strings
const normalize = (s) => (s || '').toString().toLowerCase().trim();

const REACT_APP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || window.location.origin.replace(/:\d+$/, ':4000');

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
    return normalize(role);
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
      try {
        const storedData = sessionStorage.getItem('employeeData');
        const isAuth = sessionStorage.getItem('isAuthenticated');

        if (storedData && isAuth === 'true') {
          const parsed = JSON.parse(storedData);
          if (!mounted) return;

          setEmployeeData(parsed);
          setCurrentUser({
            email: parsed.email,
            name: parsed.name || '',
            role: parsed.role || '',
            employeeId: parsed.EmployeeID || parsed.id || '',
          });

          const storedPerms = sessionStorage.getItem('employeePermissions');
          if (storedPerms) {
            const parsedPerms = JSON.parse(storedPerms);
            setPermissions(parsedPerms.map(normalize));
            setLoadingPermissions(false);
          } else {
            setLoadingPermissions(true);
            // Extract role - could be an object with id/name, or just a string/ID
            let roleToFetch = parsed.role;
            if (typeof parsed.role === 'object' && parsed.role !== null) {
              roleToFetch = parsed.role.name || parsed.role.id || parsed.roleId;
            } else {
              roleToFetch = parsed.role || parsed.roleId;
            }
            const perms = await fetchPermissionsForRole(roleToFetch);
            if (!mounted) return;
            setPermissions(perms);
            sessionStorage.setItem('employeePermissions', JSON.stringify(perms));
            setLoadingPermissions(false);
          }

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
