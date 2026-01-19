import React, { useEffect, useState } from "react";
import {
    getAllEmployees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    getEmployeeDeletability,
    getAllTeams,
    getAllEmployeeTeamAssignments,
    assignOrUpdateEmployeeTeam,
    getRoles,
    getInstallerByEmployeeId,
    addInstaller,
    updateInstaller
} from "../../../services/informationService";
import { StatusBadge, TeamBadge } from "../../common/Badge";
import Modal from "../../common/Modal";

const TABLE_KEYS = ["name", "email", "contact_number", "roleName", "team", "active_flag"];
const FORM_KEYS = ["name", "email", "contact_number", "role", "team", "active_flag", "password"];

const FIELD_LABELS = {
    name: "Full Name",
    email: "Email Address",
    role: "Role",
    roleName: "Role",
    team: "Team",
    contact_number: "Contact Number",
    active_flag: "Status",
    password: "Password",
    company_name: "Company Name",
    product_category: "Product Category",
    collection_point: "Collection Point"
};

const FIELD_GUIDANCE = {
    name: "Enter the employee's full name.",
    email: "A valid email address where the employee can be reached.",
    contact_number: "Malaysian phone number format (e.g., 0123456789).",
    role: "Select the employee's role.",
    password: "Password must be at least 6 characters. Leave blank on edit to keep it unchanged.",
    company_name: "The name of the installer's company.",
    product_category: "The product category the installer is specialized in.",
    collection_point: "The collection point for the installer."
};

/**
 * Generates email suggestions based on a name and checks for duplicates.
 */
function generateEmailSuggestions(name, existingEmails) {
    if (!name) return [];

    const nameParts = name.toLowerCase().split(' ').filter(Boolean);
    if (nameParts.length === 0) return [];

    const [firstName, ...lastNames] = nameParts;
    const lastName = lastNames.join('');

    const suggestions = [];
    if (lastName) {
        suggestions.push(`${firstName.charAt(0)}${lastName}@example.com`);
    }
    if (lastName) {
        suggestions.push(`${firstName}.${lastName}@example.com`);
    }
    suggestions.push(`${firstName}@example.com`);

    const uniqueSuggestions = suggestions.filter(email => !existingEmails.includes(email));

    if (uniqueSuggestions.length === 0 && suggestions.length > 0) {
        let counter = 1;
        let newSuggestion;
        do {
            newSuggestion = suggestions[0].replace('@', `${counter}@`);
            counter++;
        } while (existingEmails.includes(newSuggestion));
        return [newSuggestion];
    }

    return uniqueSuggestions;
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
    const [selectedRoleName, setSelectedRoleName] = useState("");


    // Email suggestion states
    const [suggestedEmail, setSuggestedEmail] = useState("");
    const [showEmailSuggestion, setShowEmailSuggestion] = useState(false);
    const [emailInputRef, setEmailInputRef] = useState(null);

    const validate = (data, mode, employees) => {
        const errors = {};
        const requiredFields = {
            name: 'Name',
            role: 'Role',
            email: 'Email',
            contact_number: 'Contact Number'
        };

        if (mode === "add") {
            requiredFields.password = 'Password';
        }

        for (const [field, label] of Object.entries(requiredFields)) {
            if (!data[field] || data[field].toString().trim() === '') {
                errors[field] = `${label} is required`;
            }
        }

        if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.email = 'Please enter a valid email address';
        }

        const currentEmployeeId = mode === "edit" ? (data.EmployeeID || data.id) : null;
        if (data.email && employees.some(emp => emp.email && emp.email.toLowerCase() === data.email.toLowerCase() && emp.id !== currentEmployeeId)) {
            errors.email = 'This email address is already in use';
        }

        if (data.contact_number && !/^01[0-9]{8,9}$/.test(data.contact_number)) {
            errors.contact_number = 'Contact number must be in format 01XXXXXXXX (10-11 digits)';
        }

        if (data.password && data.password.length < 6) {
            if (mode === "add" || (mode === "edit" && data.password)) {
                errors.password = 'Password must be at least 6 characters long';
            }
        }

        return errors;
    };

    const [formErrors, setFormErrors] = useState({});

    useEffect(() => {
        loadAllData();
    }, []);

    async function loadAllData() {
        setLoading(true);
        try {
            const [employeesData, teamsData, assignmentsData, rolesData] = await Promise.all([
                getAllEmployees(),
                getAllTeams(),
                getAllEmployeeTeamAssignments(),
                getRoles()
            ]);

            const roleMap = new Map();
            (rolesData || []).forEach(r => {
                roleMap.set(r.id, r.name || r.id);
            });
            setRolesList(rolesData || []);

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
                let roleId, roleName;
                if (typeof emp.role === 'object' && emp.role !== null) {
                    roleId = emp.role.id;
                    roleName = emp.role.name;
                } else {
                    roleId = emp.roleId || emp.role_id;
                    roleName = roleMap.get(roleId) || '';
                }

                return {
                    EmployeeID: empId,
                    name: emp.name,
                    email: emp.email,
                    contact_number: emp.contact_number,
                    active_flag: emp.active_flag,
                    role: roleId,
                    team: empTeamMap.get(empId)?.TeamType || null,
                    teamId: empTeamMap.get(empId)?.TeamID || null,
                    roleName: roleName
                };
            });

            enriched.sort((a, b) => a.name.localeCompare(b.name));

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
            contact_number: "",
            team: "",
            active_flag: true,
            password: "",
            company_name: "",
            product_category: "",
            collection_point: ""
        });
        const role = rolesList.find(r => r.id === (rolesList[0]?.id || ""));
        setSelectedRoleName(role ? role.name : "");
        setModalOpen(true);
        setSuccessMsg("");
        setError(null);
        setFormErrors({});
        setSuggestedEmail("");
        setShowEmailSuggestion(false);
    }


    async function openEditModal(idx) {
        setModalMode("edit");
        setEditIdx(idx);
        const employee = enrichedEmployees[idx];
        const role = rolesList.find(r => r.id === employee.role);
        setSelectedRoleName(role ? role.name : "");

        let installerData = {};
        /* if (role && role.name.toLowerCase() === "installer") {
            try {
                const installer = await getInstallerByEmployeeId(employee.EmployeeID);
                if (installer) {
                     installerData = {
                        company_name: installer.company_name,
                        product_category: installer.product_category,
                        collection_point: installer.collection_point
                    };
                }
            } catch (error) {
                console.error("Failed to fetch installer data", error);
            }
        } */

        setModalData({
            ...employee,
            ...installerData,
            team: employee.teamId || "",
            password: "",
            role: employee.role || "" 
        });
        setModalOpen(true);
        setSuccessMsg("");
        setError(null);
        setFormErrors({});
        setSuggestedEmail("");
        setShowEmailSuggestion(false);
    }


    function handleModalChange(e) {
        const { name, value } = e.target;
        let val = value;

        if (name === "active_flag") {
            val = value === "true";
        }

        setModalData(prev => {
            const newData = { ...prev, [name]: val };
            const errors = validate(newData, modalMode, employees);
            setFormErrors(errors);
            return newData;
        });

        if (name === "role") {
            const role = rolesList.find(r => r.id === val);
            setSelectedRoleName(role ? role.name : "");
        }

        if (name === "name" && modalMode === "add") {
            const existingEmails = employees.map(emp => emp.email).filter(Boolean);
            const suggestions = generateEmailSuggestions(val, existingEmails);

            if (suggestions.length > 0) {
                setSuggestedEmail(suggestions[0]);
                setShowEmailSuggestion(val.trim().length > 0 && !modalData.email);
            } else {
                setSuggestedEmail('');
                setShowEmailSuggestion(false);
            }
        }
    }

    function handleEmailKeyDown(e) {
        if (e.key === "Tab" && showEmailSuggestion && suggestedEmail) {
            e.preventDefault();
            setModalData(prev => ({ ...prev, email: suggestedEmail }));
            setShowEmailSuggestion(false);
        }
    }

    function handleEmailFocus() {
        if (modalMode === "add" && modalData.name && !modalData.email) {
            setShowEmailSuggestion(true);
        }
    }

    function handleEmailBlur() {
        setTimeout(() => setShowEmailSuggestion(false), 150);
    }

    async function handleModalSubmit() {
        const errors = validate(modalData, modalMode, employees);
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            setError("Please fill in all required fields correctly.");
            return;
        }

        setSaving(true);
        setError(null);
        setSuccessMsg("");
        try {
            const employeeData = {
                name: modalData.name,
                role_id: modalData.role,
                email: modalData.email,
                contact_number: modalData.contact_number,
                active_flag: modalData.active_flag
            };

            const role = rolesList.find(r => r.id === modalData.role);
            const isInstaller = role && role.name.toLowerCase() === "installer";

            if (modalMode === "add") {
                employeeData.password = modalData.password;
                const newEmp = await addEmployee(employeeData);
                const newEmpId = newEmp.id;
                if (modalData.team) {
                    await assignOrUpdateEmployeeTeam(newEmpId, modalData.team);
                }
                /* if (isInstaller) {
                    const installerData = {
                        employee_id: newEmpId,
                        company_name: modalData.company_name,
                        product_category: modalData.product_category,
                        collection_point: modalData.collection_point
                    };
                    await addInstaller(installerData);
                } */

                setSuccessMsg("Employee added successfully!");
            } else {
                if (modalData.password && modalData.password.trim() !== '') {
                    employeeData.password = modalData.password;
                }
                const empId = modalData.EmployeeID || modalData.id;

                await updateEmployee(empId, employeeData);

                /* if (isInstaller) {
                    let installer = null;
                    try {
                        installer = await getInstallerByEmployeeId(empId);
                    } catch (error) {
                        if (error.status !== 404) {
                            // re-throw if it's not a 'Not Found' error
                            throw error;
                        }
                        // If it's a 404, we just proceed with installer = null
                    }

                    const installerData = {
                        company_name: modalData.company_name,
                        product_category: modalData.product_category,
                        collection_point: modalData.collection_point
                    };
                    if (installer) {
                        await updateInstaller(installer.id, installerData);
                    } else {
                        installerData.employee_id = empId;
                        await addInstaller(installerData);
                    }
                } */

                const oldTeam = modalData.teamId ?? null;
                const newTeam = modalData.team ?? null;

                if (oldTeam !== newTeam) {
                    await assignOrUpdateEmployeeTeam(empId, newTeam);
                }

                setSuccessMsg("Employee updated successfully!");
            }

            await loadAllData();
            setModalOpen(false);
        } catch (e) {
            const errorMsg = e?.message || String(e);

            if (errorMsg.includes('email') && errorMsg.includes('unique')) {
                setError("This email address is already in use. Please use a different email.");
            } else if (errorMsg.includes('Failed to create assignment')) {
                setError("Employee created but team assignment failed. You can assign a team later from the Team Info page.");
                await loadAllData();
                setModalOpen(false);
            } else {
                setError(modalMode === "add"
                    ? "Failed to add employee: " + errorMsg
                    : "Failed to update employee: " + errorMsg
                );
            }
            console.error(e);
        }

        setSaving(false);
    }

    async function handleDelete(employeeId) {
        setSaving(true);
        setError(null);
        setSuccessMsg("");

        try {
            const { status, message } = await getEmployeeDeletability(employeeId);

            if (status === 'BLOCKED') {
                setError(message);
                setSaving(false);
                return;
            }

            // status is 'CAN_DEACTIVATE'
            if (window.confirm(message)) {
                const result = await deleteEmployee(employeeId);
                setSuccessMsg(result.message || "Employee deactivated successfully!");
                await loadAllData();
            } else {
                // User cancelled the confirmation
                setSaving(false);
            }
        } catch (e) {
            setError("An unexpected error occurred during deactivation: " + (e?.message || e));
            setSaving(false); // Ensure saving is reset on error
        }
    }

    function renderInputField(k, val, onChange, formErrors) {
        const requiredWhenAdd = modalMode === "add" && k !== "team";

        if (k === "active_flag") {
            return (
                <select
                    name="active_flag"
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
                    {teams
                        .filter(team => team.available_flag !== false)
                        .map(team => {
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

        if (k === "contact_number") {
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
                        required={modalMode === "add"}
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
                                            {k === "active_flag" ? (
                                                <StatusBadge isActive={emp[k]} />
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
                                            ) : k === "roleName" ? (
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
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                        {error}
                    </div>
                )}
                <div className="space-y-4">
                    {FORM_KEYS.map(k => {
                        // Skip password field initially - we'll show it separately at the very bottom
                        if (k === "password") {
                            return null;
                        }

                        const field = (
                            <div key={k}>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {FIELD_LABELS[k] || k}
                                    {k !== "team" && <span className="text-red-500">*</span>}
                                </label>
                                {renderInputField(k, modalData[k], handleModalChange, formErrors)}
                                {formErrors[k] && <p className="text-xs text-red-500 mt-1">{formErrors[k]}</p>}
                                {FIELD_GUIDANCE[k] && (
                                    <p className="text-xs text-gray-500 mt-1">{FIELD_GUIDANCE[k]}</p>
                                )}
                            </div>
                        );

                        // If this is the "role" field AND role is Installer, append the extra fields immediately
                        if (k === "role" && selectedRoleName.toLowerCase() === "installer") {
                            return (
                                <React.Fragment key={k}>
                                    {field}
                                    {/* <div className="bg-blue-50 p-4 rounded-md border border-blue-100 space-y-4">
                                        <p className="text-sm font-semibold text-blue-800 border-b border-blue-200 pb-2">
                                            Installer Details
                                        </p>
                                        <div key="company_name">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {FIELD_LABELS["company_name"]}
                                            </label>
                                            {renderInputField("company_name", modalData["company_name"], handleModalChange)}
                                            {FIELD_GUIDANCE["company_name"] && (
                                                <p className="text-xs text-gray-500 mt-1">{FIELD_GUIDANCE["company_name"]}</p>
                                            )}
                                        </div>
                                        <div key="product_category">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {FIELD_LABELS["product_category"]}
                                            </label>
                                            {renderInputField("product_category", modalData["product_category"], handleModalChange)}
                                            {FIELD_GUIDANCE["product_category"] && (
                                                <p className="text-xs text-gray-500 mt-1">{FIELD_GUIDANCE["product_category"]}</p>
                                            )}
                                        </div>
                                        <div key="collection_point">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {FIELD_LABELS["collection_point"]}
                                            </label>
                                            {renderInputField("collection_point", modalData["collection_point"], handleModalChange)}
                                            {FIELD_GUIDANCE["collection_point"] && (
                                                <p className="text-xs text-gray-500 mt-1">{FIELD_GUIDANCE["collection_point"]}</p>
                                            )}
                                        </div>
                                    </div> */}
                                </React.Fragment>
                            );
                        }

                        return field;
                    })}

                    {/* Password field - required for add, optional for edit */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {FIELD_LABELS["password"]}
                            {modalMode === "add" && <span className="text-red-500">*</span>}
                            {modalMode === "edit" && <span className="text-xs text-gray-500 ml-2">(leave blank to keep current password)</span>}
                        </label>
                        {renderInputField("password", modalData["password"], handleModalChange, formErrors)}
                        {formErrors.password && <p className="text-xs text-red-500 mt-1">{formErrors.password}</p>}
                        {FIELD_GUIDANCE["password"] && (
                            <p className="text-xs text-gray-500 mt-1">{FIELD_GUIDANCE["password"]}</p>
                        )}
                    </div>
                    
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={handleModalSubmit}
                            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
                            disabled={saving || Object.keys(formErrors).length > 0}
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
