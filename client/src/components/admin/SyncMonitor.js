import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, CheckCircle, AlertTriangle, RefreshCw,
  Link, Clock, Package, ExternalLink, Sparkles
} from 'lucide-react';
import ParseRemarksModal from './ParseRemarksModal';

import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

function formatDateTime(str) {
  if (!str) return 'N/A';
  return new Date(str).toLocaleString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function SyncBadge({ synced }) {
  return synced
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle size={10} /> Synced</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><AlertTriangle size={10} /> Not in CE Hub</span>;
}

function OutboxStatusBadge({ row }) {
  if (row.status === 'processed') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle size={10} /> Sent OK</span>;
  }
  if (row.status === 'dead') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><AlertTriangle size={10} /> Failed — gave up</span>;
  }
  if (row.status === 'pending' && row.attempts > 0) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><RefreshCw size={10} /> Retrying (#{row.attempts})</span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Queued</span>;
}

export default function SyncMonitor() {
  const [ceHubOrders,  setCeHubOrders]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [error,        setError]        = useState(null);
  const [syncResult,   setSyncResult]   = useState(null);
  const [filter,       setFilter]       = useState('all');
  const [parseTarget,  setParseTarget]  = useState(null); // order to parse remarks

  const [outboxRows,   setOutboxRows]   = useState([]);
  const [outboxFilter, setOutboxFilter] = useState('all');

  const fetchOrders = useCallback(async () => {
    setError(null);
    try {
      const res  = await fetch(`${API_BASE}/api/orders?sort=created_desc`);
      const data = await res.json();
      setCeHubOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOutbox = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/integration-outbox`);
      const data = await res.json();
      setOutboxRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      // non-fatal — outbox panel just shows empty
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchOutbox();
    const timer = setInterval(() => { fetchOrders(); fetchOutbox(); }, 30000);
    return () => clearInterval(timer);
  }, [fetchOrders, fetchOutbox]);

  const triggerSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res  = await fetch(`${API_BASE}/api/orders/sync-odoo`, { method: 'POST' });
      const data = await res.json();
      setSyncResult(data);
      fetchOrders();
    } catch (err) {
      setSyncResult({ error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  // Split orders into synced (have odoo_order_ref) and CE Hub-only
  const odooLinked  = ceHubOrders.filter(o => o.odoo_order_ref);
  const localOnly   = ceHubOrders.filter(o => !o.odoo_order_ref);

  // Status mismatch detection
  const anomalies = odooLinked.filter(o => {
    // Flag: delivered in CE Hub but no odoo sync timestamp yet
    if (o.order_status === 'Delivered' && o.assignment_status !== 'approved') return true;
    // Flag: approved but not yet scheduled
    if (o.assignment_status === 'approved' && o.order_status === 'Pending') return true;
    return false;
  });

  const display =
    filter === 'odoo'     ? odooLinked :
    filter === 'local'    ? localOnly  :
    filter === 'anomaly'  ? anomalies  :
    ceHubOrders;

  // Outbox queue — jobs sending data TO Odoo/notifications, with retry/dead status
  const outboxPending   = outboxRows.filter(r => r.status === 'pending');
  const outboxDead      = outboxRows.filter(r => r.status === 'dead');
  const outboxProcessed = outboxRows.filter(r => r.status === 'processed');

  const outboxDisplay =
    outboxFilter === 'pending'   ? outboxPending   :
    outboxFilter === 'dead'      ? outboxDead      :
    outboxFilter === 'processed' ? outboxProcessed :
    outboxRows;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">

      {/* LLM Parse Modal */}
      {parseTarget && (
        <ParseRemarksModal
          order={parseTarget}
          onClose={() => setParseTarget(null)}
          onApplied={() => { setParseTarget(null); fetchOrders(); }}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="text-blue-600" size={22} />
            Sync Monitor
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track synchronization status between CE Hub and Odoo ERP.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchOrders}
            className="flex items-center px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={14} className="mr-1.5" /> Refresh
          </button>
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Link size={14} className="mr-1.5" />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className={`mb-4 p-4 rounded-xl border text-sm flex items-start gap-3 ${
          syncResult.error
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {syncResult.error
            ? <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            : <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
          }
          <div>
            {syncResult.error
              ? `Sync failed: ${syncResult.error}`
              : `Sync complete — ${syncResult.synced} new orders imported, ${syncResult.skipped} already existed.`
            }
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { key: 'all',    label: 'Total Orders', value: ceHubOrders.length, color: 'text-gray-900',   border: 'border-gray-200'   },
          { key: 'odoo',   label: 'Odoo-linked',  value: odooLinked.length,  color: 'text-purple-700', border: 'border-purple-200' },
          { key: 'local',  label: 'CE Hub Only',  value: localOnly.length,   color: 'text-blue-700',   border: 'border-blue-200'   },
          { key: 'anomaly',label: 'Anomalies',    value: anomalies.length,   color: 'text-red-600',    border: 'border-red-200'    },
        ].map(c => (
          <div
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`bg-white rounded-xl p-4 border shadow-sm cursor-pointer hover:shadow-md transition-all ${c.border} ${filter === c.key ? 'ring-2 ring-blue-400' : ''}`}
          >
            <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-lg p-1 mb-4 w-fit">
        {['all', 'odoo', 'local', 'anomaly'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-sm font-medium capitalize transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {f === 'odoo' ? 'Odoo-linked' : f === 'local' ? 'CE Hub Only' : f}
          </button>
        ))}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      ) : display.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No orders match this filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Order Ref', 'Customer', 'Status', 'Assignment', 'Odoo Sync', 'Created', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {display.map(order => {
                const isAnomaly = anomalies.some(a => a.id === order.id);
                return (
                  <tr key={order.id} className={`hover:bg-gray-50 ${isAnomaly ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isAnomaly && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                        <span className="font-mono text-sm font-medium text-gray-900">
                          {order.odoo_order_ref || order.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {order.customers?.full_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        order.order_status === 'Delivered'  ? 'bg-green-100 text-green-700' :
                        order.order_status === 'Scheduled'  ? 'bg-blue-100 text-blue-700'   :
                        order.order_status === 'Delivering' ? 'bg-yellow-100 text-yellow-700':
                                                              'bg-gray-100 text-gray-700'
                      }`}>
                        {order.order_status || 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        order.assignment_status === 'approved'   ? 'bg-green-100 text-green-700' :
                        order.assignment_status === 'assigned'   ? 'bg-blue-100 text-blue-700'   :
                                                                   'bg-gray-100 text-gray-600'
                      }`}>
                        {order.assignment_status || 'unassigned'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SyncBadge synced={!!order.odoo_order_ref} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDateTime(order.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {order.delivery_remarks && (
                        <button
                          onClick={() => setParseTarget(order)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-medium rounded-lg border border-purple-200 transition-colors whitespace-nowrap"
                          title={`Remarks: ${order.delivery_remarks}`}
                        >
                          <Sparkles size={11} />
                          Parse Remarks
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Integration Outbox — jobs sent TO Odoo/notifications, with retry/dead status */}
      <div className="mt-10">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Link className="text-purple-600" size={18} />
            Odoo Sync Queue
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Outgoing jobs to Odoo and notifications — shows what's still retrying or has permanently failed.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            { key: 'all',       label: 'Total Jobs',  value: outboxRows.length,       color: 'text-gray-900',  border: 'border-gray-200'  },
            { key: 'pending',   label: 'Pending/Retrying', value: outboxPending.length,   color: 'text-amber-700', border: 'border-amber-200' },
            { key: 'dead',      label: 'Failed (gave up)', value: outboxDead.length,      color: 'text-red-600',   border: 'border-red-200'   },
            { key: 'processed', label: 'Sent OK',     value: outboxProcessed.length,  color: 'text-green-700', border: 'border-green-200' },
          ].map(c => (
            <div
              key={c.key}
              onClick={() => setOutboxFilter(c.key)}
              className={`bg-white rounded-xl p-4 border shadow-sm cursor-pointer hover:shadow-md transition-all ${c.border} ${outboxFilter === c.key ? 'ring-2 ring-blue-400' : ''}`}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {outboxDisplay.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <Link className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No outbox jobs match this filter.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Event', 'Target', 'Status', 'Attempts', 'Last Error', 'Next Retry', 'Created'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {outboxDisplay.map(row => (
                  <tr key={row.id} className={`hover:bg-gray-50 ${row.status === 'dead' ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-gray-900">{row.event_type}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.target}</td>
                    <td className="px-4 py-3"><OutboxStatusBadge row={row} /></td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.attempts}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate" title={row.last_error || ''}>
                      {row.last_error || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {row.status === 'pending' ? formatDateTime(row.next_retry_at) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDateTime(row.created_at)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
