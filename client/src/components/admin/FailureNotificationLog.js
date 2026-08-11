import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, RefreshCw, CheckCircle, Clock, User, MapPin,
  MessageSquare, MessageCircle, Package, ChevronDown, ChevronUp,
  CalendarPlus, Send, X
} from 'lucide-react';

import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

const REASON_STYLES = {
  'Customer Unreachable': 'bg-orange-100 text-orange-800 border-orange-200',
  'Access Blocked':       'bg-red-100 text-red-800 border-red-200',
  'Customer Rejected':    'bg-purple-100 text-purple-800 border-purple-200',
  'Incorrect Address':    'bg-yellow-100 text-yellow-800 border-yellow-200',
};

const ITEM_STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400'   },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', dot: 'bg-green-500'  },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-700',     dot: 'bg-red-500'    },
};

function formatDateTime(str) {
  if (!str) return 'N/A';
  return new Date(str).toLocaleString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ReasonBadge({ reason }) {
  const style = REASON_STYLES[reason] || 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      {reason || 'Unknown'}
    </span>
  );
}

function ItemStatusBadge({ status }) {
  const cfg = ITEM_STATUS_CONFIG[status] || ITEM_STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Case Detail Panel ────────────────────────────────────────────────────────
function CaseDetail({ order, onClose, onResolved, highlightId }) {
  const navigate = useNavigate();
  const [items,          setItems]          = useState(order.order_products || []);
  const [resolving,      setResolving]      = useState(false);
  const [sendingWA,      setSendingWA]      = useState(false);
  const [waResult,       setWaResult]       = useState(null);
  const [updatingItem,   setUpdatingItem]   = useState(null);

  const isResolved = order.issue_status === 'resolved';
  const customer   = order.customers;
  const orderRef   = order.odoo_order_ref || 'Not Synced';

  const failedItems    = items.filter(i => i.item_delivery_status === 'failed');
  const deliveredItems = items.filter(i => i.item_delivery_status === 'delivered');

  // Update individual item status
  const updateItemStatus = async (itemId, status) => {
    setUpdatingItem(itemId);
    try {
      const res = await fetch(`${API_BASE}/api/order-products/${itemId}/delivery-status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ item_delivery_status: status }),
      });
      if (!res.ok) throw new Error('Failed');
      setItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, item_delivery_status: status } : i
      ));
    } catch (err) {
      alert('Failed to update item status');
    } finally {
      setUpdatingItem(null);
    }
  };

  // Resolve case
  const handleResolve = async () => {
    setResolving(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${order.id}/issue`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ issue_status: 'resolved' }),
      });
      if (!res.ok) throw new Error('Failed');
      onResolved(order.id);
    } catch (err) {
      alert('Failed to resolve case');
    } finally {
      setResolving(false);
    }
  };

  // Send WhatsApp manually
  const handleSendWhatsApp = async () => {
    setSendingWA(true);
    setWaResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/notifications/whatsapp/${order.id}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setWaResult({ success: true, msg: `WhatsApp sent to ${customer?.phone}` });
    } catch (err) {
      setWaResult({ success: false, msg: err.message });
    } finally {
      setSendingWA(false);
    }
  };

  // Reschedule — navigate to Place Order with failed items pre-filled
  const handleReschedule = () => {
    const failedProductIds = failedItems.map(i => i.product_id);
    navigate('/customer/', {
      state: {
        reschedule: true,
        customerId: order.customer_id,
        productIds: failedProductIds,
        sourceOrderId: order.id,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mt-10 mb-10">

        {/* Header */}
        <div className={`px-6 py-4 rounded-t-2xl flex items-center justify-between ${isResolved ? 'bg-green-50 border-b border-green-200' : 'bg-red-50 border-b border-red-200'}`}>
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className={isResolved ? 'text-green-600' : 'text-red-600'} />
              <h2 className="text-base font-bold text-gray-900">Case — {orderRef}</h2>
              {isResolved && (
                <span className="flex items-center text-xs text-green-600 font-medium bg-green-100 px-2 py-0.5 rounded-full">
                  <CheckCircle size={11} className="mr-1" /> Resolved
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{formatDateTime(order.updated_at || order.created_at)}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* Customer info */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Customer</p>
            {customer?.full_name && (
              <div className="flex items-center text-sm text-gray-700">
                <User size={14} className="mr-2 text-gray-400" /> {customer.full_name}
              </div>
            )}
            {customer?.email && (
              <div className="flex items-center text-sm text-gray-700">
                <MessageSquare size={14} className="mr-2 text-gray-400" /> {customer.email}
              </div>
            )}
            {customer?.phone && (
              <div className="flex items-center text-sm text-gray-700">
                <MessageCircle size={14} className="mr-2 text-gray-400" /> {customer.phone}
              </div>
            )}
            {order.delivery_address && (
              <div className="flex items-start text-sm text-gray-700">
                <MapPin size={14} className="mr-2 mt-0.5 text-gray-400 flex-shrink-0" />
                {order.delivery_address}{order.delivery_city ? `, ${order.delivery_city}` : ''}
              </div>
            )}
          </div>

          {/* Failure details */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Failure Details</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {order.issue_reason && <ReasonBadge reason={order.issue_reason} />}
            </div>
            {order.issue_desc && (
              <p className="text-sm text-gray-600 italic bg-gray-50 px-3 py-2 rounded-lg">
                "{order.issue_desc}"
              </p>
            )}
          </div>

          {/* Order items with individual status */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Items</p>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="text-green-600 font-medium">{deliveredItems.length} delivered</span>
                <span className="text-red-600 font-medium">{failedItems.length} failed</span>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No items on record</p>
            ) : (
              <div className="space-y-2">
                {items.map(item => {
                  const productName = item.products?.product_name || item.odoo_product_name || `Product #${item.id}`;
                  const status      = item.item_delivery_status || 'pending';
                  const isUpdating  = updatingItem === item.id;

                  return (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border ${
                      status === 'failed'    ? 'border-red-200 bg-red-50' :
                      status === 'delivered' ? 'border-green-200 bg-green-50' :
                                              'border-gray-200 bg-white'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Package size={14} className="text-gray-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{productName}</p>
                          <p className="text-xs text-gray-500">Qty: {item.quantity || 1} · {item.service_type || 'delivery'}</p>
                        </div>
                      </div>

                      {/* Status toggle buttons */}
                      {!isResolved && (
                        <div className="flex items-center gap-1.5">
                          {['delivered', 'failed', 'pending'].map(s => (
                            <button
                              key={s}
                              disabled={isUpdating || status === s}
                              onClick={() => updateItemStatus(item.id, s)}
                              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                status === s
                                  ? s === 'delivered' ? 'bg-green-600 text-white'
                                  : s === 'failed'    ? 'bg-red-600 text-white'
                                  :                    'bg-gray-600 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {isUpdating && status !== s ? '...' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      )}
                      {isResolved && <ItemStatusBadge status={status} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* WhatsApp result */}
          {waResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              waResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {waResult.success ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              {waResult.msg}
            </div>
          )}

          {/* Action buttons */}
          {!isResolved && (
            <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">

              {/* WhatsApp */}
              <button
                onClick={handleSendWhatsApp}
                disabled={sendingWA}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                <MessageCircle size={15} />
                {sendingWA ? 'Sending...' : 'Send WhatsApp to Customer'}
              </button>

              {/* Reschedule */}
              {failedItems.length > 0 && (
                <button
                  onClick={handleReschedule}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <CalendarPlus size={15} />
                  Reschedule Failed Items ({failedItems.length})
                </button>
              )}

              {/* Resolve */}
              <button
                onClick={handleResolve}
                disabled={resolving}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 ml-auto"
              >
                <CheckCircle size={15} />
                {resolving ? 'Resolving...' : 'Mark as Resolved'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FailureNotificationLog() {
  const [searchParams] = useSearchParams();
  const highlightId    = searchParams.get('orderId');

  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('open'); // default to open
  const [error,      setError]      = useState(null);
  const [activeCase, setActiveCase] = useState(null);

  const fetchFailedOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/orders?issues_only=true&sort=created_desc&include_products=true`
      );
      if (!res.ok) throw new Error('Failed to fetch failed orders');
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFailedOrders();
    const timer = setInterval(fetchFailedOrders, 15000); // auto-refresh every 15s
    return () => clearInterval(timer);
  }, [fetchFailedOrders]);

  // Auto-open case if navigated from bell
  useEffect(() => {
    if (highlightId && orders.length > 0) {
      const found = orders.find(o => o.id === highlightId);
      if (found) setActiveCase(found);
    }
  }, [highlightId, orders]);

  const handleResolved = (orderId) => {
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, issue_status: 'resolved' } : o
    ));
    setActiveCase(null);
  };

  const filtered = orders.filter(o => {
    if (filter === 'open')     return o.issue_status !== 'resolved';
    if (filter === 'resolved') return o.issue_status === 'resolved';
    return true;
  });

  const openCount     = orders.filter(o => o.issue_status !== 'resolved').length;
  const resolvedCount = orders.filter(o => o.issue_status === 'resolved').length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">

      {/* Case detail modal */}
      {activeCase && (
        <CaseDetail
          order={activeCase}
          onClose={() => setActiveCase(null)}
          onResolved={handleResolved}
          highlightId={highlightId}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <AlertTriangle className="w-6 h-6 mr-2 text-red-600" />
            Delivery Failure Log
          </h1>
          <p className="mt-1 text-sm text-gray-500">Click any case to view details, update item status, or resolve.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-lg p-1">
            {[
              { key: 'all',      label: 'All',      count: orders.length },
              { key: 'open',     label: 'Open',     count: openCount     },
              { key: 'resolved', label: 'Resolved', count: resolvedCount },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  filter === f.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {f.label}
                {f.count > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    filter === f.key ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>{f.count}</span>
                )}
              </button>
            ))}
          </div>
          <button onClick={fetchFailedOrders} className="flex items-center px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw size={14} className="mr-1" /> Refresh
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total',    value: orders.length, color: 'text-gray-900',   border: 'border-gray-200'   },
          { label: 'Open',     value: openCount,     color: 'text-orange-600', border: 'border-orange-200' },
          { label: 'Resolved', value: resolvedCount, color: 'text-green-600',  border: 'border-green-200'  },
        ].map(c => (
          <div key={c.label} className={`bg-white rounded-xl p-4 border shadow-sm ${c.border}`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500">Loading...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No failure records</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const isResolved = order.issue_status === 'resolved';
            const isHighlighted = order.id === highlightId;
            const customer = order.customers;
            const items    = order.order_products || [];
            const failedCount = items.filter(i => i.item_delivery_status === 'failed').length;

            return (
              <div
                key={order.id}
                onClick={() => setActiveCase(order)}
                className={`bg-white rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition-all ${
                  isHighlighted ? 'ring-2 ring-blue-500 border-blue-300' :
                  isResolved    ? 'border-gray-200 opacity-80'           :
                                  'border-red-200'
                }`}
              >
                {!isResolved && <div className="h-1 bg-red-500 w-full rounded-t-xl" />}

                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-gray-800">
                          {order.odoo_order_ref || 'Not Synced'}
                        </span>
                        {order.issue_reason && <ReasonBadge reason={order.issue_reason} />}
                        {isResolved && (
                          <span className="flex items-center text-xs text-green-600 font-medium">
                            <CheckCircle size={11} className="mr-1" /> Resolved
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                        {customer?.full_name && (
                          <span className="flex items-center">
                            <User size={12} className="mr-1 text-gray-400" /> {customer.full_name}
                          </span>
                        )}
                        {order.delivery_address && (
                          <span className="flex items-center">
                            <MapPin size={12} className="mr-1 text-gray-400" />
                            <span className="truncate max-w-xs">{order.delivery_address}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center">
                          <Package size={11} className="mr-1" />
                          {items.length} item{items.length !== 1 ? 's' : ''}
                          {failedCount > 0 && <span className="ml-1 text-red-500 font-medium">({failedCount} failed)</span>}
                        </span>
                        <span className="flex items-center">
                          <Clock size={11} className="mr-1" />
                          {formatDateTime(order.updated_at || order.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                        isResolved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {isResolved ? 'Resolved' : order.issue_status || 'Open'}
                      </span>
                      <ChevronDown size={16} className="text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
