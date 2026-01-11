import React, { useEffect, useState } from "react";
import {
    getAllTeams,
    getAllEmployeeTeamAssignments,
    getAllEmployees,
    addTeam,
    deleteTeam,
    updateTeam
} from "../../../services/informationService";
import InfoModal from "../../common/InfoModal";
import FormField from "../../common/FormField";
import TeamCard from "./TeamCard";

export default function TeamInfo() {
    const [teams, setTeams] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState("add");
    const [modalData, setModalData] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState("");

    useEffect(() => {
        loadAllData();
    }, []);

    function getTeamId(team) {
        return team?.id || team?.TeamID || team?.team_id || team?.teamId || null;
    }

    function getTeamType(team) {
        return team?.team_type || team?.teamType || team?.TeamType || null;
    }

    function getAssignmentTeamId(assignment) {
        return (
            assignment?.team_id ||
            assignment?.teamId ||
            assignment?.TeamID ||
            assignment?.team?.id ||
            assignment?.team?.TeamID ||
            assignment?.team?.team_id ||
            null
        );
    }

    function getAssignmentEmployeeId(assignment) {
        return (
            assignment?.employee_id ||
            assignment?.employeeId ||
            assignment?.EmployeeID ||
            assignment?.employee?.id ||
            assignment?.employee?.EmployeeID ||
            assignment?.employee?.employee_id ||
            null
        );
    }

    function getEmployeeId(employee) {
        return employee?.id || employee?.EmployeeID || employee?.employee_id || null;
    }

    async function loadAllData() {
        setLoading(true);
        try {
            const [teamsData, assignmentsData, employeesData] = await Promise.all([
                getAllTeams(),
                getAllEmployeeTeamAssignments(),
                getAllEmployees()
            ]);

            setTeams(teamsData);
            setAssignments(assignmentsData);
            setEmployees(employeesData);
        } catch (e) {
            setError("Failed to load data: " + e.message);
            console.error('[TeamInfo] Load error:', e);
        }
        setLoading(false);
    }

    function getTeamMembers(teamId) {
        if (!teamId) return [];
        const employeeIds = new Set(
            assignments
                .filter(a => getAssignmentTeamId(a) === teamId)
                .map(a => getAssignmentEmployeeId(a))
                .filter(Boolean)
        );

        return employees.filter(emp => employeeIds.has(getEmployeeId(emp)));
    }

    function openAddModal() {
        setModalMode("add");
        setModalData({ team_type: "" });
        setModalOpen(true);
        setSuccessMsg("");
        setError(null);
    }

    function openEditModal(team) {
        setModalMode("edit");
        setModalData({
            ...team,
            id: getTeamId(team),
            team_type: getTeamType(team) || ""
        });
        setModalOpen(true);
        setSuccessMsg("");
        setError(null);
    }

    function handleModalChange(e) {
        const { name, value } = e.target;
        setModalData(prev => ({ ...prev, [name]: value }));
    }

    async function handleModalSubmit(e) {
        e.preventDefault();
        if (!modalData.team_type) {
            setError("Please enter a team type");
            return;
        }

        setSaving(true);
        setError(null);
        setSuccessMsg("");

        try {
            if (modalMode === "add") {
                await addTeam({ team_type: modalData.team_type });
                setSuccessMsg("Team added successfully!");
            } else {
                const teamId = getTeamId(modalData);
                await updateTeam(teamId, { team_type: modalData.team_type });
                setSuccessMsg("Team updated successfully!");
            }
            setModalOpen(false);
            await loadAllData();
        } catch (e) {
            setError(`Failed to ${modalMode} team: ` + e.message);
        }
        setSaving(false);
    }

    async function handleDeleteTeam(teamId) {
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
            await loadAllData();
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
                    onClick={openAddModal}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200 text-sm font-medium"
                >
                    + Add Team
                </button>
            </div>
            {successMsg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md text-sm">{successMsg}</div>}
            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>}

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
                        No teams found. Create your first team using the "Add Team" button.
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {teams.map(team => {
                            const teamId = getTeamId(team);
                            const teamType = getTeamType(team);
                            return (
                                <TeamCard
                                    key={teamId || team.id || team.TeamID}
                                    team={{ ...team, id: teamId, team_type: teamType }}
                                    members={getTeamMembers(teamId)}
                                    onEdit={openEditModal}
                                    onDelete={handleDeleteTeam}
                                    saving={saving}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            <InfoModal
                show={modalOpen}
                onClose={() => setModalOpen(false)}
                mode={modalMode}
                title="Team"
                onFormSubmit={handleModalSubmit}
                saving={saving}
                error={error}
            >
                <FormField
                    fieldKey="team_type"
                    label="Team Type"
                    value={modalData.team_type}
                    onChange={handleModalChange}
                    placeholder="e.g. Delivery Team, Installation Team, etc."
                    required
                />
            </InfoModal>
        </div>
    );
}
