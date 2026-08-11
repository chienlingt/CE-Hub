// client/src/components/order/ManageOrders.js
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  GitBranch,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  Search,
  Sparkles,
  User,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  filterOrdersByDateRange,
  formatDate,
  formatDateTime,
  getOrderStatusBadge,
  getRemainingEditTime,
  getServiceTypeLabel,
  getTotalProductCount,
  isOrderEditable,
  searchOrders
} from '../../utils/orderHelpers';

import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';


export default function ManageOrders() {
  const [searchParams] = useSearchParams();
  const expandRowRefs = useRef({});

  // State management
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editDeadlineHours, setEditDeadlineHours] = useState(24);

  // Filter states
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');

  // UI states
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);

  // Timeslot assignment states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState(null);
  const [availableTimeslots, setAvailableTimeslots] = useState([]);
  const [selectedTimeslot, setSelectedTimeslot] = useState(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');

  // Fetch edit deadline setting
  useEffect(() => {
    fetchEditDeadlineSetting();
  }, []);

  // Fetch orders
  useEffect(() => {
    fetchOrders();
  }, [statusFilter, sortBy]);

  // Auto-expand + scroll when ?expand=<id> is in the URL
  useEffect(() => {
    const targetId = searchParams.get('expand');
    if (!targetId || !orders.length) return;
    setExpandedOrderId(targetId);
    setTimeout(() => {
      const el = expandRowRefs.current[targetId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, [searchParams, orders]);

  const fetchEditDeadlineSetting = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/order_edit_deadline_hours`);
      if (res.ok) {
        const data = await res.json();
        setEditDeadlineHours(parseInt(data.data.value));
      }
    } catch (err) {
      console.error('Failed to fetch edit deadline setting:', err);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.append('sort', sortBy);

      const res = await fetch(`${API_BASE}/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch orders');

      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err.message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  // Apply filters and search
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Search filter
    result = searchOrders(result, searchKeyword);

    // Date range filter
    if (dateRangeFilter !== 'all') {
      result = filterOrdersByDateRange(
        result,
        dateRangeFilter,
        customDateStart ? new Date(customDateStart) : null,
        customDateEnd ? new Date(customDateEnd) : null
      );
    }

    return result;
  }, [orders, searchKeyword, dateRangeFilter, customDateStart, customDateEnd]);

  // Calculate stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return {
      pending: orders.filter(o => o.order_status === 'Pending').length,
      scheduled: orders.filter(o => o.order_status === 'Scheduled').length,
      delivered: orders.filter(o => o.order_status === 'Delivered').length,
      today: orders.filter(o => {
        const created = new Date(o.created_at);
        return created >= today && created < tomorrow;
      }).length
    };
  }, [orders]);

  const handleEdit = (order) => {
    const editCheck = isOrderEditable(order, editDeadlineHours);
    if (!editCheck.editable) {
      alert(`Cannot edit order: ${editCheck.reason}`);
      return;
    }
    setEditingOrder(order);
    setShowEditModal(true);
  };

  // Refresh a single order in-place after remarks are parsed
  const handleOrderParsed = async (orderId) => {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}`);
      if (!res.ok) return;
      const updated = await res.json();
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updated } : o));
    } catch { /* silent — stale data is fine, user can refresh */ }
  };

  const handleView = (orderId) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingOrder(null);
  };

  const handleSaveEdit = async (updatedData) => {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${editingOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update order');
      }

      // Refresh orders
      await fetchOrders();
      handleCloseEditModal();
      alert('Order updated successfully!');
    } catch (err) {
      console.error('Error updating order:', err);
      alert(err.message);
    }
  };

  // Timeslot assignment handlers
  const handleAssignToTimeslot = async (order) => {
    // Only allow assignment for pending orders
    if (order.order_status !== 'Pending') {
      alert('Only pending orders can be assigned to timeslots');
      return;
    }

    setAssigningOrder(order);
    setSelectedTimeslot(null);
    setAssignError('');

    // Fetch available timeslots
    try {
      const res = await fetch(`${API_BASE}/api/time-slots`);
      if (!res.ok) throw new Error('Failed to fetch timeslots');
      const data = await res.json();
      setAvailableTimeslots(Array.isArray(data) ? data : []);
      setShowAssignModal(true);
    } catch (err) {
      console.error('Error fetching timeslots:', err);
      alert('Failed to load timeslots: ' + err.message);
    }
  };

  const handleConfirmAssignment = async () => {
    if (!selectedTimeslot) {
      setAssignError('Please select a timeslot');
      return;
    }

    setAssignLoading(true);
    setAssignError('');

    try {
      const res = await fetch(`${API_BASE}/api/orders/${assigningOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time_slot_id: selectedTimeslot })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to assign order to timeslot');
      }

      // Refresh orders
      await fetchOrders();
      setShowAssignModal(false);
      setAssigningOrder(null);
      setSelectedTimeslot(null);
      alert('Order assigned to timeslot successfully!');
    } catch (err) {
      console.error('Error assigning order:', err);
      setAssignError(err.message);
    } finally {
      setAssignLoading(false);
    }
  };

  const handleCloseAssignModal = () => {
    setShowAssignModal(false);
    setAssigningOrder(null);
    setSelectedTimeslot(null);
    setAssignError('');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage Orders</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Pending Orders"
          value={stats.pending}
          color="yellow"
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard
          title="Scheduled Orders"
          value={stats.scheduled}
          color="blue"
          icon={<Calendar className="w-5 h-5" />}
        />
        <StatCard
          title="Delivered Orders"
          value={stats.delivered}
          color="green"
          icon={<Package className="w-5 h-5" />}
        />
        <StatCard
          title="Orders Today"
          value={stats.today}
          color="purple"
          icon={<Plus className="w-5 h-5" />}
        />
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          {/* Date Range */}
          <select
            value={dateRangeFilter}
            onChange={(e) => setDateRangeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="created_desc">Latest First</option>
            <option value="created_asc">Oldest First</option>
            <option value="scheduled_desc">Scheduled (Latest)</option>
            <option value="scheduled_asc">Scheduled (Earliest)</option>
            <option value="customer">Customer Name</option>
          </select>
        </div>

        {/* Custom Date Range */}
        {dateRangeFilter === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={customDateStart}
                onChange={(e) => setCustomDateStart(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={customDateEnd}
                onChange={(e) => setCustomDateEnd(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-36" />
            <col />
            <col className="w-16" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-44" />
            <col className="w-28" />
          </colgroup>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Order #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Items
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Preferred
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Scheduled (MYT)
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                  No orders found
                </td>
              </tr>
              ) : (
                filteredOrders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    allOrders={orders}
                    isExpanded={expandedOrderId === order.id}
                    rowRef={el => { expandRowRefs.current[order.id] = el; }}
                    onView={handleView}
                    onEdit={handleEdit}
                    onAssignTimeslot={handleAssignToTimeslot}
                    onOrderParsed={handleOrderParsed}
                    editDeadlineHours={editDeadlineHours}
                  />
                ))
              )}
            </tbody>
          </table>
      </div>

      {/* Edit Modal */}
      {showEditModal && editingOrder && (
        <EditOrderModal
          order={editingOrder}
          onClose={handleCloseEditModal}
          onSave={handleSaveEdit}
          editDeadlineHours={editDeadlineHours}
        />
      )}

      {/* Assign Timeslot Modal */}
      {showAssignModal && assigningOrder && (
        <AssignTimeslotModal
          order={assigningOrder}
          timeslots={availableTimeslots}
          selectedTimeslot={selectedTimeslot}
          onSelectTimeslot={setSelectedTimeslot}
          onConfirm={handleConfirmAssignment}
          onClose={handleCloseAssignModal}
          loading={assignLoading}
          error={assignError}
        />
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, color, icon }) {
  const colorClasses = {
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200'
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
        </div>
        <div className="opacity-60">{icon}</div>
      </div>
    </div>
  );
}

// Order Row Component (with expandable details)
function OrderRow({ order, allOrders, isExpanded, rowRef, onView, onEdit, onAssignTimeslot, onOrderParsed, editDeadlineHours }) {
  const statusBadge = getOrderStatusBadge(order.order_status);
  const editCheck = isOrderEditable(order, editDeadlineHours);
  const productCount = getTotalProductCount(order.order_products);
  const isPending = order.order_status === 'Pending';

  // Sibling DOs: other orders sharing the same SO reference
  const siblingDOs = order.odoo_sales_ref
    ? allOrders.filter(o => o.id !== order.id && o.odoo_sales_ref === order.odoo_sales_ref)
    : [];

  return (
    <>
      <tr ref={rowRef} className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-sm font-medium text-gray-900 truncate" title={order.odoo_order_ref || 'Not Synced'}>
          <div className="truncate">{order.odoo_order_ref || 'Not Synced'}</div>
          {siblingDOs.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-indigo-500">
              <GitBranch className="w-3 h-3" />
              <span className="truncate">{order.odoo_sales_ref}</span>
            </div>
          )}
        </td>
        <td className="px-4 py-3 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {order.customers?.full_name || 'N/A'}
          </div>
          <div className="text-xs text-gray-400 truncate">{order.customers?.phone || ''}</div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {productCount}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadge.bgColor} ${statusBadge.color}`}>
            {statusBadge.label}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
          {formatDate(order.created_at)}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
          {order.preferred_delivery_time_start
            ? `${order.preferred_delivery_time_start}–${order.preferred_delivery_time_end || ''}`
            : '-'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
          {order.scheduled_start_date_time ? formatDateTime(order.scheduled_start_date_time) : '-'}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
          <button
            onClick={() => onView(order.id)}
            className="text-blue-600 hover:text-blue-900 mr-3"
            title="View Details"
          >
            {isExpanded ? <ChevronUp className="w-5 h-5 inline" /> : <ChevronDown className="w-5 h-5 inline" />}
          </button>
          {isPending && (
            <button
              onClick={() => onAssignTimeslot(order)}
              className="text-purple-600 hover:text-purple-900 mr-3"
              title="Assign to Timeslot"
            >
              <Calendar className="w-5 h-5 inline" />
            </button>
          )}
          <button
            onClick={() => onEdit(order)}
            disabled={!editCheck.editable}
            className={`${
              editCheck.editable
                ? 'text-green-600 hover:text-green-900'
                : 'text-gray-400 cursor-not-allowed'
            }`}
            title={editCheck.editable ? 'Edit Order' : editCheck.reason}
          >
            <Edit2 className="w-5 h-5 inline" />
          </button>
        </td>
      </tr>
      {isExpanded && <ExpandedOrderDetails order={order} siblingDOs={siblingDOs} onOrderParsed={onOrderParsed} />}
    </>
  );
}

// Expanded Order Details Component
function ExpandedOrderDetails({ order, siblingDOs = [], onOrderParsed }) {
  const [showSiblings, setShowSiblings] = useState(false);
  const [parseStatus, setParseStatus] = useState('idle'); // 'idle' | 'parsing' | 'done' | 'error'

  // Auto-parse remarks on expand if remarks exist and not yet parsed
  useEffect(() => {
    if (!order.delivery_remarks) return;
    if (order.remarks_delivery_address !== null && order.remarks_delivery_address !== undefined) return;
    if (parseStatus !== 'idle') return;

    const run = async () => {
      setParseStatus('parsing');
      try {
        const parseRes = await fetch(`${API_BASE}/api/orders/${order.id}/parse-remarks`, { method: 'POST' });
        const parseData = await parseRes.json();
        if (!parseData.success) throw new Error(parseData.error || 'Parse failed');

        const { parsed } = parseData;
        const applyRes = await fetch(`${API_BASE}/api/orders/${order.id}/apply-parsed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Only pass values the LLM actually found in the remarks — never fall back to SO defaults
            delivery_address: parsed.has_address ? parsed.delivery_address : null,
            phone:            parsed.has_phone   ? parsed.phone            : null,
            contact_name:     parsed.contact_name  || null,
            driver_notes:     parsed.driver_notes  || null,
          }),
        });
        const applyData = await applyRes.json();
        if (!applyData.success) throw new Error(applyData.error || 'Apply failed');

        setParseStatus('done');
        onOrderParsed?.(order.id);
      } catch (err) {
        console.error('[ParseRemarks] auto-parse failed:', err);
        setParseStatus('error');
      }
    };

    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeAddress = order.remarks_delivery_address || order.delivery_address;
  const cityLine = [order.delivery_city, order.delivery_state, order.delivery_postcode].filter(Boolean).join(', ');
  const prefTime = order.customers?.preferred_delivery_time_start
    ? `${order.customers.preferred_delivery_time_start}–${order.customers.preferred_delivery_time_end || ''}`
    : null;

  return (
    <tr>
      <td colSpan="8" className="px-5 py-4 bg-gray-50 border-t border-gray-100">

        {/* ── Chips row ── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {order.odoo_order_ref && (
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1 text-xs font-mono font-semibold">
              <Package className="w-3 h-3" />
              {order.odoo_order_ref}
            </span>
          )}

          {/* SO chip — clickable when siblings exist */}
          {order.odoo_sales_ref && (
            <button
              onClick={() => siblingDOs.length > 0 && setShowSiblings(s => !s)}
              className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs font-mono font-semibold transition-colors
                ${siblingDOs.length > 0
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 cursor-pointer'
                  : 'bg-gray-50 text-gray-500 border-gray-200 cursor-default'}`}
            >
              <GitBranch className="w-3 h-3" />
              {order.odoo_sales_ref}
              {siblingDOs.length > 0 && (
                <>
                  <span className="bg-indigo-200 text-indigo-800 rounded-full px-1.5 py-0.5 text-xs font-sans">
                    {siblingDOs.length + 1} DOs
                  </span>
                  {showSiblings
                    ? <ChevronUp className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />}
                </>
              )}
            </button>
          )}

          {prefTime && (
            <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1 text-xs font-semibold">
              <Clock className="w-3 h-3" />
              {prefTime}
            </span>
          )}

          {/* Parse status chip */}
          {parseStatus === 'parsing' && (
            <span className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-600 border border-violet-200 rounded-full px-3 py-1 text-xs font-semibold">
              <Loader2 className="w-3 h-3 animate-spin" />
              Parsing remarks…
            </span>
          )}
          {parseStatus === 'done' && (
            <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-600 border border-green-200 rounded-full px-3 py-1 text-xs font-semibold">
              <Sparkles className="w-3 h-3" />
              Remarks parsed
            </span>
          )}
          {parseStatus === 'error' && (
            <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-500 border border-red-200 rounded-full px-3 py-1 text-xs font-semibold">
              <AlertCircle className="w-3 h-3" />
              Parse failed
            </span>
          )}
        </div>

        {/* ── Sibling DOs table (toggled by SO chip) ── */}
        {showSiblings && (
          <div className="mb-4 overflow-x-auto rounded border border-indigo-100">
            <table className="w-full text-sm">
              <thead className="bg-indigo-50 text-indigo-600 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">DO</th>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-center font-medium w-14">Items</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Scheduled</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-indigo-50">
                {/* Current DO */}
                <tr className="bg-indigo-50/40">
                  <td className="px-3 py-1.5 font-mono text-indigo-800 font-semibold">
                    {order.odoo_order_ref || 'Not Synced'}
                    <span className="ml-1.5 text-xs bg-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded font-sans">this</span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-700">{order.customers?.full_name || '—'}</td>
                  <td className="px-3 py-1.5 text-center text-gray-700">{getTotalProductCount(order.order_products)}</td>
                  <td className="px-3 py-1.5">
                    {(() => { const b = getOrderStatusBadge(order.order_status); return (
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${b.bgColor} ${b.color}`}>{b.label}</span>
                    ); })()}
                  </td>
                  <td className="px-3 py-1.5 text-gray-700">
                    {order.scheduled_start_date_time ? formatDateTime(order.scheduled_start_date_time) : '—'}
                  </td>
                </tr>
                {/* Siblings */}
                {siblingDOs.map(sib => {
                  const b = getOrderStatusBadge(sib.order_status);
                  return (
                    <tr key={sib.id} className="hover:bg-indigo-50/30">
                      <td className="px-3 py-1.5">
                        <Link
                          to={`?expand=${sib.id}`}
                          className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          {sib.odoo_order_ref || 'Not Synced'}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-gray-700">{sib.customers?.full_name || '—'}</td>
                      <td className="px-3 py-1.5 text-center text-gray-700">{getTotalProductCount(sib.order_products)}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${b.bgColor} ${b.color}`}>{b.label}</span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-700">
                        {sib.scheduled_start_date_time ? formatDateTime(sib.scheduled_start_date_time) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Customer / Address ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-sm">

          {/* Customer */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="font-semibold text-gray-900">{order.customers?.full_name || '—'}</span>
            </div>
            {order.customers?.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                <span className="text-gray-500">{order.customers.email}</span>
              </div>
            )}
            {order.customers?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                <span className="text-gray-500">{order.customers.phone}</span>
              </div>
            )}

            {/* Parsed site contact — visually separated from customer's own phone */}
            {order.remarks_contact_phone && (
              <div className="mt-2 pt-2 border-t border-violet-100">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                  <span className="font-semibold text-gray-900">{order.remarks_contact_phone}</span>
                  {order.remarks_contact_name && (
                    <span className="text-gray-600">· {order.remarks_contact_name}</span>
                  )}
                </div>
                <p className="text-xs text-violet-500 mt-0.5 ml-5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> site contact from remarks
                </p>
              </div>
            )}

            {(order.salesperson_name || order.salesperson_phone) && (
              <div className="pt-2 mt-1 border-t border-gray-100 space-y-1">
                {order.salesperson_name && (
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-gray-200 shrink-0" />
                    <span className="text-gray-400 text-xs">{order.salesperson_name}</span>
                    <span className="text-xs text-gray-300">· sales</span>
                  </div>
                )}
                {order.salesperson_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-gray-200 shrink-0" />
                    <span className="text-gray-400 text-xs">{order.salesperson_phone}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Address */}
          <div className="space-y-2 text-sm">
            {parseStatus === 'parsing' ? (
              <div className="flex items-center gap-2 text-violet-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="text-xs">Extracting address from remarks…</span>
              </div>
            ) : order.remarks_delivery_address && order.original_delivery_address &&
                order.original_delivery_address !== order.remarks_delivery_address ? (
              /* ── Overridden: parsed card + struck original ── */
              <>
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 space-y-0.5">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-900">{order.remarks_delivery_address}</p>
                      {cityLine && <p className="text-gray-500 text-xs">{cityLine}</p>}
                    </div>
                  </div>
                  <p className="text-gray-600 line-through text-xs ml-5 leading-snug">
                    {order.original_delivery_address}
                  </p>
                </div>
                {order.delivery_remarks && (
                  <p className="text-gray-400 text-xs italic ml-1">{order.delivery_remarks}</p>
                )}
              </>
            ) : (
              /* ── Not overridden: plain address ── */
              <>
                {activeAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-gray-900">{activeAddress}</p>
                      {cityLine && <p className="text-gray-500 text-xs">{cityLine}</p>}
                    </div>
                  </div>
                )}
                {order.delivery_remarks && (
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-violet-300 shrink-0 mt-0.5" />
                    <p className="text-gray-400 text-xs italic">{order.delivery_remarks}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Items ── */}
        {order.order_products?.length > 0 && (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full text-sm">
              <tbody className="bg-white divide-y divide-gray-100">
                {order.order_products.map((op, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-800">
                      {op.products?.product_name || op.odoo_product_name || '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-right w-12 shrink-0">×{op.quantity}</td>
                    <td className="px-3 py-2 font-mono text-gray-400 text-right">{op.assigned_serial || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </td>
    </tr>
  );
}

// Edit Order Modal Component - Full editing capabilities
function EditOrderModal({ order, onClose, onSave, editDeadlineHours }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [resetToPending, setResetToPending] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const hasParsedPhone   = !!order.remarks_contact_phone;
  const hasParsedAddress = !!order.remarks_delivery_address;

  const [editPhone,   setEditPhone]   = useState(order.remarks_contact_phone   || order.customers?.phone   || '');
  const [editAddress, setEditAddress] = useState(order.remarks_delivery_address || order.delivery_address   || order.customers?.address || '');

  const validate = (data, phone) => {
    const errors = {};
    if (!data.full_name) errors.full_name = 'Full name is required.';
    if (!phone)          errors.phone     = 'Phone is required.';
    return errors;
  };

  const handleCustomerDataChange = (e) => {
    const { name, value } = e.target;
    setCustomerData(prev => {
        const newData = { ...prev, [name]: value };
        const errors = validate(newData, editPhone);
        setFormErrors(errors);
        return newData;
    });
  };

  // Customer info (editable)
  const [customerData, setCustomerData] = useState({
    full_name: order.customers?.full_name || '',
    email:     order.customers?.email     || '',
    phone:     order.customers?.phone     || '',
    address:   order.customers?.address   || '',
    city:      order.customers?.city      || '',
    state:     order.customers?.state     || '',
    postcode:  order.customers?.postcode  || '',
  });

  const remainingTime = order.scheduled_start_date_time
    ? getRemainingEditTime(order.scheduled_start_date_time, editDeadlineHours)
    : null;

  useEffect(() => { setLoading(false); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validate(customerData, editPhone);
    if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        setError('Please fill in all required customer fields.');
        return;
    }

    setSaving(true);
    setError(null);

    try {
      const updateData = {};

      if (resetToPending) {
        updateData.order_status = 'Pending';
        updateData.scheduled_start_date_time = null;
        updateData.scheduled_end_date_time = null;
        updateData.time_slot_id = null;
        updateData.truck_loading_sequence = null;
        updateData.notified_scheduled = false;
      }

      // Parsed phone/address go to the order; originals go to the customer record
      if (hasParsedPhone) {
        updateData.remarks_contact_phone = editPhone;
      }
      if (hasParsedAddress) {
        updateData.remarks_delivery_address = editAddress;
        updateData.delivery_address         = editAddress;
      } else {
        updateData.delivery_address = editAddress;
      }

      // Build customer payload — only write phone/address to customer when not overridden by parsed values
      const customerPayload = {
        ...customerData,
        phone:   hasParsedPhone   ? customerData.phone   : editPhone,
        address: hasParsedAddress ? customerData.address : editAddress,
      };

      // First update customer
      await fetch(`${API_BASE}/api/customers/${order.customer_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerPayload)
      });

      // Then update order
      await onSave(updateData);
    } catch (err) {
      console.error('Error saving order:', err);
      setError(err.message || 'Failed to save changes');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-full w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Edit Order</h2>
            {order.odoo_order_ref ? (
              <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                <p>DO: <span className="font-mono font-medium">{order.odoo_order_ref}</span></p>
                {order.odoo_sales_ref && <p>SO: <span className="font-mono font-medium">{order.odoo_sales_ref}</span></p>}
              </div>
            ) : (
              <p className="text-sm text-gray-600 mt-1">Order Ref: Not Synced</p>
            )}
            {remainingTime && !remainingTime.expired && (
              <p className="text-sm text-green-600 mt-1">
                Time remaining: {remainingTime.hours}h {remainingTime.minutes}m
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {/* Customer info */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                type="text"
                name="full_name"
                value={customerData.full_name}
                onChange={handleCustomerDataChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                required
              />
              {formErrors.full_name && <p className="text-xs text-red-500 mt-1">{formErrors.full_name}</p>}
            </div>
            <div>
              <label className="flex text-sm font-medium text-gray-700 mb-1 items-center gap-1.5">
                {hasParsedPhone ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                    <span className="text-violet-700">Site Contact Phone</span>
                    <span className="text-gray-400 font-normal text-xs">(from remarks)</span>
                    <span className="text-red-500">*</span>
                  </>
                ) : 'Phone *'}
              </label>
              <input
                type="tel"
                value={editPhone}
                onChange={e => {
                  setEditPhone(e.target.value);
                  setFormErrors(prev => {
                    const next = { ...prev };
                    if (e.target.value) delete next.phone;
                    else next.phone = 'Phone is required.';
                    return next;
                  });
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 text-sm ${
                  hasParsedPhone
                    ? 'border-violet-300 focus:ring-violet-500 bg-violet-50'
                    : 'border-gray-300 focus:ring-blue-500'
                }`}
                required
              />
              {formErrors.phone && <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>}
            </div>
            <div>
              <label className="flex text-sm font-medium text-gray-700 mb-1 items-center gap-1.5">
                {hasParsedAddress ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                    <span className="text-violet-700">Delivery Address</span>
                    <span className="text-gray-400 font-normal text-xs">(from remarks)</span>
                  </>
                ) : 'Address'}
              </label>
              <textarea
                value={editAddress}
                onChange={e => setEditAddress(e.target.value)}
                rows={2}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 text-sm ${
                  hasParsedAddress
                    ? 'border-violet-300 focus:ring-violet-500 bg-violet-50'
                    : 'border-gray-300 focus:ring-blue-500'
                }`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  name="city"
                  value={customerData.city}
                  onChange={handleCustomerDataChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                <input
                  type="text"
                  name="postcode"
                  value={customerData.postcode}
                  onChange={handleCustomerDataChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Reset scheduling */}
          <div className="mt-6">
            <label className="inline-flex items-center text-sm text-gray-700">
              <input
                type="checkbox"
                checked={resetToPending}
                onChange={(e) => setResetToPending(e.target.checked)}
                className="mr-2"
              />
              Reset to Pending (clear scheduled times)
            </label>
            <p className="text-xs text-gray-500 mt-1">
              This will clear scheduled start/end times and allow the order to be rescheduled.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || Object.keys(formErrors).length > 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Assign Timeslot Modal Component
function AssignTimeslotModal({ order, timeslots, selectedTimeslot, onSelectTimeslot, onConfirm, onClose, loading, error }) {
  // Group timeslots by date
  const groupedTimeslots = useMemo(() => {
    const groups = {};
    timeslots.forEach(ts => {
      const date = ts.date || 'Unknown';
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(ts);
    });
    return groups;
  }, [timeslots]);

  const formatTimeWindow = (start, end) => {
    if (!start || !end) return 'Time not specified';
    return `${start} - ${end}`;
  };

  const isTimeslotAvailable = (timeslot) => {
    return timeslot.available_flag !== false;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Assign Order to Timeslot</h2>
            <p className="text-sm text-gray-600 mt-1">
              Order Ref: {order.odoo_order_ref || 'Not Synced'} • Customer: {order.customers?.full_name || 'N/A'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {/* Order Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">Order Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Customer:</span>
                <span className="ml-2 font-medium">{order.customers?.full_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">Building:</span>
                <span className="ml-2 font-medium">{order.buildings?.building_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">Products:</span>
                <span className="ml-2 font-medium">{getTotalProductCount(order.order_products)} items</span>
              </div>
              <div>
                <span className="text-gray-600">Status:</span>
                <span className="ml-2 font-medium">{order.order_status}</span>
              </div>
            </div>
          </div>

          {/* Timeslots Selection */}
          <h3 className="font-semibold text-gray-800 mb-3">Select Delivery Timeslot</h3>
          {Object.keys(groupedTimeslots).length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">No timeslots available</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {Object.entries(groupedTimeslots).map(([date, slots]) => (
                <div key={date} className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {date}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {slots.map((timeslot) => {
                      const available = isTimeslotAvailable(timeslot);
                      const isSelected = selectedTimeslot === timeslot.id;

                      return (
                        <button
                          key={timeslot.id}
                          type="button"
                          onClick={() => available && onSelectTimeslot(timeslot.id)}
                          disabled={!available}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            isSelected
                              ? 'border-purple-500 bg-purple-50'
                              : available
                              ? 'border-gray-200 hover:border-purple-300 bg-white'
                              : 'border-gray-200 bg-gray-100 cursor-not-allowed opacity-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-gray-600" />
                              <span className="font-medium text-sm">
                                {formatTimeWindow(timeslot.time_window_start, timeslot.time_window_end)}
                              </span>
                            </div>
                            {isSelected && (
                              <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </div>
                          {!available && (
                            <p className="text-xs text-red-600 mt-1">Not available</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!selectedTimeslot || loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Assigning...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  Assign to Timeslot
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
