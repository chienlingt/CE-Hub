import React, { useEffect, useState } from "react";
import {
    getAllEmployees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    getAllTeams,
    getAllEmployeeTeamAssignments,
    assignOrUpdateEmployeeTeam,
    getRoles
} from "../../../services/informationService";
import { TeamBadge } from "./TeamInfo";

const TABLE_KEYS = ["name", "role", "contactNumber", "email", "team", "activeFlag", "password"];

const FIELD_LABELS = {
    name: "Name",
    role: "Role",
    contactNumber: "Contact Number",
    email: "Email",
    team: "Team",
    activeFlag: "Active Flag",
    password: "Password"
};

const FIELD_GUIDANCE = {
    name: "First letter uppercase, e.g. Lee Tian Le",
    role: "E.g. installer, admin, etc.",
    contactNumber: "Format: 01XXXXXXXX (no dashes/spaces)",
    team: "Select the team this employee belongs to",
    email: "Press Tab to accept suggested email or type your own",
    password: "Enter a secure password"
};


// Helper function to generate email from name
function generateEmailFromName(name) {
    if (!name || name.trim().length === 0) return "";

    const cleanName = name.trim().toLowerCase();
    // Remove extra spaces and replace with nothing (compact)
    const emailName = cleanName.replace(/\s+/g, '');
    // Remove special characters except dots (none expected after above)
    const sanitizedName = emailName.replace(/[^a-z0-9.]/g, '');

    return `${sanitizedName}@gmail.com`;
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

function ActiveFlagBadge({ value }) {
    return value
        ? (
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium gap-1 text-xs">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span> Active
            </span>
        )
        : (
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium gap-1 text-xs">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span> Inactive
            </span>
        );
}

export default function EmployeeInfo() {
    const [employees, setEmployees] = useState([]);
    const [teams, setTeams] = useState([]);
    const [employeeTeamMap, setEmployeeTeamMap] = useState(new Map());
    const [enrichedEmployees, setEnrichedEmployees] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState("add");
    const [modalData, setModalData] = useState({});
    const [editIdx, setEditIdx] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState("employees");
    const [showPassword, setShowPassword] = useState(false);
    const [visiblePasswords, setVisiblePasswords] = useState(new Set());
    const [rolesList, setRolesList] = useState([]);


    // Email suggestion states
    const [suggestedEmail, setSuggestedEmail] = useState("");
    const [showEmailSuggestion, setShowEmailSuggestion] = useState(false);
    const [emailInputRef, setEmailInputRef] = useState(null);

    useEffect(() => {
        loadAllData();
    }, []);

    async function loadAllData() {
        setLoading(true);
        try {
            // Load roles using the informationService helper `getRoles`
            const [employeesData, teamsData, assignmentsData, rolesData] = await Promise.all([
                getAllEmployees(),
                getAllTeams(),
                getAllEmployeeTeamAssignments(),
                getRoles()
            ]);

            console.log('[EmployeeInfo] Data loaded:', {
                employees: employeesData?.length || 0,
                teams: teamsData?.length || 0,
                assignments: assignmentsData?.length || 0,
                roles: rolesData?.length || 0,
                sampleEmployee: employeesData?.[0],
                sampleTeam: teamsData?.[0]
            });

            // Build role id -> name map and set roles list state
            const roleMap = new Map();
            (rolesData || []).forEach(r => {
                roleMap.set(r.id, r.name || r.id);
            });
            setRolesList(rolesData || []);

            // Handle both PascalCase and snake_case field names
            const teamMap = new Map();
            (teamsData || []).forEach(team => {
                const teamId = team.TeamID || team.id;
                const teamType = team.TeamType || team.teamType || team.team_type;
                teamMap.set(teamId, teamType);
            });

            const empTeamMap = new Map();
            (assignmentsData || []).forEach(assignment => {
                const empId = assignment.EmployeeID || assignment.employeeId || assignment.employee_id;
                const teamId = assignment.TeamID || assignment.teamId || assignment.team_id;
                const teamType = teamMap.get(teamId);
                empTeamMap.set(empId, {
                    TeamID: teamId,
                    TeamType: teamType
                });
            });

            const enriched = (employeesData || []).map(emp => {
                const empId = emp.id;

                // Handle role - API returns it as object from Prisma include
                let roleId, roleName;
                if (typeof emp.role === 'object' && emp.role !== null) {
                    roleId = emp.role.id;
                    roleName = emp.role.name;
                } else {
                    // Fallback if role is just an ID string
                    roleId = emp.roleId || emp.role_id;
                    roleName = roleMap.get(roleId) || '';
                }

                return {
                    EmployeeID: empId,
                    name: emp.name,
                    email: emp.email,
                    contactNumber: emp.contactNumber,
                    activeFlag: emp.activeFlag,
                    role: roleId,
                    password: emp.password || '********',
                    team: empTeamMap.get(empId)?.TeamType || null,
                    teamId: empTeamMap.get(empId)?.TeamID || null,
                    roleName: roleName
                };
            });

            console.log('[EmployeeInfo] Enriched employees sample:', enriched[0]);

            setEmployees(employeesData || []);
            setTeams(teamsData || []);
            setEmployeeTeamMap(empTeamMap);
            setEnrichedEmployees(enriched);
        } catch (e) {
            setError("Failed to load data: " + (e?.message || e));
            console.error('[EmployeeInfo] Load error:', e);
        }
        setLoading(false);
    }
    function openAddModal() {
        setModalMode("add");
        setModalData({
            name: "",
            email: "",
            role: rolesList[0]?.id || "",
            contactNumber: "",
            team: "",
            activeFlag: true,
            password: ""
        });
        setModalOpen(true);
        setSuccessMsg("");
        setError(null);
        setSuggestedEmail("");
        setShowEmailSuggestion(false);
    }


    function openEditModal(idx) {
        setModalMode("edit");
        setEditIdx(idx);
        const employee = enrichedEmployees[idx];
        // set modalData.role to the stored role value (usually role id or string)
        setModalData({
            ...employee,
            team: employee.teamId || "",
            password: "",
            role: employee.role || "" // keep stored role id/string so select can pre-select
        });
        setModalOpen(true);
        setSuccessMsg("");
        setError(null);
        setSuggestedEmail("");
        setShowEmailSuggestion(false);
    }


    function handleModalChange(e) {
        const { name, value } = e.target;
        let val = value;

        if (name === "activeFlag") {
            val = value === "true";
        }

        setModalData(prev => ({ ...prev, [name]: val }));

        // Handle email suggestion when name changes
        if (name === "name" && modalMode === "add") {
            const suggested = generateEmailFromName(val);
            setSuggestedEmail(suggested);
            setShowEmailSuggestion(val.trim().length > 0 && !modalData.email);
        }
    }

    // Handle Tab key press for email suggestion
    function handleEmailKeyDown(e) {
        if (e.key === "Tab" && showEmailSuggestion && suggestedEmail) {
            e.preventDefault();
            setModalData(prev => ({ ...prev, email: suggestedEmail }));
            setShowEmailSuggestion(false);
        }
    }

    // Handle email input focus/blur
    function handleEmailFocus() {
        if (modalMode === "add" && modalData.name && !modalData.email) {
            setShowEmailSuggestion(true);
        }
    }

    function handleEmailBlur() {
        // Hide suggestion after a short delay to allow tab key to work
        setTimeout(() => setShowEmailSuggestion(false), 150);
    }

    async function handleModalSubmit() {
        setSaving(true);
        setError(null);
        setSuccessMsg("");
        try {
            const employeeData = {
                name: modalData.name,
                role: modalData.role,
                email: modalData.email,
                contactNumber: modalData.contactNumber,
                activeFlag: modalData.activeFlag
            };
            console.log('!!!!!!!!!Updated employee:', employeeData);
            if (modalMode === "add") {
                employeeData.password = modalData.password; // add password
                const newEmp = await addEmployee(employeeData);
                const newEmpId = newEmp.EmployeeID || newEmp.id;
                if (modalData.team) {
                    await assignOrUpdateEmployeeTeam(newEmpId, modalData.team);
                }

                setSuccessMsg("Employee added successfully!");
            } else {
                // update existing employee
                if (modalData.password && modalData.password !== '********') {
                    employeeData.password = modalData.password; // only update if entered
                }
                const empId = modalData.EmployeeID || modalData.id;
                
                await updateEmployee(empId, employeeData);

                const oldTeam = modalData.teamId ?? null;
                const newTeam = modalData.team ?? null;

                if (oldTeam !== newTeam) {
                    await assignOrUpdateEmployeeTeam(empId, newTeam);
                }

                setSuccessMsg("Employee updated successfully!");
            }


            await loadAllData(); // Refresh data
            setModalOpen(false);
        } catch (e) {
            setError(modalMode === "add"
                ? "Failed to add employee: " + (e?.message || e)
                : "Failed to update employee: " + (e?.message || e)
            );
            console.error(e);
        }

        setSaving(false);
    }

    async function handleDelete(employeeId) {
        if (!window.confirm("Delete this employee? This will also remove their team assignment.")) return;

        setSaving(true);
        setError(null);
        setSuccessMsg("");

        try {
            await deleteEmployee(employeeId);
            setSuccessMsg("Employee deleted successfully!");
            await loadAllData(); // Refresh all data
        } catch (e) {
            setError("Failed to delete employee: " + (e?.message || e));
            console.error(e);
        }
        setSaving(false);
    }

    // Render form field
    function renderInputField(k, val, onChange) {
        // Required when adding (modalMode === 'add'); when editing, only required for fields you want to enforce
        const requiredWhenAdd = modalMode === "add" && k !== "team";

        if (k === "activeFlag") {
            return (
                <select
                    name="activeFlag"
                    value={val === true ? "true" : "false"}
                    onChange={onChange}
                    className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                </select>
            );
        }

        if (k === "team") {
            return (
                <select
                    name="team"
                    value={val || ""}
                    onChange={onChange}
                    className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="">Select a team</option>
                    {teams.map(team => {
                        const teamId = team.TeamID || team.id;
                        const teamType = team.TeamType || team.teamType || team.team_type;
                        return (
                            <option key={teamId} value={teamId}>
                                {teamType}
                            </option>
                        );
                    })}
                </select>
            );
        }

        if (k === "email") {
            return (
                <div className="relative">
                    <input
                        ref={setEmailInputRef}
                        name={k}
                        type="email"
                        value={val ?? ""}
                        onChange={onChange}
                        onKeyDown={handleEmailKeyDown}
                        onFocus={handleEmailFocus}
                        onBlur={handleEmailBlur}
                        className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="email@example.com"
                        required={requiredWhenAdd}
                    />
                    {showEmailSuggestion && suggestedEmail && modalMode === "add" && (
                        <div className="absolute top-full left-0 right-0 bg-blue-50 border border-blue-200 rounded-md mt-1 p-2 text-sm text-blue-700 z-10">
                            <div className="flex items-center justify-between">
                                <span>Suggested: <strong>{suggestedEmail}</strong></span>
                                <span className="text-xs text-blue-500">Press Tab to accept</span>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        if (k === "contactNumber") {
            return (
                <input
                    name={k}
                    value={val ?? ""}
                    onChange={onChange}
                    className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="01XXXXXXXX"
                    pattern="01[0-9]{8,9}"
                    title={FIELD_GUIDANCE[k]}
                    required={requiredWhenAdd}
                />
            );
        }

        if (k === "name") {
            return (
                <input
                    name={k}
                    value={val ?? ""}
                    onChange={onChange}
                    className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Lee Tian"
                    title={FIELD_GUIDANCE[k]}
                    required={requiredWhenAdd}
                />
            );
        }

        if (k === "role") {
            return (
                <select
                    name={k}
                    value={val ?? ""}
                    onChange={onChange}
                    className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required={requiredWhenAdd}
                >
                    <option value="">Select a role</option>
                    {rolesList.map(role => (
                        <option key={role.id} value={role.id}>
                            {role.name || role.id}
                        </option>
                    ))}
                </select>
            );
        }

        if (k === "password") {
            return (
                <div className="relative">
                    <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={val ?? ""}
                        onChange={onChange}
                        className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                        placeholder="Enter password"
                        required={modalMode === "add"} // required only when adding
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        tabIndex={-1}
                    >
                        {showPassword ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 4.5c-3.21 0-6 3-6 5.5s2.79 5.5 6 5.5 6-3 6-5.5-2.79-5.5-6-5.5zM10 14a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" />
                                <path d="M10 7a3 3 0 100 6 3 3 0 000-6z" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2.458 12C3.732 14.732 6.533 17 10 17c3.468 0 6.268-2.268 7.542-5-1.274-2.732-4.074-5-7.542-5-3.467 0-6.268 2.268-7.542 5zM10 13a3 3 0 100-6 3 3 0 000 6z" />
                                <path d="M10 9a1 1 0 110 2 1 1 0 010-2z" />
                            </svg>
                        )}
                    </button>
                </div>
            );
        }



        return (
            <input
                name={k}
                value={val ?? ""}
                onChange={onChange}
                className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required={requiredWhenAdd}
            />
        );
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-800">
                    {activeTab === "employees" ? "Employee Management" : "Pending Approvals"}
                </h2>
                {activeTab === "employees" && (
                    <button
                        onClick={openAddModal}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200 text-sm font-medium"
                    >
                        + Add Employee
                    </button>
                )}
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

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                #
                            </th>
                            {TABLE_KEYS.map(k => (
                                <th key={k} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    {FIELD_LABELS[k] || k}
                                </th>
                            ))}
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan={TABLE_KEYS.length + 2} className="text-center py-8">
                                    <div className="flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                        <span className="ml-2 text-gray-500">Loading employees...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : enrichedEmployees.length === 0 ? (
                            <tr>
                                <td colSpan={TABLE_KEYS.length + 2} className="text-center py-8 text-gray-500">
                                    No employees found.
                                </td>
                            </tr>
                        ) : (
                            enrichedEmployees.map((emp, idx) => (
                                <tr key={emp.EmployeeID} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                        {idx + 1}
                                    </td>
                                    {TABLE_KEYS.map(k => (
                                        <td className="px-4 py-3 text-sm text-gray-900" key={k}>
                                            {k === "activeFlag" ? (
                                                <ActiveFlagBadge value={emp[k]} />
                                            ) : k === "team" ? (
                                                <TeamBadge teamType={emp[k]} />
                                            ) : k === "password" ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono">
                                                        {visiblePasswords.has(emp.EmployeeID) ? emp[k] : "••••••••"}
                                                    </span>
                                                    <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newSet = new Set(visiblePasswords);
                                                        if (newSet.has(emp.EmployeeID)) newSet.delete(emp.EmployeeID);
                                                        else newSet.add(emp.EmployeeID);
                                                        setVisiblePasswords(newSet);
                                                    }}
                                                    className="text-gray-500 hover:text-gray-700"
                                                    title={visiblePasswords.has(emp.EmployeeID) ? "Hide password" : "Show password"}
                                                    >
                                                    {visiblePasswords.has(emp.EmployeeID) ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path d="M10 4.5c-3.21 0-6 3-6 5.5s2.79 5.5 6 5.5 6-3 6-5.5-2.79-5.5-6-5.5zM10 14a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" />
                                                        <path d="M10 7a3 3 0 100 6 3 3 0 000-6z" />
                                                        </svg>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                            <path d="M10 4.5c-3.21 0-6 3-6 5.5s2.79 5.5 6 5.5 6-3 6-5.5-2.79-5.5-6-5.5zM10 14a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" />
                                                            <path d="M10 7a3 3 0 100 6 3 3 0 000-6z" />
                                                        </svg>
                                                    )}
                                                    </button>
                                                </div>
                                            ) : k === "role" ? (
                                                <span>{emp.roleName || emp.role || "—"}</span>
                                            ) : (
                                                <span>{emp[k] ?? "—"}</span>
                                            )}
                                        </td>
                                    ))}
                                    <td className="px-4 py-3 text-sm">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => openEditModal(idx)}
                                                className="px-3 py-1 rounded-md text-blue-600 hover:bg-blue-50 transition-colors duration-200"
                                                title="Edit Employee"
                                                disabled={saving}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDelete(emp.EmployeeID)}
                                                className="px-3 py-1 rounded-md text-red-600 hover:bg-red-50 transition-colors duration-200"
                                                title="Delete Employee"
                                                disabled={saving}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Employee Modal */}
            <Modal show={modalOpen} onClose={() => setModalOpen(false)}>
                <h3 className="text-xl font-semibold mb-6 text-gray-800">
                    {modalMode === "add" ? "Add New Employee" : "Edit Employee"}
                </h3>
                <div className="space-y-4">
                    {TABLE_KEYS.map(k => (
                        <div key={k}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {FIELD_LABELS[k] || k}
                                {k !== "team" && <span className="text-red-500">*</span>}
                            </label>
                            {renderInputField(k, modalData[k], handleModalChange)}
                            {FIELD_GUIDANCE[k] && (
                                <p className="text-xs text-gray-500 mt-1">{FIELD_GUIDANCE[k]}</p>
                            )}
                        </div>
                    ))}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={handleModalSubmit}
                            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
                            disabled={saving}
                        >
                            {saving
                                ? (modalMode === "add" ? "Adding..." : "Saving...")
                                : (modalMode === "add" ? "Add Employee" : "Save Changes")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setModalOpen(false)}
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