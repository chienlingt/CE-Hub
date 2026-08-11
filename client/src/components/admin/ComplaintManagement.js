import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText, User, X, Package } from 'lucide-react';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return String(dateString);
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

const ComplaintManagement = () => {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [saving, setSaving] = useState(false);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        fetchComplaints();
    }, []);

    const fetchComplaints = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/complaints`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            setComplaints(data);
        } catch (err) {
            setError('Failed to load complaints.');
        } finally {
            setLoading(false);
        }
    };

    const handleResolveComplaint = async (complaintId) => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/complaints/${complaintId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'resolved' }),
            });
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            setComplaints(prev => prev.map(c =>
                c.complaint_id === complaintId ? { ...c, status: 'resolved' } : c
            ));
            if (selectedComplaint?.complaint_id === complaintId) {
                setSelectedComplaint(prev => ({ ...prev, status: 'resolved' }));
            }
        } catch (err) {
            setError('Failed to resolve complaint.');
        } finally {
            setSaving(false);
        }
    };

    const filteredComplaints = complaints.filter(c =>
        filter === 'all' ? true : (c.status || '').toLowerCase() === filter
    );

    const pending  = complaints.filter(c => (c.status || '').toLowerCase() === 'pending').length;
    const resolved = complaints.filter(c => (c.status || '').toLowerCase() === 'resolved').length;

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
                            <p className="text-xl font-bold text-gray-900">{complaints.length}</p>
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
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredComplaints.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-10 text-gray-400">
                                            <FileText className="w-7 h-7 mx-auto mb-2 opacity-40" />
                                            No complaints found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredComplaints.map(c => (
                                        <tr
                                            key={c.complaint_id}
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() => setSelectedComplaint(c)}
                                        >
                                            <td className="px-4 py-3 whitespace-nowrap text-xs font-mono font-semibold text-gray-700">
                                                #{c.complaint_id.substring(0, 8).toUpperCase()}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    <User size={13} className="text-gray-400" />
                                                    <span className="text-sm font-medium text-gray-900">
                                                        {c.customers?.full_name || 'Unknown'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{c.reason || '—'}</td>
                                            <td className="px-4 py-3 max-w-xs">
                                                <p className="text-sm text-gray-500 truncate">{c.content || '—'}</p>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <StatusBadge status={c.status} />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                                                {formatDate(c.date_reported)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right">
                                                {(c.status || '').toLowerCase() === 'pending' && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); handleResolveComplaint(c.complaint_id); }}
                                                        className="text-xs text-green-600 hover:text-green-800 font-medium"
                                                        disabled={saving}
                                                    >
                                                        Resolve
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Detail modal */}
            {selectedComplaint && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-16 mb-10">
                        <div className={`px-6 py-4 rounded-t-2xl flex items-center justify-between border-b ${
                            (selectedComplaint.status || '').toLowerCase() === 'resolved'
                                ? 'bg-green-50 border-green-200'
                                : 'bg-orange-50 border-orange-200'
                        }`}>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <AlertTriangle size={16} className="text-gray-600" />
                                    <h3 className="text-base font-bold text-gray-900">
                                        Complaint #{selectedComplaint.complaint_id.substring(0, 8).toUpperCase()}
                                    </h3>
                                    <StatusBadge status={selectedComplaint.status} />
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">{formatDate(selectedComplaint.date_reported)}</p>
                            </div>
                            <button onClick={() => setSelectedComplaint(null)} className="p-1 rounded-lg hover:bg-gray-200">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Customer</p>
                                    <div className="flex items-center gap-1.5">
                                        <User size={13} className="text-gray-400" />
                                        <p className="font-medium text-gray-900">{selectedComplaint.customers?.full_name || 'N/A'}</p>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Reason</p>
                                    <p className="font-medium text-gray-900">{selectedComplaint.reason || '—'}</p>
                                </div>
                                {selectedComplaint.product_name && (
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Product</p>
                                        <div className="flex items-center gap-1.5">
                                            <Package size={13} className="text-gray-400" />
                                            <p className="font-medium text-gray-900">{selectedComplaint.product_name}</p>
                                        </div>
                                    </div>
                                )}
                                {selectedComplaint.orders?.id && (
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Order Ref</p>
                                        <p className="text-xs font-mono font-semibold text-gray-700">
                                            #{selectedComplaint.orders.odoo_order_ref || 'Not Synced'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {selectedComplaint.content && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1.5">Description</p>
                                    <div className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 border border-gray-100 whitespace-pre-wrap leading-relaxed">
                                        {selectedComplaint.content}
                                    </div>
                                </div>
                            )}

                            {(selectedComplaint.status || '').toLowerCase() === 'pending' && (
                                <div className="flex justify-end pt-2 border-t border-gray-100">
                                    <button
                                        onClick={() => { handleResolveComplaint(selectedComplaint.complaint_id); setSelectedComplaint(null); }}
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
};

export default ComplaintManagement;
