import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CalendarPlus,
  CheckCircle,
  ChevronRight,
  FileText,
  Image,
  MapPin,
  MessageCircle,
  Package, RefreshCw,
  Search,
  User,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
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

// FR-06-003 — Odoo chatter post outcome badges
const CHATTER_STATUS = {
  posted:  { label: 'Posted to Odoo Chatter',        cls: 'bg-green-100 text-green-700' },
  failed:  { label: 'Failed to post',                cls: 'bg-red-100 text-red-700'     },
  skipped: { label: 'Skipped — Odoo not configured', cls: 'bg-gray-100 text-gray-600'   },
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

// "Resolved" badge — hover reveals who resolved it and when (audit trail)
function ResolvedBadge({ resolvedByName, resolvedAt, children }) {
  const hasAudit = resolvedByName || resolvedAt;
  return (
    <span className="relative group inline-flex">
      {children}
      {hasAudit && (
        <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-50
                         hidden group-hover:flex flex-col
                         bg-gray-900 text-white text-xs rounded-lg shadow-xl px-2.5 py-2
                         min-w-[160px] max-w-[240px] whitespace-nowrap">
          <span className="font-semibold">Resolved{resolvedByName ? ` by ${resolvedByName}` : ''}</span>
          {resolvedAt && <span className="text-gray-300 mt-0.5">{formatDate(resolvedAt)}</span>}
          <span className="absolute top-full left-3 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}

function SortTh({ children, field, sort, onSort, className = '' }) {
  const active = sort.field === field;
  const Icon   = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-4 py-3 text-left cursor-pointer select-none hover:bg-gray-100 transition-colors group ${className}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
        {children}
        <Icon size={12} className={active ? 'text-blue-500' : 'text-gray-300 group-hover:text-gray-400'} />
      </div>
    </th>
  );
}

// Evidence photos a driver uploads when marking an order as failed (issue_evidence)
function EvidenceThumbnails({ evidence = [] }) {
  if (!evidence.length) return null;
  function mediaUrl(path) {
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    return `${API_BASE.replace(/\/$/, '')}${path}`;
  }
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
        <Image size={12} className="text-gray-400" />
        {evidence.length} photo{evidence.length !== 1 ? 's' : ''}
      </div>
      <div className="flex flex-wrap gap-2">
        {evidence.map((url, i) => (
          <a key={i} href={mediaUrl(url)} target="_blank" rel="noopener noreferrer">
            <img
              src={mediaUrl(url)}
              alt={`evidence-${i}`}
              className="w-16 h-16 object-cover rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Case Detail Modal ─────────────────────────────────────────────────────────
function CaseDetail({ order, onClose, onResolved, onItemUpdated }) {
  const navigate    = useNavigate();
  const { employeeData } = useAuth();
  const [items,     setItems]     = useState(order.order_products || []);
  const [resolving, setResolving] = useState(false);
  const [updatingItem, setUpdatingItem] = useState(null);
  const [chatterLog,     setChatterLog]     = useState([]);
  const [chatterLoading, setChatterLoading] = useState(true);

  const isResolved = order.issue_status === 'resolved';
  const customer   = order.customers;
  const orderRef   = order.odoo_order_ref || 'Not Synced';
  const failedItems = items.filter(i => i.item_delivery_status === 'failed');

  // FR-06-003 — load Odoo chatter post history for this order
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/orders/${order.id}/odoo-chatter-log`)
      .then(res => res.ok ? res.json() : [])
      .then(data => { if (active) setChatterLog(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setChatterLog([]); })
      .finally(() => { if (active) setChatterLoading(false); });
    return () => { active = false; };
  }, [order.id]);

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
      onItemUpdated?.(order.id, itemId, status);
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
        body: JSON.stringify({ issue_status: 'resolved', resolved_by: employeeData?.id || null }),
      });
      if (!res.ok) throw new Error('Failed');
      const resolvedByName = employeeData?.display_name || employeeData?.name || null;
      onResolved(order.id, resolvedByName);
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

  const deliveredCount = items.filter(i => i.item_delivery_status === 'delivered').length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center bg-black/40 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg sm:mt-10 sm:mb-10">

        {/* Header */}
        <div className={`px-4 sm:px-5 py-3 sm:rounded-t-2xl flex items-center justify-between border-b gap-2 ${
          isResolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle size={16} className={`shrink-0 ${isResolved ? 'text-green-600' : 'text-red-600'}`} />
            <h2 className="text-sm font-bold text-gray-900 truncate">{orderRef}</h2>
            {isResolved ? (
              <ResolvedBadge resolvedByName={order.resolved_by_name} resolvedAt={order.resolved_at}>
                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full cursor-default">
                  <CheckCircle size={10} /> Resolved
                </span>
              </ResolvedBadge>
            ) : order.issue_reason ? (
              <span className="shrink-0"><ReasonBadge reason={order.issue_reason} /></span>
            ) : null}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Customer + meta */}
          <div className="bg-gray-50 rounded-xl p-3.5 space-y-1.5 text-sm">
            {customer?.full_name && (
              <div className="flex items-center gap-2 text-gray-800 font-medium">
                <User size={13} className="text-gray-400 shrink-0" />
                <span className="truncate">{customer.full_name}</span>
              </div>
            )}
            {customer?.phone && (
              <div className="flex items-center gap-2 text-gray-600">
                <MessageCircle size={13} className="text-gray-400 shrink-0" /> {customer.phone}
              </div>
            )}
            {order.delivery_address && (
              <div className="flex items-start gap-2 text-gray-600">
                <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{order.delivery_address}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-gray-400 text-xs pt-0.5">
              <Calendar size={11} className="shrink-0" /> {formatDate(order.issue_reported_at || order.created_at)}
            </div>
          </div>

          {/* Failure note */}
          {order.issue_desc && (
            <p className="text-sm text-gray-600 italic bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg">
              "{order.issue_desc}"
            </p>
          )}

          {/* Evidence photos — uploaded by driver when marking the order as failed */}
          <EvidenceThumbnails evidence={order.issue_evidence} />

          {/* Reschedule link — replacement order created from this case, if any */}
          {Array.isArray(order.rescheduled_to) && order.rescheduled_to.length > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 flex-wrap">
              <CalendarPlus size={13} className="shrink-0" />
              {order.rescheduled_to.map(r => (
                <span key={r.id}>
                  Rescheduled to <span className="font-semibold">{r.odoo_order_ref || 'Not Synced'}</span>
                  <span className="text-blue-400"> · {r.order_status || 'Pending'}</span>
                </span>
              ))}
            </div>
          )}

          {/* Odoo Chatter (FR-06-003) */}
          {/*<div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Odoo Chatter</p>
            {chatterLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : chatterLog.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No chatter post recorded yet.</p>
            ) : (() => {
              const latest = chatterLog[0];
              const cfg = CHATTER_STATUS[latest.status] || { label: latest.status, cls: 'bg-gray-100 text-gray-600' };
              const d = latest.payload?.details;
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(latest.created_at)}</span>
                  </div>
                  {latest.last_error && (
                    <p className="text-xs text-red-600">{latest.last_error}</p>
                  )}
                  {d && (
                    <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1">
                      <p><span className="font-medium text-gray-500">Customer:</span> {d.customerName}</p>
                      <p><span className="font-medium text-gray-500">Address:</span> {d.address}</p>
                      <p><span className="font-medium text-gray-500">Driver:</span> {d.driverName}</p>
                      <p><span className="font-medium text-gray-500">Failure Reason:</span> {d.failureReason}</p>
                      <p><span className="font-medium text-gray-500">Details:</span> {d.failureDesc || 'None provided'}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div> */}

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
              {items.length > 0 && (
                <span className="flex gap-2">
                  <span className="text-green-600 font-medium">{deliveredCount} delivered</span>
                  <span className="text-red-600 font-medium">{failedItems.length} failed</span>
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No items on record</p>
            ) : (
              <div className="space-y-2">
                {items.map(item => {
                  const name   = item.products?.product_name || item.odoo_product_name || `Item #${item.id}`;
                  const status = item.item_delivery_status || 'pending';
                  const cfg    = ITEM_STATUS[status] || ITEM_STATUS.pending;

                  return (
                    <div key={item.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl border ${
                      status === 'failed'    ? 'border-red-200 bg-red-50' :
                      status === 'delivered' ? 'border-green-200 bg-green-50' :
                                              'border-gray-200 bg-white'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Package size={13} className="text-gray-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-800 truncate">{name}</span>
                        <span className="text-xs text-gray-400 shrink-0">×{item.quantity || 1}</span>
                      </div>

                      {!isResolved ? (
                        <div className="flex gap-1.5 shrink-0">
                          {['delivered', 'failed'].map(s => (
                            <button
                              key={s}
                              disabled={updatingItem === item.id || status === s}
                              onClick={() => updateItemStatus(item.id, s)}
                              className={`flex-1 sm:flex-initial px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                status === s
                                  ? s === 'delivered' ? 'bg-green-600 text-white'
                                                      : 'bg-red-600 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {updatingItem === item.id ? '...' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>
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
          {!isResolved && (
            <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-gray-100">
              {customer?.phone && (
                <button
                  onClick={handleSendWhatsApp}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <MessageCircle size={14} />
                  WhatsApp
                </button>
              )}

              {failedItems.length > 0 && (
                <button
                  onClick={handleReschedule}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <CalendarPlus size={14} />
                  Reschedule
                </button>
              )}

              <button
                onClick={handleResolve}
                disabled={resolving}
                className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 sm:ml-auto"
              >
                <CheckCircle size={14} />
                {resolving ? 'Resolving…' : 'Resolve'}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId     = searchParams.get('orderId');

  const [issues,       setIssues]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [selectedIssue,setSelectedIssue]= useState(null);
  const [filter,       setFilter]       = useState('all');
  const [search,       setSearch]       = useState('');
  const [sort,         setSort]         = useState({ field: 'date', dir: 'desc' });
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');

  const handleSort = (field) =>
    setSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' });

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

  // Auto-open case if navigated from notification bell. The orderId param is
  // cleared immediately after opening — otherwise the 15s poll keeps updating
  // `issues`, which re-runs this effect and reopens the modal even after the
  // admin has already closed it.
  useEffect(() => {
    if (highlightId && issues.length > 0) {
      const found = issues.find(o => o.id === highlightId);
      if (found) {
        setSelectedIssue(found);
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('orderId');
          return next;
        }, { replace: true });
      }
    }
  }, [highlightId, issues, setSearchParams]);

  const handleResolved = (orderId, resolvedByName) => {
    setIssues(prev => prev.map(o =>
      o.id === orderId ? { ...o, issue_status: 'resolved', resolved_by_name: resolvedByName, resolved_at: new Date().toISOString() } : o
    ));
    setSelectedIssue(null);
  };

  // Keep the table's failed/delivered counts in sync the instant an item's
  // status is saved inside the modal, instead of waiting for the next poll.
  const handleItemUpdated = (orderId, itemId, status) => {
    setIssues(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      return {
        ...o,
        order_products: (o.order_products || []).map(p =>
          p.id === itemId ? { ...p, item_delivery_status: status } : p
        ),
      };
    }));
  };

  const filteredIssues = useMemo(() => {
    let list = issues.filter(i => {
      if (filter === 'pending')  return i.issue_status !== 'resolved';
      if (filter === 'resolved') return i.issue_status === 'resolved';
      return true;
    });

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(i => {
        const ref      = (i.odoo_order_ref || 'Not Synced').toLowerCase();
        const customer = (i.customers?.full_name || '').toLowerCase();
        const reason   = (i.issue_reason || '').toLowerCase();
        return ref.includes(s) || customer.includes(s) || reason.includes(s);
      });
    }

    // Date filter — "From" only = that single day; both = a range
    // Based on issue_reported_at (when the failure was reported), not
    // updated_at, so later edits/resolves never move an order in/out of range.
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      list = list.filter(i => new Date(i.issue_reported_at || i.created_at) >= from);
    }
    if (dateTo || dateFrom) {
      const to = new Date(dateTo || dateFrom);
      to.setHours(23, 59, 59, 999);
      list = list.filter(i => new Date(i.issue_reported_at || i.created_at) <= to);
    }

    return [...list].sort((a, b) => {
      if (sort.field === 'status') {
        const va = a.issue_status === 'resolved' ? 1 : 0;
        const vb = b.issue_status === 'resolved' ? 1 : 0;
        return sort.dir === 'asc' ? va - vb : vb - va;
      }
      if (sort.field === 'date') {
        const va = new Date(a.issue_reported_at || a.created_at).getTime();
        const vb = new Date(b.issue_reported_at || b.created_at).getTime();
        return sort.dir === 'asc' ? va - vb : vb - va;
      }
      let va, vb;
      if (sort.field === 'order')         { va = a.odoo_order_ref || 'Not Synced'; vb = b.odoo_order_ref || 'Not Synced'; }
      else if (sort.field === 'customer') { va = a.customers?.full_name || ''; vb = b.customers?.full_name || ''; }
      else if (sort.field === 'reason')   { va = a.issue_reason || ''; vb = b.issue_reason || ''; }
      else return 0;
      const c = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === 'asc' ? c : -c;
    });
  }, [issues, filter, search, sort, dateFrom, dateTo]);

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
          onItemUpdated={handleItemUpdated}
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

        {/* Search + date filter */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search order, customer or reason…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              title="From date (leave 'To' blank to filter a single day)"
              className="px-2.5 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-gray-700"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              title="To date"
              className="px-2.5 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-gray-700"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                title="Clear date filter"
                className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              >
                <X size={14} />
              </button>
            )}
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
                  <SortTh field="order"    sort={sort} onSort={handleSort}>Order</SortTh>
                  <SortTh field="customer" sort={sort} onSort={handleSort}>Customer</SortTh>
                  <SortTh field="reason"   sort={sort} onSort={handleSort}>Reason</SortTh>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                  <SortTh field="status"   sort={sort} onSort={handleSort}>Status</SortTh>
                  <SortTh field="date"     sort={sort} onSort={handleSort}>Date</SortTh>
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
                        {issue.odoo_order_ref || 'Not Synced'}
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
                        {isResolved ? (
                          <ResolvedBadge resolvedByName={issue.resolved_by_name} resolvedAt={issue.resolved_at}>
                            <div className="flex items-center gap-1.5 cursor-default">
                              <CheckCircle size={14} className="text-green-600" />
                              <span className="text-sm capitalize text-green-700">Resolved</span>
                            </div>
                          </ResolvedBadge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle size={14} className="text-red-500" />
                            <span className="text-sm capitalize text-red-600">{issue.issue_status || 'Open'}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDate(issue.issue_reported_at || issue.created_at)}
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
