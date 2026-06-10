import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText, MessageSquare, X } from 'lucide-react';
import {
    getAllCases,
    getAllEmployees,
    updateCases
} from '../../services/informationService';

function normalizeCase(c) {
    return {
        id: c.id ?? c.case_id ?? c.CasesID ?? c.CasesId,
        EmployeeID: c.employee_id ?? c.EmployeeID ?? c.employeeId ?? null,
        Content: c.content ?? c.Content ?? '',
        Status: (c.status ?? c.Status ?? '').toString().toLowerCase() || 'pending',
        DateCasesed: c.created_at ?? null
    };
}

function formatDate(value) {
    if (!value) return '';
    const d = (value instanceof Date) ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-MY', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

function StatusBadge({ status }) {
    if ((status || '').toLowerCase() === 'resolved') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle size={11} /> Resolved
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            <Clock size={11} /> Pending
        </span>
    );
}

function EmployeeAvatar({ name }) {
    return (
        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {(name || '?')[0].toUpperCase()}
        </div>
    );
}

export default function Cases() {
    const [cases, setCases] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [selectedCase, setSelectedCase] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const ac = new AbortController();
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [rawCases, rawEmployees] = await Promise.all([
                    getAllCases(),
                    getAllEmployees()
                ]);
                const normalizedCases = (Array.isArray(rawCases) ? rawCases : (rawCases?.data ?? [])).map(normalizeCase);
                const normalizedEmployees = (Array.isArray(rawEmployees) ? rawEmployees : (rawEmployees?.data ?? [])).map(emp => ({
                    id: emp.id ?? emp.employee_id ?? emp.EmployeeID,
                    name: emp.name ?? emp.displayName ?? emp.display_name ?? `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim()
                }));
                if (!ac.signal.aborted) {
                    setCases(normalizedCases);
                    setEmployees(normalizedEmployees);
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    setError('Failed to load data. ' + (err.message || ''));
                }
            } finally {
                if (!ac.signal.aborted) setLoading(false);
            }
        };
        load();
        return () => ac.abort();
    }, []);

    const employeeMap = new Map(employees.map(e => [String(e.id ?? ''), e]));

    const getEmployeeName = (employeeId) => {
        if (!employeeId) return 'Unassigned';
        return employeeMap.get(String(employeeId))?.name ?? 'Unknown';
    };

    const updateCaseStatus = async (caseId, newStatus) => {
        if (!caseId) return;
        setSaving(true);
        setError(null);
        try {
            await updateCases(caseId, { status: newStatus });
            setCases(prev => prev.map(c => (c.id === caseId ? { ...c, Status: newStatus } : c)));
            if (selectedCase?.id === caseId) setSelectedCase(prev => ({ ...prev, Status: newStatus }));
        } catch (err) {
            setError('Failed to update status. ' + (err.message || ''));
        } finally {
            setSaving(false);
        }
    };

    const filteredCases = cases.filter(c =>
        filter === 'all' ? true : (c.Status || '').toLowerCase() === filter
    );

    const pending  = cases.filter(c => (c.Status || '').toLowerCase() === 'pending').length;
    const resolved = cases.filter(c => (c.Status || '').toLowerCase() === 'resolved').length;

    if (loading) {
        return (
            <div className="bg-gray-50 min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="w-full px-4 sm:px-6 py-4 space-y-4">
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
                )}

                {/* Stat cards */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                        <div className="p-2 bg-orange-100 rounded-lg"><AlertTriangle className="w-5 h-5 text-orange-600" /></div>
                        <div>
                            <p className="text-xs text-gray-500">Pending</p>
                            <p className="text-xl font-bold text-gray-900">{pending}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600" /></div>
                        <div>
                            <p className="text-xs text-gray-500">Resolved</p>
                            <p className="text-xl font-bold text-gray-900">{resolved}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg"><FileText className="w-5 h-5 text-blue-600" /></div>
                        <div>
                            <p className="text-xs text-gray-500">Total</p>
                            <p className="text-xl font-bold text-gray-900">{cases.length}</p>
                        </div>
                    </div>
                </div>

                {/* Filter pills */}
                <div className="flex items-center gap-2">
                    {[
                        { key: 'all',      label: 'All' },
                        { key: 'pending',  label: 'Pending' },
                        { key: 'resolved', label: 'Resolved' },
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                filter === f.key
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Table */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue Content</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredCases.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-10 text-gray-400">
                                            <FileText className="w-7 h-7 mx-auto mb-2 opacity-40" />
                                            No cases found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredCases.map(c => {
                                        const name = getEmployeeName(c.EmployeeID);
                                        return (
                                            <tr
                                                key={c.id}
                                                className="hover:bg-gray-50 cursor-pointer"
                                                onClick={() => setSelectedCase(c)}
                                            >
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <EmployeeAvatar name={name} />
                                                        <span className="text-sm font-medium text-gray-900">{name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 max-w-xs">
                                                    <p className="text-sm text-gray-700 truncate">{c.Content || '—'}</p>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <StatusBadge status={c.Status} />
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                                                    {formatDate(c.DateCasesed)}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right">
                                                    {(c.Status || '').toLowerCase() === 'pending' && (
                                                        <button
                                                            onClick={e => { e.stopPropagation(); updateCaseStatus(c.id, 'resolved'); }}
                                                            className="text-xs text-green-600 hover:text-green-800 font-medium"
                                                            disabled={saving}
                                                        >
                                                            Resolve
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Detail modal */}
            {selectedCase && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-16 mb-10">
                        <div className={`px-6 py-4 rounded-t-2xl flex items-center justify-between border-b ${
                            (selectedCase.Status || '').toLowerCase() === 'resolved'
                                ? 'bg-green-50 border-green-200'
                                : 'bg-orange-50 border-orange-200'
                        }`}>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <MessageSquare size={16} className="text-gray-600" />
                                    <h3 className="text-base font-bold text-gray-900">Case Details</h3>
                                    <StatusBadge status={selectedCase.Status} />
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">{formatDate(selectedCase.DateCasesed)}</p>
                            </div>
                            <button onClick={() => setSelectedCase(null)} className="p-1 rounded-lg hover:bg-gray-200">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <p className="text-xs text-gray-500 mb-1.5">Reported by</p>
                                <div className="flex items-center gap-2">
                                    <EmployeeAvatar name={getEmployeeName(selectedCase.EmployeeID)} />
                                    <span className="text-sm font-medium text-gray-900">{getEmployeeName(selectedCase.EmployeeID)}</span>
                                </div>
                            </div>

                            <div>
                                <p className="text-xs text-gray-500 mb-1.5">Issue Description</p>
                                <div className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 border border-gray-100 whitespace-pre-wrap leading-relaxed">
                                    {selectedCase.Content || '—'}
                                </div>
                            </div>

                            {(selectedCase.Status || '').toLowerCase() === 'pending' && (
                                <div className="flex justify-end pt-2 border-t border-gray-100">
                                    <button
                                        onClick={() => { updateCaseStatus(selectedCase.id, 'resolved'); setSelectedCase(null); }}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                                        disabled={saving}
                                    >
                                        <CheckCircle size={16} />
                                        {saving ? 'Resolving…' : 'Mark Resolved'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
