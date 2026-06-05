// client/src/components/order/ManageOrders.js
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  MapPin,
  Package,
  Plus,
  Search,
  User,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

// const API_BASE = process.env.REACT_APP_API_BASE_URL || window.location.origin.replace(/:\d+$/, ':4000');
const REACT_APP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

export default function ManageOrders() {
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
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Products
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Scheduled
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    No orders found
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    isExpanded={expandedOrderId === order.id}
                    onView={handleView}
                    onEdit={handleEdit}
                    onAssignTimeslot={handleAssignToTimeslot}
                    editDeadlineHours={editDeadlineHours}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
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
function OrderRow({ order, isExpanded, onView, onEdit, onAssignTimeslot, editDeadlineHours }) {
  const statusBadge = getOrderStatusBadge(order.order_status);
  const editCheck = isOrderEditable(order, editDeadlineHours);
  const productCount = getTotalProductCount(order.order_products);
  const isPending = order.order_status === 'Pending';

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {order.id.substring(0, 8)}...
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="text-sm font-medium text-gray-900">
            {order.customers?.full_name || 'N/A'}
          </div>
          <div className="text-sm text-gray-500">{order.customers?.phone || ''}</div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {productCount} {productCount === 1 ? 'item' : 'items'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusBadge.bgColor} ${statusBadge.color}`}>
            {statusBadge.label}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {formatDate(order.created_at)}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {order.scheduled_start_date_time ? formatDateTime(order.scheduled_start_date_time) : '-'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
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
      {isExpanded && <ExpandedOrderDetails order={order} editDeadlineHours={editDeadlineHours} />}
    </>
  );
}

// Expanded Order Details Component
function ExpandedOrderDetails({ order, editDeadlineHours }) {
  const editCheck = isOrderEditable(order, editDeadlineHours);
  const remainingTime = order.scheduled_start_date_time
    ? getRemainingEditTime(order.scheduled_start_date_time, editDeadlineHours)
    : null;

  return (
    <tr>
      <td colSpan="7" className="px-6 py-4 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Customer Info */}
          <div>
            <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer Information
            </h4>
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Name:</span> {order.customers?.full_name || 'N/A'}</p>
              <p><span className="font-medium">Email:</span> {order.customers?.email || 'N/A'}</p>
              {/* Customer phone */}
              <div className="flex items-center gap-2">
                <span className="font-medium">Phone:</span>
                <span>{order.customers?.phone || 'N/A'}</span>
              </div>
              {/* Contact person phone from remarks */}
              {order.remarks_contact_phone && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Contact at Site:</span>
                  <span className="text-blue-700 font-medium">{order.remarks_contact_phone}</span>
                  {order.remarks_contact_name && (
                    <span className="text-blue-600">({order.remarks_contact_name})</span>
                  )}
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">from remarks</span>
                </div>
              )}
            </div>
          </div>

          {/* Delivery Address */}
          <div>
            <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Delivery Address
            </h4>
            <div className="space-y-2 text-sm">
              {/* Active address — remarks takes priority */}
              {order.remarks_delivery_address ? (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                    <p className="text-xs font-semibold text-blue-600 mb-0.5">From Remarks (active)</p>
                    <p className="text-blue-800 font-medium">{order.remarks_delivery_address}</p>
                  </div>
                  {order.original_delivery_address && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                      <p className="text-xs font-semibold text-gray-400 mb-0.5">Original SO Address</p>
                      <p className="text-gray-400 line-through text-xs">{order.original_delivery_address}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Delivery Address</p>
                  <p className="text-gray-700">{order.delivery_address || order.customers?.address || 'N/A'}</p>
                </div>
              )}
              {order.delivery_notes && (
                <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                  <span className="font-medium">Driver notes:</span> {order.delivery_notes}
                </p>
              )}
            </div>
          </div>

          {/* Products */}
          <div className="md:col-span-2">
            <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Products ({order.order_products?.length || 0})
            </h4>
            <div className="space-y-2">
              {order.order_products?.map((op, idx) => (
                <div key={idx} className="bg-white p-3 rounded border border-gray-200 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{op.products?.product_name || 'Unknown Product'}</span>
                    <span className="text-gray-600">Qty: {op.quantity}</span>
                  </div>
                  <div className="mt-1 text-gray-600">
                    <span className="mr-4">Service: {getServiceTypeLabel(op.service_type)}</span>
                    {op.dismantle_required && <span className="text-orange-600">Dismantle Required</span>}
                  </div>
                  {(op.custom_installation_time_min || op.custom_installation_time_max) && (
                    <div className="mt-1 text-gray-600">
                      Installation Time: {op.custom_installation_time_min || 0}-{op.custom_installation_time_max || 0} min
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Special Equipment */}
          {order.special_equipment_needed && (
            <div className="md:col-span-2">
              <h4 className="font-semibold text-gray-700 mb-2">Special Equipment</h4>
              <p className="text-sm text-gray-600">{order.special_equipment_needed}</p>
            </div>
          )}

          {/* Edit Deadline Info */}
          {order.scheduled_start_date_time && (
            <div className="md:col-span-2">
              <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Edit Deadline
              </h4>
              <div className="text-sm">
                {editCheck.editable ? (
                  remainingTime && !remainingTime.expired ? (
                    <p className="text-green-600">
                      Can edit for {remainingTime.hours}h {remainingTime.minutes}m
                    </p>
                  ) : (
                    <p className="text-green-600">Order is editable</p>
                  )
                ) : (
                  <p className="text-red-600">{editCheck.reason}</p>
                )}
              </div>
            </div>
          )}
        </div>
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

  const validate = (data) => {
    const errors = {};
    if (!data.full_name) {
        errors.full_name = "Full name is required.";
    }
    if (!data.email) {
        errors.email = "Email is required.";
    } else if (!/\S+@\S+\.\S+/.test(data.email)) {
        errors.email = "Email is invalid.";
    }
    if (!data.phone) {
        errors.phone = "Phone is required.";
    }
    return errors;
  };

  const handleCustomerDataChange = (e) => {
    const { name, value } = e.target;
    setCustomerData(prev => {
        const newData = { ...prev, [name]: value };
        const errors = validate(newData);
        setFormErrors(errors);
        return newData;
    });
  };

  // Data
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);

  // Customer info (editable)
  const [customerData, setCustomerData] = useState({
    full_name: order.customers?.full_name || '',
    email: order.customers?.email || '',
    phone: order.customers?.phone || '',
    address: order.customers?.address || '',
    city: order.customers?.city || '',
    state: order.customers?.state || '',
    postcode: order.customers?.postcode || ''
  });

  // Products in cart
  const [cart, setCart] = useState([]);

  // Special equipment
  const [specialEquipment, setSpecialEquipment] = useState(order.special_equipment_needed || '');

  // Search
  const [productSearch, setProductSearch] = useState('');

  const remainingTime = order.scheduled_start_date_time
    ? getRemainingEditTime(order.scheduled_start_date_time, editDeadlineHours)
    : null;

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const [customersRes, productsRes] = await Promise.all([
          fetch(`${API_BASE}/api/customers`),
          fetch(`${API_BASE}/api/products`)
        ]);

        const customersData = await customersRes.json();
        const productsData = await productsRes.json();

        setCustomers(Array.isArray(customersData) ? customersData : []);
        setAllProducts(Array.isArray(productsData) ? productsData : []);

        // Initialize cart from order_products
        const initialCart = (order.order_products || []).map(op => ({
          product: op.products,
          quantity: op.quantity || 1,
          serviceType: op.service_type || 'delivery',
          dismantleRequired: op.dismantle_required || false,
          customInstallTime: (op.custom_installation_time_min || op.custom_installation_time_max)
            ? { min: op.custom_installation_time_min, max: op.custom_installation_time_max }
            : null
        }));
        setCart(initialCart);
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [order]);

  const SERVICE_TYPE_OPTIONS = [
    { value: 'delivery', label: 'Delivery Only' },
    { value: 'delivery_installation', label: 'Delivery + Installation' },
    { value: 'stock_transfer', label: 'Stock Transfer' }
  ];

  const filteredProducts = allProducts.filter(p =>
    !cart.find(c => c.product.id === p.id) &&
    p.product_name?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addToCart = (product) => {
    setCart([...cart, {
      product,
      quantity: 1,
      serviceType: 'delivery',
      dismantleRequired: false,
      customInstallTime: null
    }]);
    setProductSearch('');
  };

  const removeFromCart = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const updateCartQuantity = (index, quantity) => {
    const updated = [...cart];
    updated[index].quantity = Math.max(1, parseInt(quantity) || 1);
    setCart(updated);
  };

  const updateCartServiceType = (index, serviceType) => {
    const updated = [...cart];
    updated[index].serviceType = serviceType;

    // Reset installation time if not delivery_installation
    if (serviceType !== 'delivery_installation') {
      updated[index].customInstallTime = null;
    }

    setCart(updated);
  };

  const updateCartDismantle = (index, required) => {
    const updated = [...cart];
    updated[index].dismantleRequired = required;
    setCart(updated);
  };

  const updateCartInstallTime = (index, min, max) => {
    const updated = [...cart];
    updated[index].customInstallTime = { min: parseInt(min) || 0, max: parseInt(max) || 0 };
    setCart(updated);
  };

  const clearCustomInstallTime = (index) => {
    const updated = [...cart];
    updated[index].customInstallTime = null;
    setCart(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validate(customerData);
    if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        setError('Please fill in all required customer fields.');
        return;
    }

    if (cart.length === 0) {
      setError('At least one product is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Prepare update data
      const updateData = {
        // Update customer info
        customer: {
          id: order.customer_id,
          ...customerData
        },
        // Update products
        products: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          dismantle_required: item.dismantleRequired,
          service_type: item.serviceType,
          custom_installation_time_min: item.customInstallTime?.min || null,
          custom_installation_time_max: item.customInstallTime?.max || null
        })),
        // Update special equipment
        special_equipment_needed: specialEquipment || null
      };

      if (resetToPending) {
        updateData.order_status = 'Pending';
        updateData.scheduled_start_date_time = null;
        updateData.scheduled_end_date_time = null;
        updateData.time_slot_id = null;
        updateData.truck_loading_sequence = null;
        updateData.notified_scheduled = false;
      }

      // First update customer
      await fetch(`${API_BASE}/api/customers/${order.customer_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerData)
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
            <p className="text-sm text-gray-600 mt-1">Order ID: {order.id.substring(0, 8)}...</p>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Customer Info */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                Customer Information
              </h3>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    name="email"
                    value={customerData.email}
                    onChange={handleCustomerDataChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    required
                  />
                  {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input
                    type="tel"
                    name="phone"
                    value={customerData.phone}
                    onChange={handleCustomerDataChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    required
                  />
                  {formErrors.phone && <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    name="address"
                    value={customerData.address}
                    onChange={handleCustomerDataChange}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
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
            </div>

            {/* Right Column - Add Products */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Add Products
              </h3>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <p className="text-center text-gray-500 py-4 text-sm">
                    {productSearch ? 'No products found' : 'Search for products to add'}
                  </p>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredProducts.slice(0, 10).map((product) => (
                      <div
                        key={product.id}
                        className="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => addToCart(product)}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-900">{product.product_name}</span>
                          <Plus className="h-4 w-4 text-blue-600 flex-shrink-0" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Products in Cart */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Products in Order ({cart.length})
            </h3>
            {cart.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No products in cart</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cart.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-medium text-gray-900 text-sm">{item.product.product_name}</h4>
                      <button
                        type="button"
                        onClick={() => removeFromCart(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Quantity */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateCartQuantity(index, e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>

                    {/* Service Type */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Service Type</label>
                      <select
                        value={item.serviceType}
                        onChange={(e) => updateCartServiceType(index, e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        {SERVICE_TYPE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Dismantle */}
                    {item.product.dismantle_required_flag && (
                      <div className="mb-3">
                        <label className="flex items-center text-xs">
                          <input
                            type="checkbox"
                            checked={item.dismantleRequired}
                            onChange={(e) => updateCartDismantle(index, e.target.checked)}
                            className="mr-2"
                          />
                          Dismantling Required
                        </label>
                      </div>
                    )}

                    {/* Installation Time */}
                    {item.serviceType === 'delivery_installation' && (
                      <div className="bg-blue-50 rounded p-2">
                        <p className="text-xs font-medium text-gray-700 mb-1">Installation Time:</p>
                        {item.customInstallTime ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                placeholder="Min (min)"
                                value={item.customInstallTime.min}
                                onChange={(e) => updateCartInstallTime(index, e.target.value, item.customInstallTime.max)}
                                className="px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                              <input
                                type="number"
                                placeholder="Max (min)"
                                value={item.customInstallTime.max}
                                onChange={(e) => updateCartInstallTime(index, item.customInstallTime.min, e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => clearCustomInstallTime(index)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Use product default
                            </button>
                          </div>
                        ) : (
                          <div>
                            {item.product.estimated_installation_time_min && item.product.estimated_installation_time_max ? (
                              <p className="text-xs text-gray-600 mb-1">
                                Default: {item.product.estimated_installation_time_min}-{item.product.estimated_installation_time_max} min
                              </p>
                            ) : (
                              <p className="text-xs text-gray-600 mb-1">No default time set</p>
                            )}
                            <button
                              type="button"
                              onClick={() => updateCartInstallTime(index, 0, 0)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Set custom time
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Special Equipment */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Special Equipment Needed (for entire order)
            </label>
            <textarea
              value={specialEquipment}
              onChange={(e) => setSpecialEquipment(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Enter any special equipment needed for this order..."
            />
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
              disabled={saving || cart.length === 0 || Object.keys(formErrors).length > 0}
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
              Order ID: {order.id.substring(0, 8)}... • Customer: {order.customers?.full_name || 'N/A'}
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
