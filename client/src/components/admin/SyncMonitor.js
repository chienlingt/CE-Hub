import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, CheckCircle, AlertTriangle, RefreshCw,
  Link, Clock, Package, ExternalLink, Sparkles
} from 'lucide-react';
import ParseRemarksModal from './ParseRemarksModal';

const API_BASE = process.env.REACT_APP_API_BASE_URL || window.location.origin.replace(/:\d+$/, ':4000');

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

export default function SyncMonitor() {
  const [ceHubOrders,  setCeHubOrders]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [error,        setError]        = useState(null);
  const [syncResult,   setSyncResult]   = useState(null);
  const [filter,       setFilter]       = useState('all');
  const [parseTarget,  setParseTarget]  = useState(null); // order to parse remarks

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

  useEffect(() => {
    fetchOrders();
    const timer = setInterval(fetchOrders, 30000);
    return () => clearInterval(timer);
  }, [fetchOrders]);

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
    </div>
  );
}
