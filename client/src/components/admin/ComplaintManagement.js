import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Clock, User, FileText, Calendar } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_BASE_URL || '';

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
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const data = await res.json();
            setComplaints(data);
        } catch (err) {
            console.error("Failed to fetch complaints:", err);
            setError("Failed to load complaints.");
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
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: 'resolved' }),
            });

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            fetchComplaints(); // Refresh the list
            if (selectedComplaint && selectedComplaint.complaint_id === complaintId) {
                setSelectedComplaint(prev => ({ ...prev, status: 'resolved' }));
            }
        } catch (err) {
            console.error("Failed to resolve complaint:", err);
            setError("Failed to resolve complaint.");
        } finally {
            setSaving(false);
        }
    };

    const getStatusIcon = (status) => {
        switch ((status || '').toLowerCase()) {
            case 'resolved': return <CheckCircle className="w-4 h-4 text-green-600" />;
            case 'pending': return <Clock className="w-4 h-4 text-yellow-600" />;
            default: return <AlertTriangle className="w-4 h-4 text-red-600" />;
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const d = new Date(dateString);
        if (Number.isNaN(d.getTime())) return String(dateString);
        return d.toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
    };

    // Apply filter
    const filteredComplaints = complaints.filter(c => {
        if (filter === 'all') return true;
        return (c.status || '').toLowerCase() === filter;
    });

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
                    <p className="mt-4 text-gray-600">Loading complaints...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-50">
            <div className="w-full px-4 sm:px-2 lg:px-2 py-2">
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                        {error}
                    </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-3">
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">Pending Complaints</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {complaints.filter(c => (c.status || '').toLowerCase() === 'pending').length}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">Resolved Complaints</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {complaints.filter(c => (c.status || '').toLowerCase() === 'resolved').length}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <FileText className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">Total</p>
                                <p className="text-2xl font-bold text-gray-900">{complaints.length}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-lg shadow mb-6">
                    <div className="border-b border-gray-200">
                        <nav className="flex space-x-8 px-6">
                            {[
                                { key: 'all', label: 'All Complaints' },
                                { key: 'pending', label: 'Pending' },
                                { key: 'resolved', label: 'Resolved' }
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setFilter(tab.key)}
                                    className={`py-4 px-1 border-b-2 font-medium text-sm ${filter === tab.key
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Complaint ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>

                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredComplaints.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-8 text-gray-500">No complaints found.</td>
                                    </tr>
                                ) : (
                                    filteredComplaints.map((c, idx) => (
                                        <tr key={c.complaint_id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {c.complaint_id.substring(0, 8)}...
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <User className="w-4 h-4 text-gray-400 mr-2" />
                                                    <span className="text-sm text-gray-900">{c.customers?.full_name || 'Generic Customer'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 max-w-xs truncate">{c.reason}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    {getStatusIcon(c.status)}
                                                    <span className="ml-2 text-sm text-gray-900 capitalize">{c.status}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <div className="flex items-center">
                                                    <Calendar className="w-4 h-4 mr-1" />
                                                    {formatDate(c.date_reported)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                                <button
                                                    onClick={() => setSelectedComplaint(c)}
                                                    className="text-blue-600 hover:text-blue-900"
                                                >
                                                    View
                                                </button>
                                                {(c.status || '').toLowerCase() === 'pending' && (
                                                    <button
                                                        onClick={() => handleResolveComplaint(c.complaint_id)}
                                                        className="text-green-600 hover:text-green-900"
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

                {filteredComplaints.length === 0 && (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No complaints found for the selected filter.</p>
                    </div>
                )}
            </div>

            {/* Detail modal */}
            {selectedComplaint && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <div className="mt-3">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-gray-900">Complaint Details</h3>
                                <button onClick={() => setSelectedComplaint(null)} className="text-gray-400 hover:text-gray-600">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Complaint ID</label>
                                    <p className="mt-1 text-sm text-gray-900">{selectedComplaint.complaint_id}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Customer</label>
                                    <p className="mt-1 text-sm text-gray-900">{selectedComplaint.customers?.full_name || 'N/A'}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Order ID</label>
                                    <p className="mt-1 text-sm text-gray-900">{selectedComplaint.orders?.id || 'N/A'}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Reason</label>
                                    <p className="mt-1 text-sm text-gray-900">{selectedComplaint.reason}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Product</label>
                                    <p className="mt-1 text-sm text-gray-900">{selectedComplaint.product_name}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Content</label>
                                    <p className="mt-1 text-sm text-gray-900">{selectedComplaint.content}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Status</label>
                                    <div className="flex items-center mt-1">
                                        {getStatusIcon(selectedComplaint.status)}
                                        <span className="ml-2 text-sm text-gray-900 capitalize">{selectedComplaint.status}</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Date Reported</label>
                                    <p className="mt-1 text-sm text-gray-900">{formatDate(selectedComplaint.date_reported)}</p>
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 mt-6">
                                <button onClick={() => setSelectedComplaint(null)} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400">Close</button>
                                {(selectedComplaint.status || '').toLowerCase() === 'pending' && (
                                    <button
                                        onClick={() => {
                                            handleResolveComplaint(selectedComplaint.complaint_id);
                                            setSelectedComplaint(null);
                                        }}
                                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                                        disabled={saving}
                                    >
                                        Resolve
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComplaintManagement;