import React, { useEffect, useState } from "react";
import {
    getAllTeams,
    getAllEmployeeTeamAssignments,
    getAllEmployees,
    addTeam,
    deleteTeam,
    updateTeam
} from "../../../services/informationService";
import InfoPage from "../../common/InfoPage";
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
        const employeeIds = assignments
            .filter(a => a.team_id === teamId)
            .map(a => a.employee_id);

        return employees.filter(emp => employeeIds.includes(emp.id));
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
        setModalData(team);
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
                await updateTeam(modalData.id, { team_type: modalData.team_type });
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
        <InfoPage
            title="Team Management"
            add_button_title="Add New Team"
            onAdd={openAddModal}
            successMsg={successMsg}
            error={error}
        >
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
                        {teams.map(team => (
                            <TeamCard
                                key={team.id}
                                team={team}
                                members={getTeamMembers(team.id)}
                                onEdit={openEditModal}
                                onDelete={handleDeleteTeam}
                                saving={saving}
                            />
                        ))}
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
        </InfoPage>
    );
}
