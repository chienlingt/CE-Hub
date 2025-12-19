import React, { useState, useEffect } from "react";
import Modal from "./Modal";

function InfoTable({
    columns,
    data,
    loading,
    onEdit,
    onDelete,
    saving
}) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                        {columns.map(col => (
                            <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {col.label}
                            </th>
                        ))}
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                        <tr>
                            <td colSpan={columns.length + 2} className="text-center py-8">
                                <div className="flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                    <span className="ml-2 text-gray-500">Loading...</span>
                                </div>
                            </td>
                        </tr>
                    ) : data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length + 2} className="text-center py-8 text-gray-500">
                                No data found.
                            </td>
                        </tr>
                    ) : (
                        data.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{idx + 1}</td>
                                {columns.map(col => (
                                    <td className="px-4 py-3 text-sm text-gray-900" key={col.key}>
                                        {col.render ? col.render(item) : (item[col.key] ?? "-")}
                                    </td>
                                ))}
                                <td className="px-4 py-3 text-sm">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onEdit(idx)}
                                            className="px-3 py-1 rounded-md text-blue-600 hover:bg-blue-50 transition-colors duration-200"
                                            title="Edit"
                                            disabled={saving}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => onDelete(item.id)}
                                            className="px-3 py-1 rounded-md text-red-600 hover:bg-red-50 transition-colors duration-200"
                                            title="Delete"
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
    );
}

function InfoModal({
    show,
    onClose,
    mode,
    title,
    formFields,
    formData,
    onFormChange,
    onFormSubmit,
    saving,
    error
}) {
    return (
        <Modal show={show} onClose={onClose}>
            <h3 className="text-xl font-semibold mb-4">
                {mode === "add" ? `Add New ${title}` : `Edit ${title}`}
            </h3>
            {error && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                    {error}
                </div>
            )}
            <form onSubmit={onFormSubmit} className="space-y-3">
                {formFields.map(field => (
                    <div key={field.key}>
                        <label className="block font-medium mb-1 text-sm">{field.label}</label>
                        {field.type === 'select' ? (
                            <select
                                name={field.key}
                                value={formData[field.key] ?? ''}
                                onChange={onFormChange}
                                className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required={field.required}
                            >
                                <option value="">{field.placeholder || 'Select...'}</option>
                                {field.options.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                name={field.key}
                                type={field.type || 'text'}
                                value={formData[field.key] ?? ''}
                                onChange={onFormChange}
                                className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required={field.required}
                                placeholder={field.placeholder}
                            />
                        )}
                        {field.guidance && <div className="text-xs text-gray-400 mt-1">{field.guidance}</div>}
                    </div>
                ))}
                <div className="flex gap-3 pt-2">
                    <button
                        type="submit"
                        className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
                        disabled={saving}
                    >
                        {saving
                            ? mode === "add" ? "Adding..." : "Saving..."
                            : mode === "add" ? `Add ${title}` : "Save Changes"}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
                        disabled={saving}
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default function InfoPage({
    title,
    getData,
    addData,
    updateData,
    deleteData,
    tableColumns,
    formFields,
    initialState,
    normalizeData = (data) => data,
    toApiFormatData = (data) => data,
}) {
    const [data, setData] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState("add");
    const [modalData, setModalData] = useState(initialState);
    const [editIdx, setEditIdx] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [error, setError] = useState(null);

    useEffect(() => {
        refreshData();
    }, []);

    async function refreshData() {
        setLoading(true);
        setError(null);
        try {
            const result = await getData();
            setData(result.map(normalizeData));
        } catch (e) {
            setError(`Failed to fetch data: ${e.message}`);
        }
        setLoading(false);
    }

    function openAddModal() {
        setModalMode("add");
        setModalData(initialState);
        setModalOpen(true);
        setSuccessMsg("");
        setError(null);
    }

    function openEditModal(idx) {
        setModalMode("edit");
        setEditIdx(idx);
        setModalData({ ...data[idx] });
        setModalOpen(true);
        setSuccessMsg("");
        setError(null);
    }

    function handleModalChange(e) {
        const { name, value, type } = e.target;
        let val = value;
        const field = formFields.find(f => f.key === name);
        if (field?.type === 'number') {
            val = value === "" ? "" : Number(value);
        }
        setModalData(prev => ({ ...prev, [name]: val }));
    }

    async function handleModalSubmit(e) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccessMsg("");
        try {
            const apiData = toApiFormatData(modalData);
            if (modalMode === "add") {
                await addData(apiData);
                setSuccessMsg(`${title} added!`);
            } else {
                await updateData(modalData.id, apiData);
                setSuccessMsg(`${title} updated!`);
            }
            await refreshData();
            setModalOpen(false);
        } catch (e) {
            setError(modalMode === "add" ? `Failed to add ${title}: ${e.message}` : `Failed to update ${title}: ${e.message}`);
        }
        setSaving(false);
    }

    async function handleDelete(id) {
        if (!window.confirm(`Delete this ${title}?`)) return;
        setSaving(true);
        setError(null);
        setSuccessMsg("");
        try {
            await deleteData(id);
            setSuccessMsg(`${title} deleted!`);
            setData(prev => prev.filter(item => item.id !== id));
        } catch (e) {
            setError(`Failed to delete ${title}: ${e.message}`);
        }
        setSaving(false);
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-800">{title} Management</h2>
                <button
                    onClick={openAddModal}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-200 text-sm font-medium"
                >
                    + Add {title}
                </button>
            </div>
            {successMsg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md text-sm">{successMsg}</div>}
            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>}

            <InfoTable
                columns={tableColumns}
                data={data}
                loading={loading}
                onEdit={openEditModal}
                onDelete={handleDelete}
                saving={saving}
            />

            <InfoModal
                show={modalOpen}
                onClose={() => setModalOpen(false)}
                mode={modalMode}
                title={title}
                formFields={formFields}
                formData={modalData}
                onFormChange={handleModalChange}
                onFormSubmit={handleModalSubmit}
                saving={saving}
                error={error}
            />
        </div>
    );
}
