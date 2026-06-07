import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Settings,
  Check,
  X,
  Save,
  RotateCcw,
  AlertTriangle,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Edit3,
} from 'lucide-react';

const REACT_APP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

/**
 * RoleAccessControl - Fetches from PostgreSQL via API
 * - Loads roles from /api/roles endpoint
 * - Saves role permissions back to PostgreSQL roles table
 */

const mockNavItems = [
  { key: 'dashboard', name: 'Dashboard', description: 'Main dashboard overview', icon: '📊' },
  { key: 'schedule', name: 'Schedule', description: 'Schedule management and delivery planning', icon: '📅' },
  { key: 'info', name: 'Information', description: 'Product, team, and building data', icon: '📦' },
  { key: 'cases', name: 'Cases', description: 'Cases reported by employees', icon: '📈' },
  { key: 'access', name: 'Access Control', description: 'Role and permission management', icon: '🛡️' },
  { key: 'delivery', name: 'Delivery Schedule', description: 'Delivery schedule management', icon: '🚚' },
  { key: 'installation', name: 'Installation Schedule', description: 'Installation schedule management', icon: '🔧' },
  { key: 'warehouse', name: 'Warehouse Schedule', description: 'Warehouse loading and operations', icon: '🏭' },
  { key: 'customer',  name: 'Place Order',   description: 'Demo to place order', icon: '' },
  { key: 'scanning',  name: 'Scan Station',  description: 'Item picking and loading scan confirmation', icon: '📷' },
  { key: 'settings',  name: 'Settings',      description: 'Notification and system settings', icon: '⚙️' },
  { key: 'driver',    name: 'Driver Dashboard', description: 'Mobile driver task dashboard (delivery staff only)', icon: '🚛' },
];

export default function RoleAccessControl() {
  const [roles, setRoles] = useState([]); // [{ id, name, permissions }]
  const [navItems, setNavItems] = useState(mockNavItems);
  const [accessControl, setAccessControl] = useState({}); // { roleId: [perm,...] }
  const [originalAccessControl, setOriginalAccessControl] = useState({});
  const [selectedRole, setSelectedRole] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [error, setError] = useState(null);

  // Load roles from PostgreSQL API
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load roles from API
        const rolesUrl = `${REACT_APP_API_BASE_URL}/api/roles`;
        const response = await fetch(rolesUrl);
        // #region agent log
        fetch('http://127.0.0.1:7869/ingest/bb893903-e6fa-49ce-bc0f-08c7f79bdc83',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'41c37d'},body:JSON.stringify({sessionId:'41c37d',location:'accessControl.js:load',message:'roles fetch result',data:{rolesUrl,ok:response.ok,status:response.status},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        if (!response.ok) throw new Error('Failed to load roles');

        const data = await response.json();
        const loadedRoles = (data.data || data).map(role => ({
          id: role.id,
          name: role.name || role.id,
          permissions: Array.isArray(role.permissions) ? role.permissions : [],
          userCount: 0 // TODO: Could fetch from employees endpoint
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

        // #region agent log
        fetch('http://127.0.0.1:7869/ingest/bb893903-e6fa-49ce-bc0f-08c7f79bdc83',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'41c37d'},body:JSON.stringify({sessionId:'41c37d',location:'accessControl.js:load',message:'roles loaded',data:{roleCount:loadedRoles.length,navKeys:mockNavItems.map(n=>n.key),rolePermissions:loadedRoles.map(r=>({id:r.id,name:r.name,permissions:r.permissions}))},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
        // #endregion

        // select admin if present else first role
        const hasAdmin = loadedRoles.find(r => r.id === 'admin' || (r.name && r.name.toLowerCase() === 'admin'));
        setSelectedRole(hasAdmin ? (hasAdmin.id) : (loadedRoles[0] ? loadedRoles[0].id : null));
      } catch (err) {
        console.error('Failed to load roles:', err);
        setError('Failed to load role data. See console for details.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const changed = JSON.stringify(accessControl) !== JSON.stringify(originalAccessControl);
    setHasChanges(changed);
    // #region agent log
    fetch('http://127.0.0.1:7869/ingest/bb893903-e6fa-49ce-bc0f-08c7f79bdc83',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'41c37d'},body:JSON.stringify({sessionId:'41c37d',location:'accessControl.js:hasChanges',message:'hasChanges computed',data:{changed,selectedRole,currentPerms:selectedRole?accessControl[selectedRole]:null,originalPerms:selectedRole?originalAccessControl[selectedRole]:null},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
  }, [accessControl, originalAccessControl, selectedRole]);

  const toggleAccess = (roleId, navKey) => {
    // #region agent log
    fetch('http://127.0.0.1:7869/ingest/bb893903-e6fa-49ce-bc0f-08c7f79bdc83',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'41c37d'},body:JSON.stringify({sessionId:'41c37d',location:'accessControl.js:toggleAccess',message:'toggle clicked',data:{roleId,navKey,before:accessControl[roleId]},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    setAccessControl(prev => ({
      ...prev,
      [roleId]: prev[roleId]?.includes(navKey)
        ? prev[roleId].filter(k => k !== navKey)
        : [...(prev[roleId] || []), navKey]
    }));
  };

  const saveChanges = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Update all changed role permissions via API
      const updates = Object.keys(accessControl).filter(roleId => {
        const prev = originalAccessControl[roleId] || [];
        const curr = accessControl[roleId] || [];
        return JSON.stringify(prev) !== JSON.stringify(curr);
      });

      // Update each role's permissions
      for (const roleId of updates) {
        const response = await fetch(`${REACT_APP_API_BASE_URL}/api/roles/${roleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: accessControl[roleId] })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to update role ${roleId}: ${errorText}`);
        }
      }

      // Update local state to reflect saved changes
      setOriginalAccessControl(JSON.parse(JSON.stringify(accessControl)));
      setHasChanges(false);

      alert('Access control settings saved successfully! Users will need to log out and log back in for changes to take effect.');
    } catch (err) {
      console.error('Failed to save access control:', err);
      setError('Failed to save changes. See console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetChanges = () => {
    setAccessControl(JSON.parse(JSON.stringify(originalAccessControl)));
    setHasChanges(false);
  };

  const addNewRole = async () => {
    const name = (newRoleName || '').trim();
    if (!name) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, permissions: [] })
      });

      if (!response.ok) throw new Error('Failed to create role');

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
      setError('Failed to add role. See console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRole = async (roleId) => {
    if (!roleId) return;
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
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete role');

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
      setError('Failed to delete role. See console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const getRoleInfo = (roleId) => {
    return roles.find(r => r.id === roleId) || { id: roleId, name: roleId, permissions: [], userCount: 0 };
  };

  const getAccessCount = (roleId) => {
    return accessControl[roleId]?.length || 0;
  };

  const selectedRoleInfo = selectedRole ? getRoleInfo(selectedRole) : null;

  // #region agent log
  if (!loading) {
    fetch('http://127.0.0.1:7869/ingest/bb893903-e6fa-49ce-bc0f-08c7f79bdc83',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'41c37d'},body:JSON.stringify({sessionId:'41c37d',location:'accessControl.js:render',message:'render state',data:{hasChanges,isSaving,selectedRole,navItemCount:navItems.length,navKeys:navItems.map(n=>n.key),saveButtonVisible:hasChanges},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  }
  // #endregion

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
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {hasChanges && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={resetChanges}
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
                  You have unsaved changes. Don't forget to save your access control modifications.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Role Selection Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Roles</h3>
                <button
                  onClick={() => setShowAddRole(true)}
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
                    onKeyPress={(e) => e.key === 'Enter' && addNewRole()}
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={addNewRole}
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
                              {roleId !== 'admin' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteRole(roleId);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded transition-all"
                                  title="Delete role"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{roleInfo.userCount || 0} users</p>
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
                    {selectedRoleInfo ? (selectedRoleInfo.userCount || 0) : 0} users
                  </div>
                  <div className="flex items-center">
                    <Shield className="h-4 w-4 mr-1" />
                    {selectedRole ? getAccessCount(selectedRole) : 0} permissions
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {navItems.map(navItem => {
                  const key = navItem.key;
                  const hasAccess = selectedRole ? (accessControl[selectedRole] || []).includes(key) : false;

                  return (
                    <div
                      key={key}
                      className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
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
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
