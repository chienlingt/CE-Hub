import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Check,
  X,
  Save,
  RotateCcw,
  AlertTriangle,
  Plus,
  Trash2,
} from 'lucide-react';

import { adminSessionHeaders } from '../../../utils/adminSessionHeaders';
import { ADMIN_NAVIGATION } from '../../../utils/adminNavigation';
import { API_BASE_URL as REACT_APP_API_BASE_URL } from '../../../utils/apiBaseUrl';

/**
 * RoleAccessControl - Fetches from PostgreSQL via API
 * - Loads roles from /api/roles endpoint
 * - Saves role permissions back to PostgreSQL roles table
 */

const isAdminRole = role => role?.name?.trim().toLowerCase() === 'admin';
const permissionSignature = values => JSON.stringify([...new Set(values || [])].sort());
const mockNavItems = [
  { key: 'order', name: 'Orders', description: 'Delivery order management', icon: '📋' },
  { key: 'dashboard', name: 'Dashboard', description: 'Main dashboard overview', icon: '📊' },
  { key: 'schedule', name: 'Schedule', description: 'Schedule management and delivery planning', icon: '📅' },
  // Not a page: without it the Schedule board is view-only (e.g. salespeople).
  { key: 'schedule_edit', name: 'Schedule — edit', description: 'Drag, approve, reject and move DOs on the Schedule board', icon: '✏️' },
  { key: 'info', name: 'Information', description: 'Employee, team, and building data', icon: '📦' },
  { key: 'cases', name: 'Exceptions', description: 'Failed deliveries, driver escalations, system reports, and sync health', icon: '📈' },
  { key: 'access', name: 'Access Control', description: 'Role changes require an Admin login', icon: '🛡️' },
  // Hidden from sidebar — kept for easy re-enable.
  // { key: 'installation', name: 'Installation Schedule', description: 'Installation schedule management', icon: '🔧' },
  { key: 'scanning',  name: 'Scan Station',  description: 'Item loading and unloading scan confirmation', icon: '📷' },
  { key: 'driver',    name: 'Deliveries', description: 'Delivery teams, orders, and routes', icon: '🚛' },
];

// Keep the additional edit capability beside Schedule, not as a separate page.
const orderedNavItems = ADMIN_NAVIGATION.flatMap(item => {
  const permission = { ...mockNavItems.find(nav => nav.key === item.key), name: item.title };
  return item.key === 'schedule'
    ? [permission, mockNavItems.find(nav => nav.key === 'schedule_edit')]
    : [permission];
});

export default function RoleAccessControl() {
  const [roles, setRoles] = useState([]); // [{ id, name, permissions }]
  const navItems = orderedNavItems;
  const [accessControl, setAccessControl] = useState({}); // { roleId: [perm,...] }
  const [originalAccessControl, setOriginalAccessControl] = useState({});
  const [selectedRole, setSelectedRole] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');

  // Load roles from PostgreSQL API
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load roles from API
        const rolesUrl = `${REACT_APP_API_BASE_URL}/api/roles?counts=1`;
        const response = await fetch(rolesUrl, { headers: adminSessionHeaders() });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to load roles');

        const data = await response.json();
        const loadedRoles = (data.data || data).map(role => ({
          id: role.id,
          name: role.name || role.id,
          permissions: Array.isArray(role.permissions) ? role.permissions : [],
          userCount: role._count?.employees
        }));

        if (!mounted) return;

        setRoles(loadedRoles);

        // build accessControl map
        const map = {};
        loadedRoles.forEach(r => {
          map[r.id] = Array.isArray(r.permissions) ? r.permissions.slice() : [];
        });

        setAccessControl(map);
        setOriginalAccessControl(JSON.parse(JSON.stringify(map)));

        // select admin if present else first role
        const hasAdmin = loadedRoles.find(r => r.id === 'admin' || (r.name && r.name.toLowerCase() === 'admin'));
        setSelectedRole(hasAdmin ? (hasAdmin.id) : (loadedRoles[0] ? loadedRoles[0].id : null));
      } catch (err) {
        console.error('Failed to load roles:', err);
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const changed = Object.keys(accessControl).some(id => permissionSignature(accessControl[id]) !== permissionSignature(originalAccessControl[id]));
    setHasChanges(changed);
  }, [accessControl, originalAccessControl, selectedRole]);

  useEffect(() => {
    const warn = event => {
      if (hasChanges) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  const toggleAccess = (roleId, navKey) => {
    if (isSaving || isAdminRole(roles.find(role => role.id === roleId))) return;
    setNotice('');
    setAccessControl(prev => {
      let next = prev[roleId]?.includes(navKey)
        ? prev[roleId].filter(k => k !== navKey)
        : [...(prev[roleId] || []), navKey];
      if (navKey === 'schedule' && !next.includes('schedule')) next = next.filter(key => key !== 'schedule_edit');
      if (navKey === 'schedule_edit' && next.includes('schedule_edit') && !next.includes('schedule')) next.push('schedule');
      return { ...prev, [roleId]: next };
    });
  };

  const saveChanges = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    setNotice('');
    try {
      // Update all changed role permissions via API
      const updates = Object.keys(accessControl).filter(roleId => {
        const prev = originalAccessControl[roleId] || [];
        const curr = accessControl[roleId] || [];
        return permissionSignature(prev) !== permissionSignature(curr);
      });

      // Update each role's permissions
      for (const roleId of updates) {
        const response = await fetch(`${REACT_APP_API_BASE_URL}/api/roles/${roleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...adminSessionHeaders() },
          body: JSON.stringify({ permissions: accessControl[roleId] })
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to save role permissions.');
        }
        setOriginalAccessControl(previous => ({ ...previous, [roleId]: [...accessControl[roleId]] }));
      }

      // Each completed role is retained if a later update fails.

      setNotice('Saved. Users can refresh or sign in again to load their updated access.');
    } catch (err) {
      console.error('Failed to save access control:', err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const resetChanges = () => {
    if (isSaving) return;
    setNotice('');
    setAccessControl(JSON.parse(JSON.stringify(originalAccessControl)));
    setHasChanges(false);
  };

  const addNewRole = async () => {
    const name = (newRoleName || '').trim();
    if (!name || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminSessionHeaders() },
        body: JSON.stringify({ name, permissions: [] })
      });

      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to create role');

      const data = await response.json();
      const newRole = data.data || data;

      setRoles(prev => [...prev, { id: newRole.id, name: newRole.name, permissions: [], userCount: 0 }]);
      setAccessControl(prev => ({ ...prev, [newRole.id]: [] }));
      setOriginalAccessControl(prev => ({ ...prev, [newRole.id]: [] }));
      setSelectedRole(newRole.id);
      setNewRoleName('');
      setShowAddRole(false);
    } catch (err) {
      console.error('Failed to add role:', err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRole = async (roleId) => {
    if (!roleId || isSaving) return;
    // prevent deleting admin
    const roleObj = roles.find(r => r.id === roleId);
    const roleNameLower = (roleObj?.name || roleId).toString().toLowerCase();
    if (roleId === 'admin' || roleNameLower === 'admin') {
      alert('Cannot delete admin role');
      return;
    }

    if (!window.confirm(`Delete role "${roleObj?.name || roleId}"? This cannot be undone.`)) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/roles/${roleId}`, {
        method: 'DELETE', headers: adminSessionHeaders()
      });

      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to delete role');

      // update local state
      setRoles(prev => prev.filter(r => r.id !== roleId));
      setAccessControl(prev => {
        const copy = { ...prev };
        delete copy[roleId];
        return copy;
      });
      setOriginalAccessControl(prev => {
        const copy = { ...prev };
        delete copy[roleId];
        return copy;
      });
      if (selectedRole === roleId) {
        const first = roles.find(r => r.id !== roleId);
        setSelectedRole(first ? first.id : null);
      }
    } catch (err) {
      console.error('Failed to delete role:', err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getRoleInfo = (roleId) => {
    return roles.find(r => r.id === roleId) || { id: roleId, name: roleId, permissions: [], userCount: 0 };
  };

  const getAccessCount = (roleId) => {
    return isAdminRole(getRoleInfo(roleId)) ? navItems.length : navItems.filter(item => accessControl[roleId]?.includes(item.key)).length;
  };

  const selectedRoleInfo = selectedRole ? getRoleInfo(selectedRole) : null;

  // UI Rendering
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading access control...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Only show the action area when there is something to save or report. */}
        {(hasChanges || notice || error) && <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              {hasChanges && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={resetChanges}
                    disabled={isSaving}
                    className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </button>
                  <button
                    onClick={saveChanges}
                    disabled={isSaving}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {hasChanges && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
                <p className="text-yellow-800 text-sm">
                  Unsaved changes
                </p>
              </div>
            </div>
          )}

          {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
          {error && (
            <div role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
              {!roles.length && <button className="ml-3 underline" onClick={() => window.location.reload()}>Retry</button>}
            </div>
          )}
        </div>}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Role Selection Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Roles</h3>
                <button
                  onClick={() => setShowAddRole(true)}
                  disabled={isSaving}
                  aria-label="Add role"
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Add New Role"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {showAddRole && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="text"
                    placeholder="New role name"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded mb-2 text-sm"
                    disabled={isSaving} maxLength={80}
                    onKeyDown={(e) => e.key === 'Enter' && addNewRole()}
                  />
                  <div className="flex space-x-2">
                    <button
                      disabled={isSaving} onClick={addNewRole}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowAddRole(false); setNewRoleName(''); }}
                      className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {roles.map(role => {
                  const roleId = role.id;
                  const roleInfo = getRoleInfo(roleId);
                  const accessCount = getAccessCount(roleId);
                  const isSelected = selectedRole === roleId;

                  return (
                    <div
                      key={roleId}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onKeyDown={event => {
                        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault(); setSelectedRole(roleId);
                        }
                      }}
                      onClick={() => setSelectedRole(roleId)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors relative group ${
                        isSelected
                          ? 'bg-blue-50 border-2 border-blue-200'
                          : 'border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-gray-900 text-sm">{roleInfo.name}</h4>
                            <div className="flex items-center space-x-2">
                              {!isAdminRole(roleInfo) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteRole(roleId);
                                  }}
                                  disabled={isSaving || roleInfo.userCount > 0}
                                  className="p-2 text-red-500 hover:bg-red-50 rounded disabled:opacity-30"
                                  title="Delete role"
                                  aria-label={`Delete ${roleInfo.name} role`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{roleInfo.userCount ?? '—'} users</p>
                          <p className="text-xs text-blue-600 mt-1">{accessCount} permissions</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Access Control Panel */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Access Permissions: {selectedRoleInfo ? selectedRoleInfo.name : '—'}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{selectedRoleInfo ? selectedRoleInfo.description || '' : ''}</p>
                </div>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    {selectedRoleInfo ? (selectedRoleInfo.userCount ?? '—') : 0} users
                  </div>
                  <div className="flex items-center">
                    <Shield className="h-4 w-4 mr-1" />
                    {selectedRole ? getAccessCount(selectedRole) : 0} permissions
                  </div>
                </div>
              </div>

              {isAdminRole(selectedRoleInfo) && <p className="mb-4 text-sm text-gray-500">Admin always has full access.</p>}
              <fieldset disabled={isSaving} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {navItems.map(navItem => {
                  const key = navItem.key;
                  const hasAccess = isAdminRole(selectedRoleInfo) || (selectedRole ? (accessControl[selectedRole] || []).includes(key) : false);

                  return (
                    <button
                      type="button"
                      disabled={isSaving || !selectedRole || isAdminRole(selectedRoleInfo)}
                      aria-pressed={hasAccess}
                      key={key}
                      className={`text-left p-3 rounded-lg border transition-all disabled:cursor-default ${
                        hasAccess
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      }`}
                      onClick={() => selectedRole && toggleAccess(selectedRole, key)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center flex-1">
                          <span className="text-2xl mr-3">{navItem.icon || '🔹'}</span>
                          <div>
                            <h4 className="font-medium text-gray-900">{navItem.name}</h4>
                            <p className="text-sm text-gray-600 mt-1">{navItem.description}</p>
                          </div>
                        </div>
                        <div className={`p-2 rounded-full ${
                          hasAccess
                            ? 'bg-green-100 text-green-600'
                            : 'bg-gray-200 text-gray-400'
                        }`}>
                          {hasAccess ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </fieldset>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
