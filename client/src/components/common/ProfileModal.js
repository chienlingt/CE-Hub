import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  getAllEmployeeTeamAssignments,
  getAllTeams,
  updateEmployee
} from '../../services/informationService';

import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

export default function ProfileModal({
  isOpen,
  onClose,
  employeeData,
  currentUser,
  onProfileSaved
}) {
  const [profileForm, setProfileForm] = useState(null);
  const [profileTeams, setProfileTeams] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  const employeeId = useMemo(() => (
    employeeData?.id || employeeData?.EmployeeID || currentUser?.employeeId || null
  ), [employeeData, currentUser]);

  useEffect(() => {
    if (!isOpen) return;
    if (!employeeId) {
      setProfileError('Unable to load employee details.');
      return;
    }

    setProfileLoading(true);
    setProfileError('');
    setPasswordError('');
    setPasswordMessage('');
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setProfileForm({
      name: employeeData?.name || '',
      display_name: employeeData?.display_name || employeeData?.displayName || '',
      email: employeeData?.email || currentUser?.email || '',
      contact_number: employeeData?.contact_number || employeeData?.contactNumber || '',
      bio: employeeData?.bio || '',
      active_flag: employeeData?.active_flag ?? employeeData?.activeFlag ?? true
    });

    let mounted = true;
    Promise.all([getAllEmployeeTeamAssignments(), getAllTeams()])
      .then(([assignments, teams]) => {
        if (!mounted) return;
        const assignmentList = Array.isArray(assignments) ? assignments : (assignments?.data ?? []);
        const teamList = Array.isArray(teams) ? teams : (teams?.data ?? []);
        const teamById = new Map(teamList.map(t => [
          String(t.id ?? t.team_id ?? t.TeamID ?? ''),
          t
        ]));
        const assignedTeamNames = assignmentList
          .filter(a => String(a.employee_id ?? a.EmployeeID ?? a.employeeId ?? '') === String(employeeId))
          .map(a => {
            const teamId = a.team_id ?? a.TeamID ?? a.teamId;
            const team = teamById.get(String(teamId));
            return team?.team_type ?? team?.TeamType ?? team?.name;
          })
          .filter(Boolean);
        setProfileTeams(assignedTeamNames.length > 0 ? assignedTeamNames : ['No team']);
      })
      .catch((err) => {
        if (!mounted) return;
        setProfileError('Failed to load team details. ' + (err.message || ''));
      })
      .finally(() => {
        if (!mounted) return;
        setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, employeeId, employeeData, currentUser]);

  const handleSaveProfile = async () => {
    if (!profileForm || !employeeId) return;
    setProfileSaving(true);
    setProfileError('');
    try {
      const payload = {
        name: profileForm.name,
        display_name: profileForm.display_name || null,
        email: profileForm.email || null,
        contact_number: profileForm.contact_number || null,
        bio: profileForm.bio || null,
        active_flag: !!profileForm.active_flag
      };
      await updateEmployee(employeeId, payload);
      if (onProfileSaved) onProfileSaved(payload);
      onClose();
    } catch (err) {
      setProfileError('Failed to update details. ' + (err.message || ''));
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!employeeId) return;
    setPasswordError('');
    setPasswordMessage('');
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setPasswordError('Please fill in current and new password.');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update password');
      }
      setPasswordMessage('Password updated successfully.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">My Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {profileError && (
          <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">
            {profileError}
          </div>
        )}

        {profileLoading || !profileForm ? (
          <div className="text-sm text-gray-500">Loading profile...</div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm(f => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Display Name</label>
                  <input
                    type="text"
                    value={profileForm.display_name}
                    onChange={(e) => setProfileForm(f => ({ ...f, display_name: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm(f => ({ ...f, email: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Contact Number</label>
                  <input
                    type="text"
                    value={profileForm.contact_number}
                    onChange={(e) => setProfileForm(f => ({ ...f, contact_number: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Bio</label>
                <textarea
                  rows={3}
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm(f => ({ ...f, bio: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Teams (read-only)</label>
                <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {profileTeams.join(', ')}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Change Password</h3>
              {passwordError && (
                <div className="p-2 bg-red-50 text-red-700 text-sm rounded">
                  {passwordError}
                </div>
              )}
              {passwordMessage && (
                <div className="p-2 bg-green-50 text-green-700 text-sm rounded">
                  {passwordMessage}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Current Password</label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">New Password</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Confirm Password</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handlePasswordChange}
                  disabled={passwordSaving}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:bg-gray-400"
                >
                  {passwordSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:bg-gray-400"
              >
                {profileSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
