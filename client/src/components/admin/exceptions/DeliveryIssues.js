// client/src/components/admin/exceptions/DeliveryIssues.js
// Exceptions → Driver Escalations: two sections — Escalations (Report→Notify Admin) and Full driver reports.
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle, FileText, RefreshCw,
  User, X, Truck, MapPin, BellRing,
} from 'lucide-react';
import { API_BASE_URL as API_BASE } from '../../../utils/apiBaseUrl';
import { ESCALATION_REASON_STYLES } from '../../../utils/escalationReasons';
import { useAuth } from '../../../contexts/AuthContext';
import { formatDate } from './shared/formatters';
import { ReasonBadge } from './shared/badges';
import EvidenceThumbnails from './shared/EvidenceThumbnails';
import StatCard from './shared/StatCard';
import useIssuePolling from './shared/useIssuePolling';

// Escalations = driver Report (is_complaint_submitted: true)
// Full reports = old Issue-status orders still in the system (is_complaint_submitted: false)


const PRIORITY_STYLES = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-green-100 text-green-700',
};

function PriorityBadge({ level }) {
  const key = (level || 'medium').toLowerCase();
  const style = PRIORITY_STYLES[key] || PRIORITY_STYLES.medium;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}>
      {key}
    </span>
  );
}

// ── Full-report detail modal ──────────────────────────────────────────────────
function ReportDetail({ order, onClose, onResolved }) {
  const { employeeData } = useAuth();
  const [resolving, setResolving] = useState(false);
  const isResolved = order.issue_status === 'resolved';
  const orderRef   = order.odoo_order_ref || 'Not Synced';
  const driverName = order.employees?.name || order.employees?.display_name || '—';
  const customer   = order.customers;

  const handleResolve = async () => {
    setResolving(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${order.id}/issue`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_status: 'resolved', resolved_by: employeeData?.id || null }),
      });
      if (!res.ok) throw new Error('Failed');
      onResolved(order.id, 'resolved');
    } catch {
      alert('Failed to resolve report');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mt-10 mb-10">
        <div className={`px-6 py-4 rounded-t-2xl flex items-center justify-between border-b ${
          isResolved ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
        }`}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle size={18} className={isResolved ? 'text-green-600' : 'text-orange-600'} />
              <h2 className="text-base font-bold text-gray-900">Delivery Report — {orderRef}</h2>
              <PriorityBadge level={order.issue_priority_level} />
              {isResolved && (
                <span className="flex items-center text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full">
                  <CheckCircle size={11} className="mr-1" /> Resolved
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{formatDate(order.updated_at || order.created_at)}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-200">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-1">Customer</p>
              <p className="font-medium text-gray-900">{customer?.full_name || '—'}</p>
              {customer?.phone && <p className="text-gray-500 text-xs mt-0.5">{customer.phone}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Driver</p>
              <p className="font-medium text-gray-900 flex items-center gap-1">
                <Truck size={14} className="text-gray-400" /> {driverName}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-gray-500 mb-1">Delivery address</p>
              <p className="text-gray-800 flex items-start gap-1">
                <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                {order.delivery_address || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Order status</p>
              <p className="font-medium text-gray-900">{order.order_status || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Reason</p>
              <ReasonBadge reason={order.issue_reason} styles={ESCALATION_REASON_STYLES} />
            </div>
          </div>

          {order.issue_desc && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 border border-gray-100 whitespace-pre-wrap">
                {order.issue_desc}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Evidence photos</p>
            <EvidenceThumbnails
              evidence={order.issue_evidence || []}
              emptyFallback={<span className="text-xs text-gray-400">No photos</span>}
            />
          </div>

          {!isResolved && (
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                onClick={handleResolve}
                disabled={resolving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle size={16} />
                {resolving ? 'Resolving…' : 'Mark Resolved'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Escalation detail modal ───────────────────────────────────────────────────
function EscalationDetail({ order, onClose, onAcknowledged }) {
  const [acking, setAcking] = useState(false);
  const isAcked    = order.is_escalation_acknowledged;
  const orderRef   = order.odoo_order_ref || 'Not Synced';
  const driverName = order.employees?.name || order.employees?.display_name || '—';
  const customer   = order.customers;

  const handleAck = async () => {
    setAcking(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${order.id}/escalation-ack`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed');
      onAcknowledged(order.id);
    } catch {
      alert('Failed to acknowledge escalation');
    } finally {
      setAcking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mt-10 mb-10">
        <div className={`px-6 py-4 rounded-t-2xl flex items-center justify-between border-b ${
          isAcked ? 'bg-green-50 border-green-200' : 'bg-purple-50 border-purple-200'
        }`}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <BellRing size={18} className={isAcked ? 'text-green-600' : 'text-purple-600'} />
              <h2 className="text-base font-bold text-gray-900">Driver Report — {orderRef}</h2>
              {order.issue_reason && <ReasonBadge reason={order.issue_reason} styles={ESCALATION_REASON_STYLES} />}
              {isAcked ? (
                <span className="flex items-center text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full">
                  <CheckCircle size={11} className="mr-1" /> Acknowledged
                </span>
              ) : (
                <span className="flex items-center text-xs text-purple-700 font-medium bg-purple-100 px-2 py-0.5 rounded-full">
                  Pending
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{formatDate(order.updated_at || order.created_at)}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-200">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-1">Customer</p>
              <p className="font-medium text-gray-900">{customer?.full_name || '—'}</p>
              {customer?.phone && <p className="text-gray-500 text-xs mt-0.5">{customer.phone}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Driver</p>
              <p className="font-medium text-gray-900 flex items-center gap-1">
                <Truck size={14} className="text-gray-400" /> {driverName}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-gray-500 mb-1">Delivery address</p>
              <p className="text-gray-800 flex items-start gap-1">
                <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                {order.delivery_address || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Order status</p>
              <p className="font-medium text-gray-900">{order.order_status || '—'}</p>
            </div>
          </div>

          {order.issue_desc && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Driver notes</p>
              <div className="text-sm text-gray-800 bg-purple-50 rounded-lg p-3 border border-purple-100 whitespace-pre-wrap">
                {order.issue_desc}
              </div>
            </div>
          )}

          {!isAcked && (
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                onClick={handleAck}
                disabled={acking}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                <CheckCircle size={16} />
                {acking ? 'Acknowledging…' : 'Acknowledge'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Issue row (shared) ────────────────────────────────────────────────────────
function IssueRow({ issue, highlightId, isEscalation, onClick }) {
  const isHighlighted = issue.id === highlightId;
  const driverName    = issue.employees?.name || issue.employees?.display_name || '—';

  const statusBadge = isEscalation
    ? issue.is_escalation_acknowledged
      ? <span className="inline-flex items-center text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle size={11} className="mr-1" /> Acknowledged</span>
      : <span className="inline-flex items-center text-xs font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">Pending</span>
    : issue.issue_status === 'resolved'
      ? <span className="inline-flex items-center text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle size={11} className="mr-1" /> Resolved</span>
      : <span className="inline-flex items-center text-xs font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">Open</span>;

  return (
    <tr
      className={`hover:bg-gray-50 cursor-pointer ${isHighlighted ? 'bg-blue-50' : ''}`}
      onClick={() => onClick(issue)}
    >
      <td className="px-4 py-3 text-sm font-mono text-gray-900">
        {issue.odoo_order_ref || 'Not Synced'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <User size={13} className="text-gray-400" />
          <span className="text-sm text-gray-900">{issue.customers?.full_name || 'Unknown'}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{driverName}</td>
      {!isEscalation && (
        <td className="px-4 py-3"><PriorityBadge level={issue.issue_priority_level} /></td>
      )}
      <td className="px-4 py-3"><ReasonBadge reason={issue.issue_reason} styles={ESCALATION_REASON_STYLES} /></td>
      <td className="px-4 py-3">{statusBadge}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(issue.updated_at || issue.created_at)}</td>
    </tr>
  );
}

// ── Issue table (shared) ──────────────────────────────────────────────────────
function IssueTable({ issues, highlightId, isEscalation, onSelect, emptyText }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
              {!isEscalation && (
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Reason
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {issues.length === 0 ? (
              <tr>
                <td colSpan={isEscalation ? 6 : 7} className="text-center py-8 text-gray-400">
                  <FileText className="w-7 h-7 mx-auto mb-2 opacity-40" />
                  {emptyText}
                </td>
              </tr>
            ) : issues.map(issue => (
              <IssueRow
                key={issue.id}
                issue={issue}
                highlightId={highlightId}
                isEscalation={isEscalation}
                onClick={onSelect}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function DeliveryIssues() {
  const [searchParams] = useSearchParams();
  const highlightId    = searchParams.get('orderId');

  const [selectedIssue, setSelectedIssue] = useState(null);

  // Escalation section filters
  const [escalationFilter, setEscalationFilter] = useState('all'); // all | pending | acknowledged

  // Full reports section filters
  const [statusFilter,   setStatusFilter]   = useState('all'); // all | open | resolved
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Fetch everything; client partitions into two sections
  const fetchIssues = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/orders/delivery-issues?status=all`);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }, []);

  const { data: allIssues, setData: setAllIssues, loading, error, refetch } = useIssuePolling(fetchIssues);
  const errorMessage = error
    ? (error.message?.includes('404')
        ? 'Delivery Issues API not found — restart the server (cd server && npm start).'
        : 'Failed to load delivery issues.')
    : null;

  useEffect(() => {
    if (highlightId && allIssues.length > 0) {
      const found = allIssues.find(o => o.id === highlightId);
      if (found) setSelectedIssue(found);
    }
  }, [highlightId, allIssues]);

  // Partition: escalations = Report path (is_complaint_submitted); fullReports = legacy Issue-status orders
  const escalations  = allIssues.filter(o => !!o.is_complaint_submitted);
  const fullReports  = allIssues.filter(o => !o.is_complaint_submitted);

  // Apply per-section filters
  const visibleEscalations = escalations.filter(o => {
    if (escalationFilter === 'pending')     return !o.is_escalation_acknowledged;
    if (escalationFilter === 'acknowledged') return !!o.is_escalation_acknowledged;
    return true;
  });

  const visibleFullReports = fullReports.filter(o => {
    const statusOk = statusFilter === 'all'
      || (statusFilter === 'open' && o.issue_status !== 'resolved')
      || (statusFilter === 'resolved' && o.issue_status === 'resolved');
    const priorityOk = priorityFilter === 'all'
      || (o.issue_priority_level || '').toLowerCase() === priorityFilter;
    return statusOk && priorityOk;
  });

  // Stat cards
  const pendingEscalations = escalations.filter(o => !o.is_escalation_acknowledged).length;
  const openReports        = fullReports.filter(o => o.issue_status !== 'resolved').length;
  const resolvedReports    = fullReports.filter(o => o.issue_status === 'resolved').length;

  function handleUpdate(orderId, patch) {
    setAllIssues(prev => prev.map(o => o.id === orderId ? { ...o, ...patch } : o));
    setSelectedIssue(null);
  }

  const isEscalationType = !!selectedIssue?.is_complaint_submitted;

  if (loading && allIssues.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading delivery issues…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {selectedIssue && isEscalationType && (
        <EscalationDetail
          order={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onAcknowledged={id => handleUpdate(id, { is_escalation_acknowledged: true })}
        />
      )}
      {selectedIssue && !isEscalationType && (
        <ReportDetail
          order={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onResolved={(id) => handleUpdate(id, { issue_status: 'resolved' })}
        />
      )}

      <div className="w-full px-4 sm:px-6 py-4 space-y-6">
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{errorMessage}</div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="text-orange-500" size={20} />
            Driver Escalations
          </h1>
          <button
            onClick={refetch}
            className="flex items-center px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={13} className="mr-1.5" /> Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Pending escalations" value={pendingEscalations} icon={BellRing}      tone="purple" />
          <StatCard label="Open reports"        value={openReports}        icon={AlertTriangle} tone="orange" />
          <StatCard label="Resolved reports"    value={resolvedReports}    icon={CheckCircle}   tone="green" />
          <StatCard label="Total"               value={allIssues.length}   icon={FileText}      tone="blue" />
        </div>

        {/* ── Section 1: Escalations ─────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <BellRing size={16} className="text-purple-500" />
              Driver Escalations
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                {escalations.length}
              </span>
            </h2>
            <div className="flex gap-1">
              {[
                { key: 'all', label: 'All' },
                { key: 'pending', label: 'Pending' },
                { key: 'acknowledged', label: 'Acknowledged' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setEscalationFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    escalationFilter === f.key
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <IssueTable
            issues={visibleEscalations}
            highlightId={highlightId}
            isEscalation
            onSelect={setSelectedIssue}
            emptyText="No driver escalations."
          />
        </div>

        {/* ── Section 2: Full driver reports ────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <AlertTriangle size={16} className="text-orange-500" />
              Driver Reports
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                {fullReports.length}
              </span>
            </h2>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex gap-1">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'open', label: 'Open' },
                  { key: 'resolved', label: 'Resolved' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      statusFilter === f.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'high', label: 'High' },
                  { key: 'medium', label: 'Medium' },
                  { key: 'low', label: 'Low' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setPriorityFilter(f.key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                      priorityFilter === f.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <IssueTable
            issues={visibleFullReports}
            highlightId={highlightId}
            isEscalation={false}
            onSelect={setSelectedIssue}
            emptyText="No driver reports."
          />
        </div>
      </div>
    </div>
  );
}
