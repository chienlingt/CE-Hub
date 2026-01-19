import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText, Calendar, AlertOctagon } from 'lucide-react';
import {
    getOrdersWithIssues,
    resolveOrderIssue
} from '../../services/informationService';

/**
 * OrderIssues component
 * - Displays orders with reported issues.
 * - Allows admin to view details (Priority, Reason, Description) and mark as resolved.
 */

function normalizeIssue(o) {
    return {
        id: o.id,
        orderId: o.id, // Display ID
        customerName: o.customers?.full_name || 'Unknown',
        priority: o.issue_priority_level || 'Normal',
        reason: o.issue_reason || 'No Reason',
        description: o.issue_desc || '',
        status: (o.issue_status || 'pending').toLowerCase(),
        createdAt: o.created_at,
        issueDate: o.updated_at || o.created_at // Assuming issue reported modifies updated_at or we track it
    };
}

const getStatusIcon = (status) => {
    switch (status) {
        case 'resolved': return <CheckCircle className="w-4 h-4 text-green-600" />;
        case 'pending': return <Clock className="w-4 h-4 text-yellow-600" />;
        default: return <AlertTriangle className="w-4 h-4 text-red-600" />;
    }
};

const getPriorityColor = (priority) => {
    switch ((priority || '').toLowerCase()) {
        case 'high': return 'text-red-600 bg-red-100';
        case 'medium': return 'text-yellow-600 bg-yellow-100';
        default: return 'text-gray-600 bg-gray-100';
    }
};

function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

export default function OrderIssues() {
    const [issues, setIssues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [selectedIssue, setSelectedIssue] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const ac = new AbortController();
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const rawOrders = await getOrdersWithIssues();
                const normalized = (Array.isArray(rawOrders) ? rawOrders : (rawOrders.data || [])).map(normalizeIssue);
                
                if (!ac.signal.aborted) {
                    setIssues(normalized);
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Error loading order issues:', err);
                    setError('Failed to load issues. ' + (err.message || ''));
                }
            } finally {
                if (!ac.signal.aborted) setLoading(false);
            }
        };
        load();
        return () => ac.abort();
    }, []);

    const resolveIssue = async (id) => {
        if (!id) return;
        setSaving(true);
        setError(null);
        try {
            await resolveOrderIssue(id, { issue_status: 'resolved' });
            // Update local state
            setIssues(prev => prev.map(i => (i.id === id ? { ...i, status: 'resolved' } : i)));
            if (selectedIssue && selectedIssue.id === id) {
                setSelectedIssue(prev => ({ ...prev, status: 'resolved' }));
            }
        } catch (err) {
            console.error('Error resolving issue:', err);
            setError('Failed to resolve issue. ' + (err.message || ''));
        } finally {
            setSaving(false);
        }
    };

    // Apply filter
    const filteredIssues = issues.filter(i => {
        if (filter === 'all') return true;
        return (i.status || '').toLowerCase() === filter;
    });

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
                    <p className="mt-4 text-gray-600">Loading issues...</p>
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
                                <AlertOctagon className="w-6 h-6 text-red-600" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">Pending Issues</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {issues.filter(r => r.status === 'pending').length}
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
                                <p className="text-sm font-medium text-gray-600">Resolved Issues</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {issues.filter(r => r.status === 'resolved').length}
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
                                <p className="text-2xl font-bold text-gray-900">{issues.length}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-lg shadow mb-6">
                    <div className="border-b border-gray-200">
                        <nav className="flex space-x-8 px-6">
                            {[
                                { key: 'all', label: 'All Issues' },
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
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>

                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredIssues.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-8 text-gray-500">No issues found.</td>
                                    </tr>
                                ) : (
                                    filteredIssues.map((issue, idx) => (
                                        <tr key={issue.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{idx + 1}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(issue.priority)}`}>
                                                    {issue.priority}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{issue.reason}</td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 max-w-xs truncate">{issue.description}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    {getStatusIcon(issue.status)}
                                                    <span className="ml-2 text-sm text-gray-900 capitalize">{issue.status}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                                <button
                                                    onClick={() => setSelectedIssue(issue)}
                                                    className="text-blue-600 hover:text-blue-900"
                                                >
                                                    View
                                                </button>
                                                {issue.status === 'pending' && (
                                                    <button
                                                        onClick={() => resolveIssue(issue.id)}
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
            </div>

            {/* Detail modal */}
            {selectedIssue && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <div className="mt-3">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-gray-900">Issue Details</h3>
                                <button onClick={() => setSelectedIssue(null)} className="text-gray-400 hover:text-gray-600">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Priority</label>
                                    <span className={`mt-1 inline-block px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(selectedIssue.priority)}`}>
                                        {selectedIssue.priority}
                                    </span>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Reason</label>
                                    <p className="mt-1 text-sm text-gray-900">{selectedIssue.reason}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Description</label>
                                    <p className="mt-1 text-sm text-gray-900">{selectedIssue.description}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Status</label>
                                    <div className="flex items-center mt-1">
                                        {getStatusIcon(selectedIssue.status)}
                                        <span className="ml-2 text-sm text-gray-900 capitalize">{selectedIssue.status}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Reported Date</label>
                                    <p className="mt-1 text-sm text-gray-900">{formatDate(selectedIssue.createdAt)}</p>
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 mt-6">
                                <button onClick={() => setSelectedIssue(null)} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400">Close</button>
                                {selectedIssue.status === 'pending' && (
                                    <button
                                        onClick={() => {
                                            resolveIssue(selectedIssue.id);
                                            setSelectedIssue(null);
                                        }}
                                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                                        disabled={saving}
                                    >
                                        Mark as Resolved
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
