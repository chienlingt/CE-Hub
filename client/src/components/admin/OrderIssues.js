import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText, AlertOctagon, User, X, MessageCircle, Phone, ExternalLink } from 'lucide-react';
import {
    getOrdersWithIssues,
    resolveOrderIssue
} from '../../services/informationService';

function normalizeIssue(o) {
    return {
        id: o.id,
        shortRef: o.odoo_order_ref || 'Not Synced',
        customerName: o.customers?.full_name || 'Unknown',
        customerPhone: o.customers?.phone || null,
        priority: o.issue_priority_level || 'Normal',
        reason: o.issue_reason || 'No Reason',
        description: o.issue_desc || '',
        status: (o.issue_status || 'pending').toLowerCase(),
        createdAt: o.created_at,
        issueDate: o.updated_at || o.created_at
    };
}

function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-MY', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

function formatWANumber(phone) {
    if (!phone) return null;
    const clean = phone.replace(/[\s\-+()]/g, '');
    if (clean.startsWith('60')) return clean;
    if (clean.startsWith('0')) return '60' + clean.slice(1);
    return '60' + clean;
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

function PriorityBadge({ priority }) {
    const p = (priority || 'normal').toLowerCase();
    const styles = {
        high:   'bg-red-100 text-red-700',
        medium: 'bg-yellow-100 text-yellow-700',
        low:    'bg-green-100 text-green-700',
        normal: 'bg-gray-100 text-gray-600',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[p] || styles.normal}`}>
            {priority}
        </span>
    );
}

// ── WhatsApp popup dialog ─────────────────────────────────────────────────────
function WAModal({ customerName, phone, onClose }) {
    const wa = formatWANumber(phone);
    if (!wa) return null;

    // Display-friendly number: +60 XX-XXXXXXX
    const display = phone;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                {/* Header */}
                <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-green-100 rounded-lg">
                            <MessageCircle size={15} className="text-green-600" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900">Send WhatsApp to Customer</h3>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Customer info */}
                    <div className="bg-gray-50 rounded-xl p-3.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <User size={13} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-900">{customerName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone size={13} className="text-gray-400" />
                            <span className="text-sm text-gray-700">{display}</span>
                        </div>
                    </div>

                    {/* Instruction */}
                    <p className="text-xs text-gray-500 leading-relaxed">
                        Click the button below to open WhatsApp. On mobile it will open the WhatsApp app; on desktop it will open WhatsApp Web. You can then type and send your message to the customer.
                    </p>

                    {/* Open WhatsApp button */}
                    <a
                        href={`https://api.whatsapp.com/send/?phone=${wa}&type=phone_number&app_absent=0`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={onClose}
                        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                        <MessageCircle size={16} />
                        Open WhatsApp
                        <ExternalLink size={13} className="opacity-70" />
                    </a>

                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function OrderIssues() {
    const [issues, setIssues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [selectedIssue, setSelectedIssue] = useState(null);
    const [waTarget, setWaTarget] = useState(null); // { customerName, phone }
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
                if (!ac.signal.aborted) setIssues(normalized);
            } catch (err) {
                if (err.name !== 'AbortError') setError('Failed to load issues. ' + (err.message || ''));
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
            setIssues(prev => prev.map(i => (i.id === id ? { ...i, status: 'resolved' } : i)));
            if (selectedIssue?.id === id) setSelectedIssue(prev => ({ ...prev, status: 'resolved' }));
        } catch (err) {
            setError('Failed to resolve issue. ' + (err.message || ''));
        } finally {
            setSaving(false);
        }
    };

    const filteredIssues = issues.filter(i =>
        filter === 'all' ? true : (i.status || '').toLowerCase() === filter
    );

    const pending  = issues.filter(r => r.status === 'pending').length;
    const resolved = issues.filter(r => r.status === 'resolved').length;

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
                        <div className="p-2 bg-red-100 rounded-lg"><AlertOctagon className="w-5 h-5 text-red-600" /></div>
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
                            <p className="text-xl font-bold text-gray-900">{issues.length}</p>
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
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredIssues.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center py-10 text-gray-400">
                                            <FileText className="w-7 h-7 mx-auto mb-2 opacity-40" />
                                            No issues found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredIssues.map(issue => (
                                        <tr
                                            key={issue.id}
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() => setSelectedIssue(issue)}
                                        >
                                            <td className="px-4 py-3 whitespace-nowrap text-xs font-mono font-semibold text-gray-700">
                                                #{issue.shortRef}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    <User size={13} className="text-gray-400" />
                                                    <span className="text-sm font-medium text-gray-900">{issue.customerName}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <PriorityBadge priority={issue.priority} />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{issue.reason}</td>
                                            <td className="px-4 py-3 max-w-xs">
                                                <p className="text-sm text-gray-500 truncate">{issue.description || '—'}</p>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <StatusBadge status={issue.status} />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                                                {formatDate(issue.issueDate)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right">
                                                {issue.status === 'pending' && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); resolveIssue(issue.id); }}
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
            {selectedIssue && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-16 mb-10">
                        <div className={`px-6 py-4 rounded-t-2xl flex items-center justify-between border-b ${
                            selectedIssue.status === 'resolved'
                                ? 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                        }`}>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <AlertTriangle size={16} className={selectedIssue.status === 'resolved' ? 'text-green-600' : 'text-red-600'} />
                                    <h3 className="text-base font-bold text-gray-900">Order Issue — #{selectedIssue.shortRef}</h3>
                                    <PriorityBadge priority={selectedIssue.priority} />
                                    <StatusBadge status={selectedIssue.status} />
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">{formatDate(selectedIssue.issueDate)}</p>
                            </div>
                            <button onClick={() => setSelectedIssue(null)} className="p-1 rounded-lg hover:bg-gray-200">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Customer</p>
                                    <div className="flex items-center gap-1.5">
                                        <User size={13} className="text-gray-400" />
                                        <p className="font-medium text-gray-900">{selectedIssue.customerName}</p>
                                    </div>
                                    {selectedIssue.customerPhone && (
                                        <p className="text-xs text-gray-500 mt-0.5 ml-4">{selectedIssue.customerPhone}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Reason</p>
                                    <p className="font-medium text-gray-900">{selectedIssue.reason}</p>
                                </div>
                            </div>

                            {selectedIssue.description && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1.5">Description</p>
                                    <div className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 border border-gray-100 whitespace-pre-wrap leading-relaxed">
                                        {selectedIssue.description}
                                    </div>
                                </div>
                            )}

                            <div className={`flex items-center pt-2 border-t border-gray-100 ${selectedIssue.status === 'pending' ? 'justify-between' : 'justify-end'}`}>
                                {/* WhatsApp button — only when phone is on record */}
                                {selectedIssue.customerPhone && (
                                    <button
                                        onClick={() => setWaTarget({ customerName: selectedIssue.customerName, phone: selectedIssue.customerPhone })}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
                                    >
                                        <MessageCircle size={13} />
                                        WhatsApp Customer
                                    </button>
                                )}

                                {selectedIssue.status === 'pending' && (
                                    <button
                                        onClick={() => { resolveIssue(selectedIssue.id); setSelectedIssue(null); }}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                                        disabled={saving}
                                    >
                                        <CheckCircle size={16} />
                                        {saving ? 'Resolving…' : 'Mark Resolved'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* WhatsApp popup — sits above the detail modal */}
            {waTarget && (
                <WAModal
                    customerName={waTarget.customerName}
                    phone={waTarget.phone}
                    onClose={() => setWaTarget(null)}
                />
            )}
        </div>
    );
}
