import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
  CheckCircle,
  ChevronRight,
  FileText,
  MapPin,
  MessageCircle,
  MessageSquare,
  Package, RefreshCw,
  User,
  X
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

const REASON_STYLES = {
  'Customer Unreachable': 'bg-orange-100 text-orange-800',
  'Access Blocked':       'bg-red-100 text-red-800',
  'Customer Rejected':    'bg-purple-100 text-purple-800',
  'Incorrect Address':    'bg-yellow-100 text-yellow-800',
};

const ITEM_STATUS = {
  pending:   { label: 'Pending',   color: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400'   },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', dot: 'bg-green-500'  },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-700',     dot: 'bg-red-500'    },
};

function formatDate(str) {
  if (!str) return 'N/A';
  const d = new Date(str);
  if (isNaN(d.getTime())) return String(str);
  return d.toLocaleString('en-MY', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function ReasonBadge({ reason }) {
  const style = REASON_STYLES[reason] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {reason || 'Unknown'}
    </span>
  );
}

// ── Case Detail Modal ─────────────────────────────────────────────────────────
function CaseDetail({ order, onClose, onResolved }) {
  const navigate    = useNavigate();
  const [items,     setItems]     = useState(order.order_products || []);
  const [resolving, setResolving] = useState(false);
  const [updatingItem, setUpdatingItem] = useState(null);

  const isResolved = order.issue_status === 'resolved';
  const customer   = order.customers;
  const orderRef   = order.odoo_order_ref || order.id.slice(0, 8).toUpperCase();
  const failedItems = items.filter(i => i.item_delivery_status === 'failed');

  const updateItemStatus = async (itemId, status) => {
    setUpdatingItem(itemId);
    try {
      const res = await fetch(`${API_BASE}/api/order-products/${itemId}/delivery-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_delivery_status: status }),
      });
      if (!res.ok) throw new Error('Failed');
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, item_delivery_status: status } : i));
    } catch {
      alert('Failed to update item status');
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleResolve = async () => {
    setResolving(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${order.id}/issue`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_status: 'resolved' }),
      });
      if (!res.ok) throw new Error('Failed');
      onResolved(order.id);
    } catch {
      alert('Failed to resolve case');
    } finally {
      setResolving(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!customer?.phone) return;
    const clean = customer.phone.replace(/[\s\-+()]/g, '');
    const wa = clean.startsWith('60') ? clean : clean.startsWith('0') ? '60' + clean.slice(1) : '60' + clean;
    window.open(`https://api.whatsapp.com/send/?phone=${wa}&type=phone_number&app_absent=0`, '_blank', 'noopener,noreferrer');
  };

  const handleReschedule = () => {
    navigate('/customer/', {
      state: {
        reschedule:    true,
        customerId:    order.customer_id,
        productIds:    failedItems.map(i => i.product_id),
        sourceOrderId: order.id,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mt-10 mb-10">

        {/* Header */}
        <div className={`px-6 py-4 rounded-t-2xl flex items-center justify-between border-b ${
          isResolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className={isResolved ? 'text-green-600' : 'text-red-600'} />
              <h2 className="text-base font-bold text-gray-900">Case — {orderRef}</h2>
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
          {/* Customer */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer</p>
            {customer?.full_name && (
              <div className="flex items-center text-sm text-gray-700">
                <User size={13} className="mr-2 text-gray-400" /> {customer.full_name}
              </div>
            )}
            {customer?.email && (
              <div className="flex items-center text-sm text-gray-700">
                <MessageSquare size={13} className="mr-2 text-gray-400" /> {customer.email}
              </div>
            )}
            {customer?.phone && (
              <div className="flex items-center text-sm text-gray-700">
                <MessageCircle size={13} className="mr-2 text-gray-400" /> {customer.phone}
              </div>
            )}
            {order.delivery_address && (
              <div className="flex items-start text-sm text-gray-700">
                <MapPin size={13} className="mr-2 mt-0.5 text-gray-400 flex-shrink-0" />
                {order.delivery_address}
              </div>
            )}
          </div>

          {/* Failure reason */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Failure Details</p>
            {order.issue_reason && (
              <div className="mb-2"><ReasonBadge reason={order.issue_reason} /></div>
            )}
            {order.issue_desc && (
              <p className="text-sm text-gray-600 italic bg-gray-50 px-3 py-2 rounded-lg">"{order.issue_desc}"</p>
            )}
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Items</p>
              <div className="flex gap-3 text-xs">
                <span className="text-green-600 font-medium">
                  {items.filter(i => i.item_delivery_status === 'delivered').length} delivered
                </span>
                <span className="text-red-600 font-medium">
                  {failedItems.length} failed
                </span>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No items on record</p>
            ) : (
              <div className="space-y-2">
                {items.map(item => {
                  const name   = item.products?.product_name || `Item #${item.id}`;
                  const status = item.item_delivery_status || 'pending';
                  const cfg    = ITEM_STATUS[status] || ITEM_STATUS.pending;

                  return (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border ${
                      status === 'failed'    ? 'border-red-200 bg-red-50' :
                      status === 'delivered' ? 'border-green-200 bg-green-50' :
                                              'border-gray-200 bg-white'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Package size={13} className="text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{name}</p>
                          <p className="text-xs text-gray-500">Qty: {item.quantity || 1}</p>
                        </div>
                      </div>

                      {!isResolved ? (
                        <div className="flex gap-1.5">
                          {['delivered', 'failed', 'pending'].map(s => (
                            <button
                              key={s}
                              disabled={updatingItem === item.id || status === s}
                              onClick={() => updateItemStatus(item.id, s)}
                              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                status === s
                                  ? s === 'delivered' ? 'bg-green-600 text-white'
                                  : s === 'failed'    ? 'bg-red-600 text-white'
                                  :                    'bg-gray-600 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {updatingItem === item.id ? '...' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          {!isResolved ? (
            <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
              {customer?.phone && (
                <button
                  onClick={handleSendWhatsApp}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <MessageCircle size={14} />
                  WhatsApp
                </button>
              )}

              {failedItems.length > 0 && (
                <button
                  onClick={handleReschedule}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <CalendarPlus size={14} />
                  Reschedule ({failedItems.length} failed)
                </button>
              )}

              <button
                onClick={handleResolve}
                disabled={resolving}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 ml-auto"
              >
                <CheckCircle size={14} />
                {resolving ? 'Resolving...' : 'Mark Resolved'}
              </button>
            </div>
          ) : (
            <div className="pt-2 border-t border-gray-100 flex justify-end">
              <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-300">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
const IssueManagement = () => {
  const [searchParams]  = useSearchParams();
  const highlightId     = searchParams.get('orderId');

  const [issues,       setIssues]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [selectedIssue,setSelectedIssue]= useState(null);
  const [filter,       setFilter]       = useState('all');

  const fetchIssues = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/orders?issues_only=true&sort=created_desc&include_products=true`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setIssues(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load order issues.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIssues();
    const timer = setInterval(fetchIssues, 15000);
    return () => clearInterval(timer);
  }, [fetchIssues]);

  // Auto-open case if navigated from notification bell
  useEffect(() => {
    if (highlightId && issues.length > 0) {
      const found = issues.find(o => o.id === highlightId);
      if (found) setSelectedIssue(found);
    }
  }, [highlightId, issues]);

  const handleResolved = (orderId) => {
    setIssues(prev => prev.map(o =>
      o.id === orderId ? { ...o, issue_status: 'resolved' } : o
    ));
    setSelectedIssue(null);
  };

  const filteredIssues = issues.filter(i => {
    if (filter === 'pending')  return i.issue_status !== 'resolved';
    if (filter === 'resolved') return i.issue_status === 'resolved';
    return true;
  });

  const pendingCount  = issues.filter(i => i.issue_status !== 'resolved').length;
  const resolvedCount = issues.filter(i => i.issue_status === 'resolved').length;

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
    <div className="bg-gray-50 min-h-screen">
      {selectedIssue && (
        <CaseDetail
          order={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onResolved={handleResolved}
        />
      )}

      <div className="w-full px-4 sm:px-6 py-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="text-red-500" size={20} />
            Order Issues
          </h1>
          <button
            onClick={fetchIssues}
            className="flex items-center px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={13} className="mr-1.5" /> Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Open</p>
              <p className="text-xl font-bold text-gray-900">{pendingCount}</p>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Resolved</p>
              <p className="text-xl font-bold text-gray-900">{resolvedCount}</p>
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

        {/* Filter tabs */}
        <div className="bg-white rounded-lg shadow mb-4">
          <nav className="flex space-x-8 px-6 border-b border-gray-200">
            {[
              { key: 'all',      label: 'All Issues',  count: issues.length   },
              { key: 'pending',  label: 'Open',        count: pendingCount    },
              { key: 'resolved', label: 'Resolved',    count: resolvedCount   },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 ${
                  filter === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    filter === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredIssues.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-400">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No issues found.
                    </td>
                  </tr>
                ) : filteredIssues.map(issue => {
                  const isResolved   = issue.issue_status === 'resolved';
                  const items        = issue.order_products || [];
                  const failedCount  = items.filter(i => i.item_delivery_status === 'failed').length;
                  const isHighlighted = issue.id === highlightId;

                  return (
                    <tr
                      key={issue.id}
                      className={`hover:bg-gray-50 cursor-pointer ${isHighlighted ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelectedIssue(issue)}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-gray-900">
                        {issue.odoo_order_ref || issue.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <User size={13} className="text-gray-400" />
                          <span className="text-sm text-gray-900">{issue.customers?.full_name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {issue.issue_reason
                          ? <ReasonBadge reason={issue.issue_reason} />
                          : <span className="text-sm text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {items.length > 0 ? (
                          <span>
                            {items.length} item{items.length > 1 ? 's' : ''}
                            {failedCount > 0 && (
                              <span className="ml-1 text-red-500 font-medium">({failedCount} failed)</span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {isResolved
                            ? <CheckCircle size={14} className="text-green-600" />
                            : <AlertTriangle size={14} className="text-red-500" />
                          }
                          <span className={`text-sm capitalize ${isResolved ? 'text-green-700' : 'text-red-600'}`}>
                            {isResolved ? 'Resolved' : issue.issue_status || 'Open'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDate(issue.updated_at || issue.created_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button className="flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium">
                          View <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IssueManagement;
