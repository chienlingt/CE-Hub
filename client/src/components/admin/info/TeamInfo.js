import React, { useEffect, useState, useMemo } from "react";
import Select from 'react-select';
import {
    getAllTeams,
    getAllEmployeeTeamAssignments,
    getAllEmployees,
    getAllTrucks,
    addTeam,
    deleteTeam,
    updateTeam,
    getTeamDeletability
} from "../../../services/informationService";
import InfoModal from "../../common/InfoModal";
import FormField from "../../common/FormField";
import TeamCard from "./TeamCard";

function isDeliveryTeamType(teamType) {
    return (teamType || '').toLowerCase().includes('delivery');
}

export default function TeamInfo() {
    const [teams, setTeams] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [trucks, setTrucks] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState("add");
    const [modalData, setModalData] = useState({});
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    // Only meaningful in Add mode: lets the admin pick the team's kind up front instead of
    // having to type a name containing "delivery" for the pair fields to appear. In Edit
    // mode the kind is fixed and inferred from the existing team_type, same as before.
    const [teamKind, setTeamKind] = useState("normal");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState("");
    const [formErrors, setFormErrors] = useState({});

    const validate = (data, effectiveIsDelivery) => {
        const errors = {};
        if (!data.team_type || data.team_type.trim() === '') {
            errors.team_type = "Team type is required.";
        } else if (effectiveIsDelivery && !isDeliveryTeamType(data.team_type)) {
            errors.team_type = 'Team name must include "Delivery" (e.g. "HS Delivery Team") so it\'s recognized as a delivery pair.';
        }
        if (effectiveIsDelivery
            && data.primary_driver_id
            && data.assistant_driver_id
            && data.primary_driver_id === data.assistant_driver_id) {
            errors.assistant_driver_id = "Primary and Assistant driver must be different people.";
        }
        return errors;
    };

    useEffect(() => {
        loadAllData();
    }, []);

    const employeeOptions = useMemo(() =>
        employees.map(e => ({ value: getEmployeeId(e), label: e.name || e.display_name }))
    , [employees]);

    const truckOptions = useMemo(() =>
        trucks.map(t => ({ value: t.id, label: t.plate_no || t.id }))
    , [trucks]);

    const assignedEmployeeIds = useMemo(() => {
        const activeTeams = teams.filter(t => t.available_flag).map(t => getTeamId(t));
        return new Set(
            assignments
                .filter(a => activeTeams.includes(getAssignmentTeamId(a)))
                .map(a => getAssignmentEmployeeId(a))
        );
    }, [teams, assignments]);

    // Employees already Primary/Assistant Driver on another active Delivery team — excluded
    // from the driver selects below (unless they're already this team's own pair member).
    const pairedElsewhereIds = useMemo(() => {
        const currentTeamId = getTeamId(modalData);
        const otherActiveDeliveryTeams = teams.filter(t =>
            t.available_flag && isDeliveryTeamType(t.team_type) && getTeamId(t) !== currentTeamId
        );
        return new Set(
            otherActiveDeliveryTeams.flatMap(t => [t.primary_driver_id, t.assistant_driver_id].filter(Boolean))
        );
    }, [teams, modalData]);

    const eligibleDriverOptions = useMemo(() =>
        employeeOptions.filter(opt =>
            !pairedElsewhereIds.has(opt.value)
            || opt.value === modalData.primary_driver_id
            || opt.value === modalData.assistant_driver_id
        )
    , [employeeOptions, pairedElsewhereIds, modalData]);

    const primaryDriverOptions = useMemo(() =>
        eligibleDriverOptions.filter(opt => opt.value !== modalData.assistant_driver_id)
    , [eligibleDriverOptions, modalData]);

    const assistantDriverOptions = useMemo(() =>
        eligibleDriverOptions.filter(opt => opt.value !== modalData.primary_driver_id)
    , [eligibleDriverOptions, modalData]);

    const sortedTeams = useMemo(() => {
        return [...teams].sort((a, b) => {
            const aActive = a.available_flag !== false;
            const bActive = b.available_flag !== false;
            if (aActive === bActive) return 0;
            return aActive ? -1 : 1;
        });
    }, [teams]);

    function getTeamId(team) { return team?.id || team?.TeamID || team?.team_id || team?.teamId || null; }
    function getTeamType(team) { return team?.team_type || team?.teamType || team?.TeamType || null; }
    function getAssignmentTeamId(a) { return a?.team_id || a?.teamId || a?.TeamID || a?.team?.id || null; }
    function getAssignmentEmployeeId(a) { return a?.employee_id || a?.employeeId || a?.EmployeeID || a?.employee?.id || null; }
    function getEmployeeId(employee) { return employee?.id || employee?.EmployeeID || employee?.employee_id || null; }

    async function loadAllData() {
        setLoading(true);
        setError(null);
        setSuccessMsg("");
        try {
            const [teamsData, assignmentsData, employeesData, trucksData] = await Promise.all([
                getAllTeams(), getAllEmployeeTeamAssignments(), getAllEmployees(), getAllTrucks()
            ]);
            setTeams(teamsData);
            setAssignments(assignmentsData);
            setEmployees(employeesData.filter(e => e.active_flag));
            setTrucks(trucksData);
        } catch (e) {
            setError("Failed to load data: " + e.message);
            console.error('[TeamInfo] Load error:', e);
        }
        setLoading(false);
    }

    function getTeamMembers(teamId) {
        if (!teamId) return [];
        const employeeIds = new Set(
            assignments.filter(a => getAssignmentTeamId(a) === teamId).map(a => getAssignmentEmployeeId(a)).filter(Boolean)
        );
        return employees.filter(emp => employeeIds.has(getEmployeeId(emp)));
    }

    function openAddModal() {
        setModalMode("add");
        setTeamKind("normal");
        setModalData({ team_type: "", primary_driver_id: null, assistant_driver_id: null, truck_id: null });
        setSelectedEmployees([]);
        setModalOpen(true);
        setSuccessMsg("");
        setError(null);
        setFormErrors({});
    }

    // Switching kind clears whichever fields belong to the kind being left, so stale
    // selections (e.g. a picked Assistant Driver) can't sneak into a Normal team's payload.
    function handleTeamKindChange(kind) {
        setTeamKind(kind);
        setFormErrors({});
        if (kind === "normal") {
            setModalData(prev => ({ ...prev, primary_driver_id: null, assistant_driver_id: null, truck_id: null }));
        } else {
            setSelectedEmployees([]);
        }
    }

    function openEditModal(team) {
        const teamId = getTeamId(team);
        const members = getTeamMembers(teamId);
        setModalMode("edit");
        setTeamKind(isDeliveryTeamType(getTeamType(team)) ? "delivery" : "normal");
        setModalData({
            ...team,
            id: teamId,
            team_type: getTeamType(team) || "",
            primary_driver_id: team.primary_driver_id || null,
            assistant_driver_id: team.assistant_driver_id || null,
            truck_id: team.truck_id || null,
        });
        setSelectedEmployees(members.map(m => ({ value: getEmployeeId(m), label: m.name || m.display_name })));
        setModalOpen(true);
        setSuccessMsg("");
        setError(null);
        setFormErrors({});
    }

    function handleModalChange(e) {
        const { name, value } = e.target;
        setModalData(prev => {
            const newData = { ...prev, [name]: value };
            const effectiveIsDelivery = modalMode === "add" ? teamKind === "delivery" : isDeliveryTeamType(newData.team_type);
            const errors = validate(newData, effectiveIsDelivery);
            setFormErrors(errors);
            return newData;
        });
    }

    async function handleModalSubmit(e) {
        e.preventDefault();
        const errors = validate(modalData, isDeliveryModal);
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            setError("Please fill in all required fields.");
            return;
        }

        setSaving(true);
        setError(null);
        setSuccessMsg("");

        try {
            const payload = isDeliveryModal
                ? {
                    team_type: modalData.team_type,
                    primary_driver_id: modalData.primary_driver_id || null,
                    assistant_driver_id: modalData.assistant_driver_id || null,
                    truck_id: modalData.truck_id || null,
                }
                : {
                    team_type: modalData.team_type,
                    employeeIds: selectedEmployees.map(e => e.value),
                };

            if (modalMode === "add") {
                await addTeam(payload);
                setSuccessMsg("Team added successfully!");
            } else {
                const teamId = getTeamId(modalData);
                const result = await updateTeam(teamId, payload);
                setSuccessMsg(result.message || "Team updated successfully!");
            }
            setModalOpen(false);
            await loadAllData();
        } catch (e) {
            setError(`Failed to ${modalMode} team: ` + e.message);
        }
        setSaving(false);
    }

    async function handleDeleteTeam(teamId) {
        setSaving(true);
        setError(null);
        setSuccessMsg("");
        try {
            const { status, message } = await getTeamDeletability(teamId);
            if (status === 'BLOCKED') {
                setError(message);
                setSaving(false);
                return;
            }
            if (window.confirm(message)) {
                const result = await deleteTeam(teamId);
                setSuccessMsg(result.message || "Team deletion process completed.");
                await loadAllData();
            } else {
                setSaving(false);
            }
        } catch (e) {
            setError("An unexpected error occurred: " + e.message);
            setSaving(false);
        }
    }

    async function handleDeactivateTeam() {
        if (!window.confirm("This action is IRREVERSIBLE. The team will be made inactive and its members unassigned. Continue?")) return;

        setSaving(true);
        setError(null);
        setSuccessMsg("");

        try {
            const teamId = getTeamId(modalData);
            await updateTeam(teamId, { available_flag: false });
            setSuccessMsg("Team has been made inactive.");
            setModalOpen(false);
            await loadAllData();
        } catch (e) {
            setError("Failed to deactivate team: " + e.message);
        }
        setSaving(false);
    }

    const availableEmployeesForSelect = useMemo(() => {
        const currentTeamMemberIds = new Set(selectedEmployees.map(e => e.value));
        return employeeOptions.filter(
            (opt) => !assignedEmployeeIds.has(opt.value) || currentTeamMemberIds.has(opt.value)
        );
    }, [employeeOptions, assignedEmployeeIds, selectedEmployees]);

    const isDeliveryModal = modalMode === "add" ? teamKind === "delivery" : isDeliveryTeamType(modalData.team_type);

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
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                        <span className="mt-2 text-gray-500 block">Loading teams...</span>
                    </div>
                ) : teams.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No teams found.</div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr items-stretch">
                        {sortedTeams.map(team => (
                            <TeamCard
                                key={getTeamId(team)}
                                team={team}
                                members={getTeamMembers(getTeamId(team))}
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
                formErrors={formErrors}
            >
                {modalMode === "add" && (
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Team Kind</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => handleTeamKindChange("normal")}
                                className={`cursor-pointer text-left px-3 py-2.5 rounded-md border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                    teamKind === "normal" ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:bg-gray-50"
                                }`}
                            >
                                <span className="block text-sm font-medium text-gray-800">Normal Team</span>
                                <span className="block text-xs text-gray-500 mt-0.5">Storekeeper / Warehouse / Installation</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleTeamKindChange("delivery")}
                                className={`cursor-pointer text-left px-3 py-2.5 rounded-md border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                    teamKind === "delivery" ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:bg-gray-50"
                                }`}
                            >
                                <span className="block text-sm font-medium text-gray-800">Delivery Team</span>
                                <span className="block text-xs text-gray-500 mt-0.5">Primary Driver + Assistant Driver</span>
                            </button>
                        </div>
                    </div>
                )}
                <FormField
                    fieldKey="team_type"
                    label={isDeliveryModal ? "Team Name" : "Team Type"}
                    value={modalData.team_type}
                    onChange={handleModalChange}
                    placeholder={isDeliveryModal ? "e.g. HS Delivery Team" : "e.g. Installation Team, Warehouse Team"}
                    guidance={isDeliveryModal ? 'Must include the word "Delivery" (e.g. "Zone A Delivery Team").' : undefined}
                    required
                    error={formErrors.team_type}
                />
                {isDeliveryModal ? (
                    <div className="mt-4 space-y-4">
                        <FormField
                            fieldKey="primary_driver_id"
                            label="Select Primary Driver"
                            type="select"
                            value={modalData.primary_driver_id}
                            onChange={handleModalChange}
                            options={primaryDriverOptions}
                            placeholder="— None —"
                            error={formErrors.primary_driver_id}
                        />
                        <FormField
                            fieldKey="assistant_driver_id"
                            label="Select Assistant Driver"
                            type="select"
                            value={modalData.assistant_driver_id}
                            onChange={handleModalChange}
                            options={assistantDriverOptions}
                            placeholder="— None —"
                            error={formErrors.assistant_driver_id}
                        />
                        <FormField
                            fieldKey="truck_id"
                            label="Assign Default Vehicle"
                            type="select"
                            value={modalData.truck_id}
                            onChange={handleModalChange}
                            options={truckOptions}
                            placeholder="— None —"
                        />
                    </div>
                ) : (
                    <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Assign Members</label>
                        <Select
                            isMulti
                            options={availableEmployeesForSelect}
                            value={selectedEmployees}
                            onChange={setSelectedEmployees}
                            placeholder="Select employees..."
                            closeMenuOnSelect={false}
                        />
                    </div>
                )}
                {modalMode === 'edit' && (
                    <div className="mt-6 border-t pt-4">
                        <h4 className="text-md font-semibold text-red-600">Danger Zone</h4>
                        <p className="text-sm text-gray-500 mt-1">
                            Deactivating a team is an irreversible action.
                        </p>
                        <button
                            type="button"
                            onClick={handleDeactivateTeam}
                            disabled={saving}
                            className="mt-2 w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors duration-200 text-sm font-medium"
                        >
                            {saving ? 'Deactivating...' : 'Set Team to Inactive'}
                        </button>
                    </div>
                )}
            </InfoModal>
        </div>
    );
}
