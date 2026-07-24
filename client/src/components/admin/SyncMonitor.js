import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity, CheckCircle, AlertTriangle, RefreshCw,
  Link, Clock, XCircle, Loader2, Info,
  GitBranch, ShieldAlert,
} from 'lucide-react';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

function formatDateTime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatTimeAgo(str) {
  if (!str) return null;
  const diff = Date.now() - new Date(str).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Per-DO sync status badge ──────────────────────────────────────────────────
function DOSyncBadge({ syncInfo }) {
  const { status, lastSyncAt, retrying } = syncInfo;

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle size={10} /> Sync Failed
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <Loader2 size={10} className="animate-spin" /> Syncing{retrying ? ` (retry #${retrying})` : '…'}
      </span>
    );
  }
  if (status === 'synced') {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle size={10} /> Synced
        </span>
        {lastSyncAt && (
          <span className="text-gray-400 text-xs ml-1">{formatTimeAgo(lastSyncAt)}</span>
        )}
      </span>
    );
  }
  // local only
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      Local Only
    </span>
  );
}

// ── Small anomaly reason chips ────────────────────────────────────────────────
function AnomalyChip({ type }) {
  const map = {
    SYNC_PUSH_FAILED: { label: 'Sync push failed',        color: 'bg-red-100 text-red-700'    },
    STATUS_MISMATCH:  { label: 'Delivered w/o approval',  color: 'bg-orange-100 text-orange-700' },
    APPROVAL_STUCK:   { label: 'Approved but not scheduled', color: 'bg-yellow-100 text-yellow-700' },
  };
  const cfg = map[type] || { label: type, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <ShieldAlert size={9} /> {cfg.label}
    </span>
  );
}

function OutboxStatusBadge({ row }) {
  if (row.status === 'processed') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle size={10} /> Sent OK</span>;
  }
  if (row.status === 'dead') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><XCircle size={10} /> Failed — gave up</span>;
  }
  if (row.status === 'pending' && row.attempts > 0) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><RefreshCw size={10} /> Retrying (#{row.attempts})</span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Queued</span>;
}

// ── Anomaly summary panel ─────────────────────────────────────────────────────
function AnomalyPanel({ anomalyOrders, getAnomalies }) {
  const typeCounts = {};
  anomalyOrders.forEach(o => {
    getAnomalies(o).forEach(f => {
      typeCounts[f.type] = (typeCounts[f.type] || 0) + 1;
    });
  });

  const descriptions = {
    SYNC_PUSH_FAILED: 'CE Hub sent a status update to Odoo but the push failed permanently. Odoo may show the wrong delivery status. Retry or manually update in Odoo.',
    STATUS_MISMATCH:  'Order is marked Delivered in CE Hub but was never moved to "approved" assignment status. This may indicate an incomplete workflow.',
    APPROVAL_STUCK:   'Order assignment was approved but the order is still showing as Pending, suggesting the scheduling step did not complete.',
  };

  return (
    <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="text-red-600" size={16} />
        <h3 className="font-semibold text-red-800 text-sm">
          {anomalyOrders.length} order{anomalyOrders.length !== 1 ? 's' : ''} flagged for review
        </h3>
      </div>
      <div className="space-y-2">
        {Object.entries(typeCounts).map(([type, count]) => (
          <div key={type} className="flex items-start gap-3 bg-white rounded-lg border border-red-100 px-3 py-2.5">
            <AnomalyChip type={type} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600">{descriptions[type]}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SyncMonitor() {
  const [ceHubOrders,  setCeHubOrders]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [error,        setError]        = useState(null);
  const [syncResult,   setSyncResult]   = useState(null);
  const [filter,       setFilter]       = useState('all');

  const [outboxRows,   setOutboxRows]   = useState([]);
  const [outboxFilter, setOutboxFilter] = useState('all');

  const fetchOrders = useCallback(async () => {
    setError(null);
    try {
      const res  = await fetch(`${API_BASE}/api/orders?sort=created_desc`);
      const data = await res.json();
      setCeHubOrders(Array.isArray(data) ? data : []);
    } catch {
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
    } catch {
      // non-fatal
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

  // ── Join: outbox rows indexed by orderId ──────────────────────────────────
  const orderOutboxMap = useMemo(() => {
    const map = {};
    outboxRows.forEach(row => {
      const id = row.payload?.orderId;
      if (id) {
        if (!map[id]) map[id] = [];
        map[id].push(row);
      }
    });
    return map;
  }, [outboxRows]);

  // ── Per-order sync status ─────────────────────────────────────────────────
  function getSyncInfo(order) {
    if (!order.odoo_order_ref) return { status: 'local' };

    const jobs = (orderOutboxMap[order.id] || []).filter(j => j.target === 'odoo');
    const dead    = jobs.filter(j => j.status === 'dead');
    const pending = jobs.filter(j => j.status === 'pending');

    if (dead.length > 0)    return { status: 'failed', failedJobs: dead };
    if (pending.length > 0) return { status: 'pending', retrying: Math.max(...pending.map(j => j.attempts)) };

    const lastSync = jobs
      .filter(j => j.status === 'processed' && j.processed_at)
      .sort((a, b) => new Date(b.processed_at) - new Date(a.processed_at))[0];

    return { status: 'synced', lastSyncAt: lastSync?.processed_at };
  }

  // ── Per-order anomaly flags ───────────────────────────────────────────────
  function getAnomalies(order) {
    const flags = [];
    const sync = getSyncInfo(order);

    if (sync.status === 'failed') {
      flags.push({ type: 'SYNC_PUSH_FAILED', jobs: sync.failedJobs });
    }
    if (order.order_status === 'Delivered' && order.assignment_status !== 'approved') {
      flags.push({ type: 'STATUS_MISMATCH' });
    }
    if (order.assignment_status === 'approved' && order.order_status === 'Pending') {
      flags.push({ type: 'APPROVAL_STUCK' });
    }
    return flags;
  }

  // ── Derived lists ─────────────────────────────────────────────────────────
  const odooLinked     = ceHubOrders.filter(o => o.odoo_order_ref);
  const localOnly      = ceHubOrders.filter(o => !o.odoo_order_ref);
  const anomalyOrders  = ceHubOrders.filter(o => getAnomalies(o).length > 0);

  const display =
    filter === 'odoo'    ? odooLinked    :
    filter === 'local'   ? localOnly     :
    filter === 'anomaly' ? anomalyOrders :
    ceHubOrders;

  const outboxPending   = outboxRows.filter(r => r.status === 'pending');
  const outboxDead      = outboxRows.filter(r => r.status === 'dead');
  const outboxProcessed = outboxRows.filter(r => r.status === 'processed');

  const outboxDisplay =
    outboxFilter === 'pending'   ? outboxPending   :
    outboxFilter === 'dead'      ? outboxDead      :
    outboxFilter === 'processed' ? outboxProcessed :
    outboxRows;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">

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
            onClick={() => { fetchOrders(); fetchOutbox(); }}
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
            ? <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            : <CheckCircle size={16} className="shrink-0 mt-0.5" />}
          {syncResult.error
            ? `Sync failed: ${syncResult.error}`
            : `Sync complete — ${syncResult.synced} new orders imported, ${syncResult.skipped} already existed.`}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { key: 'all',    label: 'Total Orders',  value: ceHubOrders.length,   color: 'text-gray-900',   border: 'border-gray-200'   },
          { key: 'odoo',   label: 'Odoo-linked',   value: odooLinked.length,    color: 'text-purple-700', border: 'border-purple-200' },
          { key: 'local',  label: 'CE Hub Only',   value: localOnly.length,     color: 'text-blue-700',   border: 'border-blue-200'   },
          { key: 'anomaly',label: 'Anomalies',     value: anomalyOrders.length, color: anomalyOrders.length > 0 ? 'text-red-600' : 'text-gray-400', border: anomalyOrders.length > 0 ? 'border-red-200' : 'border-gray-200' },
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
        {[
          { key: 'all',    label: 'All' },
          { key: 'odoo',   label: 'Odoo-linked' },
          { key: 'local',  label: 'CE Hub Only' },
          { key: 'anomaly',label: 'Anomalies' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {f.label}
            {f.key === 'anomaly' && anomalyOrders.length > 0 && (
              <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 font-sans ${
                filter === f.key ? 'bg-red-400 text-white' : 'bg-red-100 text-red-600'
              }`}>
                {anomalyOrders.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Anomaly detail panel — shown when viewing anomalies */}
      {filter === 'anomaly' && anomalyOrders.length > 0 && (
        <AnomalyPanel anomalyOrders={anomalyOrders} getAnomalies={getAnomalies} />
      )}

      {/* Order table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      ) : display.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {filter === 'anomaly' ? 'No anomalies detected. All orders are in sync.' : 'No orders match this filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['DO / Order Ref', 'SO Ref', 'Customer', 'CE Hub Status', 'Sync Status', 'Flags', 'Created'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {display.map(order => {
                  const syncInfo  = getSyncInfo(order);
                  const anomalies = getAnomalies(order);
                  const hasAnomaly = anomalies.length > 0;
                  return (
                    <tr key={order.id} className={`hover:bg-gray-50 ${hasAnomaly ? 'bg-red-50 hover:bg-red-100' : ''}`}>
                      {/* DO ref */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-medium text-gray-900">
                          {order.odoo_order_ref || order.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      {/* SO ref */}
                      <td className="px-4 py-3">
                        {order.odoo_sales_ref ? (
                          <span className="inline-flex items-center gap-1 font-mono text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
                            <GitBranch size={9} /> {order.odoo_sales_ref}
                          </span>
                        ) : '—'}
                      </td>
                      {/* Customer */}
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {order.customers?.full_name || '—'}
                      </td>
                      {/* CE Hub status */}
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          order.order_status === 'Delivered'  ? 'bg-green-100 text-green-700'   :
                          order.order_status === 'Scheduled'  ? 'bg-blue-100 text-blue-700'     :
                          order.order_status === 'Delivering' ? 'bg-yellow-100 text-yellow-700' :
                          order.order_status === 'Cancelled'  ? 'bg-gray-100 text-gray-500'     :
                          order.order_status === 'Completed'  ? 'bg-teal-100 text-teal-700'     :
                                                                'bg-gray-100 text-gray-700'
                        }`}>
                          {order.order_status || 'Pending'}
                        </span>
                      </td>
                      {/* Sync status */}
                      <td className="px-4 py-3">
                        <DOSyncBadge syncInfo={syncInfo} />
                      </td>
                      {/* Anomaly flags */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {anomalies.map((f, i) => <AnomalyChip key={i} type={f.type} />)}
                          {anomalies.length === 0 && (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      {/* Created */}
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock size={10} />
                          {formatDateTime(order.created_at)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Integration Outbox ─────────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Link className="text-purple-600" size={18} />
            Odoo Sync Queue
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Outgoing jobs to Odoo and notifications — shows what's still retrying or has permanently failed.
          </p>
          {outboxDead.length > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <Info size={12} /> {outboxDead.length} job{outboxDead.length !== 1 ? 's' : ''} failed permanently — Odoo may be out of sync for these orders.
            </div>
          )}
        </div>

        {/* Outbox summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            { key: 'all',       label: 'Total Jobs',       value: outboxRows.length,       color: 'text-gray-900',   border: 'border-gray-200'   },
            { key: 'pending',   label: 'Pending/Retrying', value: outboxPending.length,    color: 'text-amber-700',  border: 'border-amber-200'  },
            { key: 'dead',      label: 'Failed (gave up)', value: outboxDead.length,       color: outboxDead.length > 0 ? 'text-red-600' : 'text-gray-400', border: outboxDead.length > 0 ? 'border-red-200' : 'border-gray-200' },
            { key: 'processed', label: 'Sent OK',          value: outboxProcessed.length,  color: 'text-green-700',  border: 'border-green-200'  },
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
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['DO Ref', 'Event', 'Target', 'Status', 'Attempts', 'Last Error', 'Next Retry', 'Created'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {outboxDisplay.map(row => {
                    const doRef = row.payload?.odooRef || (row.payload?.orderId ? row.payload.orderId.slice(0, 8).toUpperCase() : '—');
                    return (
                      <tr key={row.id} className={`hover:bg-gray-50 ${row.status === 'dead' ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-medium text-gray-800">{doRef}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-medium text-gray-900">{row.event_type}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.target}</td>
                        <td className="px-4 py-3"><OutboxStatusBadge row={row} /></td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.attempts}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate" title={row.last_error || ''}>
                          {row.last_error || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {row.status === 'pending' ? formatDateTime(row.next_retry_at) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Clock size={10} />
                            {formatDateTime(row.created_at)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
