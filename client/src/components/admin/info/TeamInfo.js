import React, { useEffect, useState } from "react";
import {
    getAllTeams,
    getAllEmployeeTeamAssignments,
    getAllEmployees,
    addTeam,
    deleteTeam,
    updateTeam
} from "../../../services/informationService";

// This badge can be imported and used in EmployeeInfo as well
export function TeamBadge({ teamType }) {
    const getTeamStyle = (type) => {
        if (!type) return 'bg-gray-100 text-gray-800';

        const lowerType = type.toLowerCase();
        if (lowerType.includes('delivery')) return 'bg-blue-100 text-blue-800';
        if (lowerType.includes('installation')) return 'bg-purple-100 text-purple-800';
        if (lowerType.includes('warehouse')) return 'bg-orange-100 text-orange-800';
        return 'bg-gray-100 text-gray-800';
    };

    return (
        <span className={`inline-flex items-center px-2 py-1 rounded-full font-medium text-xs ${getTeamStyle(teamType)}`}>
            {teamType || 'Unassigned'}
        </span>
    );
}

function Modal({ show, onClose, children }) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-40">
            <div
                className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto"
                tabIndex={-1}
            >
                <button
                    onClick={onClose}
                    className="absolute top-2 right-3 text-gray-400 hover:text-black text-lg"
                    aria-label="Close"
                >
                    &times;
                </button>
                {children}
            </div>
        </div>
    );
}

export default function TeamInfo() {
    const [teams, setTeams] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [newTeamType, setNewTeamType] = useState("");
    const [teamModalOpen, setTeamModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editTeamType, setEditTeamType] = useState("");
    const [editTeamId, setEditTeamId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState("");

    useEffect(() => {
        loadAllData();
    }, []);

    async function loadAllData() {
        setLoading(true);
        try {
            const [teamsData, assignmentsData, employeesData] = await Promise.all([
                getAllTeams(),
                getAllEmployeeTeamAssignments(),
                getAllEmployees()
            ]);

            console.log('[TeamInfo] Data loaded:', {
                teams: teamsData?.length,
                assignments: assignmentsData?.length,
                employees: employeesData?.length,
                sampleTeam: teamsData?.[0]
            });

            setTeams(teamsData);
            setAssignments(assignmentsData);
            setEmployees(employeesData);
        } catch (e) {
            setError("Failed to load data: " + e.message);
            console.error('[TeamInfo] Load error:', e);
        }
        setLoading(false);
    }

    // Get members for a team
    function getTeamMembers(teamId) {
        const employeeIds = assignments
            .filter(a => (a.TeamID || a.teamId || a.team_id) === teamId)
            .map(a => a.EmployeeID || a.employeeId || a.employee_id);

        return employees.filter(emp => employeeIds.includes(emp.EmployeeID || emp.id));
    }

    function getTeamMembersCount(teamId) {
        return getTeamMembers(teamId).filter(m => m.active_flag || m.activeFlag).length;
    }

    function openTeamModal() {
        setNewTeamType("");
        setTeamModalOpen(true);
        setSuccessMsg("");
        setError(null);
    }

    function openEditModal(team) {
        setEditTeamType(team.TeamType || team.teamType || team.team_type);
        setEditTeamId(team.TeamID || team.id);
        setEditModalOpen(true);
        setSuccessMsg("");
        setError(null);
    }

    async function handleAddTeam() {
        if (!newTeamType) {
            setError("Please enter a team type");
            return;
        }

        setSaving(true);
        setError(null);
        setSuccessMsg("");

        try {
            await addTeam({ team_type: newTeamType });
            setSuccessMsg("Team added successfully!");
            setTeamModalOpen(false);
            await loadAllData(); // Refresh all data
        } catch (e) {
            setError("Failed to add team: " + e.message);
        }
        setSaving(false);
    }

    async function handleEditTeam() {
        if (!editTeamType) {
            setError("Please enter a team type");
            return;
        }
        setSaving(true);
        setError(null);
        setSuccessMsg("");

        try {
            await updateTeam(editTeamId, { team_type: editTeamType });
            setSuccessMsg("Team updated successfully!");
            setEditModalOpen(false);
            await loadAllData();
        } catch (e) {
            setError("Failed to update team: " + e.message);
        }
        setSaving(false);
    }

    async function handleDeleteTeam(teamId) {
        // Check if any employees are assigned to this team
        const members = getTeamMembers(teamId);
        if (members.length > 0) {
            setError(`Cannot delete team. ${members.length} employee(s) are still assigned to this team.`);
            return;
        }

        if (!window.confirm("Delete this team?")) return;

        setSaving(true);
        setError(null);
        setSuccessMsg("");

        try {
            await deleteTeam(teamId);
            setSuccessMsg("Team deleted successfully!");
            await loadAllData(); // Refresh all data
        } catch (e) {
            setError("Failed to delete team: " + e.message);
        }
        setSaving(false);
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-800">Team Management</h2>
                <button
                    onClick={openTeamModal}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors duration-200 text-sm font-medium"
                >
                    + Add New Team
                </button>
            </div>

            {successMsg && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md text-sm">
                    {successMsg}
                </div>
            )}
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                    {error}
                </div>
            )}

            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-8">
                        <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            <span className="ml-2 text-gray-500">Loading teams...</span>
                        </div>
                    </div>
                ) : teams.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        No teams found. Create your first team using the "Add New Team" button.
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {teams.map(team => {
                            const teamId = team.TeamID || team.id;
                            const teamType = team.TeamType || team.teamType || team.team_type;
                            const memberCount = getTeamMembersCount(teamId);
                            const members = getTeamMembers(teamId);
                            const activeMembers = members.filter(m => m.active_flag || m.activeFlag);

                            return (
                                <div key={teamId} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="font-semibold text-gray-800">{teamType}</h3>
                                            <p className="text-sm text-gray-500">
                                                {memberCount} active member{memberCount !== 1 ? 's' : ''}
                                                {members.length !== activeMembers.length && (
                                                    <span className="text-gray-400">
                                                        {' '}({members.length - activeMembers.length} inactive)
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => openEditModal(team)}
                                                className="text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors duration-200"
                                                title="Edit Team"
                                                disabled={saving}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTeam(teamId)}
                                                className="text-red-600 hover:bg-red-50 p-1 rounded transition-colors duration-200"
                                                title="Delete Team"
                                                disabled={saving || members.length > 0}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {members.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-medium text-gray-600 uppercase tracking-wider">Members:</h4>
                                            <div className="space-y-1">
                                                {members.map(member => {
                                                    const memberId = member.EmployeeID || member.id;
                                                    const memberActive = member.active_flag !== undefined ? member.active_flag : member.activeFlag;
                                                    const memberRole = (typeof member.role === 'object' && member.role) ? member.role.name : member.role;

                                                    return (
                                                        <div key={memberId} className="flex justify-between items-center text-sm">
                                                            <span className={memberActive ? "text-gray-800" : "text-gray-400"}>
                                                                {member.name}
                                                            </span>
                                                            <span className={`text-xs px-2 py-1 rounded ${memberActive
                                                                    ? "bg-green-100 text-green-700"
                                                                    : "bg-gray-100 text-gray-500"
                                                                }`}>
                                                                {memberRole}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {members.length === 0 && (
                                        <p className="text-xs text-gray-400 italic">No members assigned</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add Team Modal */}
            <Modal show={teamModalOpen} onClose={() => setTeamModalOpen(false)}>
                <h3 className="text-xl font-semibold mb-6 text-gray-800">Add New Team</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Team Type <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={newTeamType}
                            onChange={(e) => setNewTeamType(e.target.value)}
                            className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g. Delivery Team, Installation Team, etc."
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">Enter the team name as you want it to appear</p>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={handleAddTeam}
                            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
                            disabled={saving || !newTeamType.trim()}
                        >
                            {saving ? "Adding..." : "Add Team"}
                        </button>
                        <button
                            onClick={() => setTeamModalOpen(false)}
                            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
                            disabled={saving}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Edit Team Modal */}
            <Modal show={editModalOpen} onClose={() => setEditModalOpen(false)}>
                <h3 className="text-xl font-semibold mb-6 text-gray-800">Edit Team</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Team Type <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={editTeamType}
                            onChange={(e) => setEditTeamType(e.target.value)}
                            className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g. Delivery Team, Installation Team, etc."
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">Edit the team name as you want it to appear</p>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={handleEditTeam}
                            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
                            disabled={saving || !editTeamType.trim()}
                        >
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                        <button
                            onClick={() => setEditModalOpen(false)}
                            className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
                            disabled={saving}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}