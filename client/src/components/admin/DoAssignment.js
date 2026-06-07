import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck, User, Calendar, MapPin, Package, CheckCircle,
  Clock, RefreshCw, AlertCircle, ChevronRight, X, Search,
  FileText, ExternalLink
} from 'lucide-react';

import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

const STATUS_STYLES = {
  unassigned:      { label: 'Unassigned',      color: 'bg-gray-100 text-gray-700'    },
  assigned:        { label: 'Assigned',         color: 'bg-blue-100 text-blue-700'    },
  approved:        { label: 'Approved',         color: 'bg-green-100 text-green-700'  },
  pending_review:  { label: 'Pending Review',   color: 'bg-yellow-100 text-yellow-700'},
};

function StatusBadge({ status }) {
  const cfg = STATUS_STYLES[status] || STATUS_STYLES.unassigned;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function formatDateTime(str) {
  if (!str) return 'N/A';
  return new Date(str).toLocaleString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Assignment Modal ──────────────────────────────────────────────────────────
function AssignModal({ order, employees, timeSlots, onClose, onAssigned }) {
  const [selectedEmployee, setSelectedEmployee] = useState(order.employee_id || '');
  const [selectedSlot,     setSelectedSlot]     = useState('');
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState(null);

  const availableSlots = timeSlots.filter(s => s.available_flag !== false);

  const handleAssign = async () => {
    setSaving(true);
    setError(null);
    try {
      // Assign timeslot
      if (selectedSlot) {
        const res = await fetch(`${API_BASE}/api/orders/${order.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ time_slot_id: selectedSlot }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Failed to assign timeslot');
        }
      }

      // Assign driver
      if (selectedEmployee) {
        await fetch(`${API_BASE}/api/orders/${order.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ employee: selectedEmployee }),
        });
      }

      // Update assignment_status to assigned
      await fetch(`${API_BASE}/api/orders/${order.id}/issue`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ }),
      });

      // Mark as assigned (using a direct update)
      await fetch(`${API_BASE}/api/orders/${order.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          employee:          selectedEmployee || undefined,
          assignment_status: 'assigned',
        }),
      });

      onAssigned();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deliveryEmployees = employees.filter(e =>
    e.active_flag !== false &&
    (e.role?.name?.toLowerCase().includes('delivery') ||
     e.role?.name?.toLowerCase().includes('driver'))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Assign Delivery Order</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {order.odoo_order_ref || order.id.slice(0, 8).toUpperCase()} —{' '}
              {order.customers?.full_name}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Delivery address */}
          {order.delivery_address && (
            <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-2">
              <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">Delivery Address</p>
                <p className="text-sm text-gray-700">{order.delivery_address}</p>
              </div>
            </div>
          )}

          {/* Delivery remarks from Odoo */}
          {order.delivery_remarks && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                Delivery Remarks (from Odoo)
              </p>
              <p className="text-sm text-amber-800 italic">"{order.delivery_remarks}"</p>
            </div>
          )}

          {/* Driver selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <User size={13} className="inline mr-1" />
              Assign Driver
            </label>
            <select
              value={selectedEmployee}
              onChange={e => setSelectedEmployee(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">— Select driver —</option>
              {(deliveryEmployees.length > 0 ? deliveryEmployees : employees).map(e => (
                <option key={e.id} value={e.id}>
                  {e.name || e.display_name} {e.role?.name ? `(${e.role.name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Time slot selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Calendar size={13} className="inline mr-1" />
              Assign Time Slot
            </label>
            <select
              value={selectedSlot}
              onChange={e => setSelectedSlot(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">— Select time slot —</option>
              {availableSlots.map(s => (
                <option key={s.id} value={s.id}>
                  {s.date} | {s.time_window_start} – {s.time_window_end}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={saving || (!selectedEmployee && !selectedSlot)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Assigning...' : 'Save Assignment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DoAssignment() {
  const [orders,     setOrders]     = useState([]);
  const [employees,  setEmployees]  = useState([]);
  const [timeSlots,  setTimeSlots]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [filter,     setFilter]     = useState('all');
  const [search,     setSearch]     = useState('');
  const [assignModal,setAssignModal]= useState(null); // order being assigned
  const [approving,  setApproving]  = useState(null); // order id being approved

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [ordersRes, empRes, slotsRes] = await Promise.all([
        fetch(`${API_BASE}/api/orders?sort=created_desc&include_products=true`),
        fetch(`${API_BASE}/api/employees`),
        fetch(`${API_BASE}/api/time-slots`),
      ]);
      const [ordersData, empData, slotsData] = await Promise.all([
        ordersRes.json(), empRes.json(), slotsRes.json(),
      ]);
      // Only show Odoo-sourced DOs (have odoo_order_ref) or Pending orders
      const filtered = Array.isArray(ordersData)
        ? ordersData.filter(o => o.odoo_order_ref || o.order_status === 'Pending')
        : [];
      setOrders(filtered);
      setEmployees(Array.isArray(empData) ? empData : []);
      setTimeSlots(Array.isArray(slotsData) ? slotsData : []);
    } catch (err) {
      setError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const handleApprove = async (order) => {
    setApproving(order.id);
    try {
      const res = await fetch(`${API_BASE}/api/orders/${order.id}/approve`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve');
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, assignment_status: 'approved', order_status: 'Scheduled' } : o
      ));
    } catch (err) {
      alert(err.message);
    } finally {
      setApproving(null);
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchFilter =
      filter === 'all'        ? true :
      filter === 'unassigned' ? o.assignment_status === 'unassigned' || !o.assignment_status :
      filter === 'assigned'   ? o.assignment_status === 'assigned' :
      filter === 'approved'   ? o.assignment_status === 'approved' : true;

    const matchSearch = !search ||
      o.odoo_order_ref?.toLowerCase().includes(search.toLowerCase()) ||
      o.customers?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.delivery_address?.toLowerCase().includes(search.toLowerCase());

    return matchFilter && matchSearch;
  });

  const counts = {
    all:        orders.length,
    unassigned: orders.filter(o => !o.assignment_status || o.assignment_status === 'unassigned').length,
    assigned:   orders.filter(o => o.assignment_status === 'assigned').length,
    approved:   orders.filter(o => o.assignment_status === 'approved').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      {assignModal && (
        <AssignModal
          order={assignModal}
          employees={employees}
          timeSlots={timeSlots}
          onClose={() => setAssignModal(null)}
          onAssigned={() => { setAssignModal(null); fetchData(); }}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="text-blue-600" size={22} />
            DO Assignment
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Assign delivery drivers and time slots to incoming Odoo delivery orders.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} className="mr-1.5" /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { key: 'all',        label: 'Total DOs',  color: 'text-gray-900',   border: 'border-gray-200'  },
          { key: 'unassigned', label: 'Unassigned', color: 'text-orange-600', border: 'border-orange-200'},
          { key: 'assigned',   label: 'Assigned',   color: 'text-blue-600',   border: 'border-blue-200'  },
          { key: 'approved',   label: 'Approved',   color: 'text-green-600',  border: 'border-green-200' },
        ].map(c => (
          <div key={c.key} className={`bg-white rounded-xl p-4 border shadow-sm ${c.border}`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{counts[c.key]}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by order ref, customer, address..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center space-x-1 bg-white border border-gray-200 rounded-lg p-1">
          {['all', 'unassigned', 'assigned', 'approved'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-sm font-medium capitalize transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f}
              {counts[f] > 0 && (
                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                  filter === f ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>{counts[f]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Order List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500">Loading orders...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No delivery orders found</p>
          <p className="text-gray-400 text-sm mt-1">
            New orders from Odoo will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const isApproved   = order.assignment_status === 'approved';
            const isAssigned   = order.assignment_status === 'assigned';
            const isUnassigned = !order.assignment_status || order.assignment_status === 'unassigned';
            const driver       = employees.find(e => e.id === order.employee_id);
            const items        = order.order_products || [];

            return (
              <div
                key={order.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                  isApproved ? 'border-green-200' :
                  isAssigned ? 'border-blue-200' :
                               'border-orange-200'
                }`}
              >
                {/* Colour strip */}
                <div className={`h-1 w-full ${
                  isApproved ? 'bg-green-500' :
                  isAssigned ? 'bg-blue-500' :
                               'bg-orange-400'
                }`} />

                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Left: order info */}
                    <div className="flex-1 space-y-2">
                      {/* Row 1: ref + status + odoo badge */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-gray-900">
                          {order.odoo_order_ref || order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <StatusBadge status={order.assignment_status || 'unassigned'} />
                        {order.odoo_order_ref && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                            From Odoo
                          </span>
                        )}
                      </div>

                      {/* Row 2: customer + address */}
                      <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                        {order.customers?.full_name && (
                          <span className="flex items-center gap-1">
                            <User size={12} className="text-gray-400" />
                            {order.customers.full_name}
                          </span>
                        )}
                        {order.delivery_address && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} className="text-gray-400" />
                            <span className="truncate max-w-xs">{order.delivery_address}</span>
                          </span>
                        )}
                      </div>

                      {/* Row 3: items + driver + slot */}
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        {items.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Package size={11} />
                            {items.length} item{items.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {driver && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <User size={11} />
                            Driver: {driver.name || driver.display_name}
                          </span>
                        )}
                        {order.time_slots && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <Clock size={11} />
                            {order.time_slots.date} {order.time_slots.time_window_start}–{order.time_slots.time_window_end}
                          </span>
                        )}
                      </div>

                      {/* Delivery remarks */}
                      {order.delivery_remarks && (
                        <div className="mt-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg italic">
                          Remark: "{order.delivery_remarks}"
                        </div>
                      )}

                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} />
                        Created: {formatDateTime(order.created_at)}
                      </p>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {!isApproved && (
                        <button
                          onClick={() => setAssignModal(order)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
                        >
                          <User size={14} />
                          {isAssigned ? 'Reassign' : 'Assign'}
                        </button>
                      )}

                      {isAssigned && (
                        <button
                          onClick={() => handleApprove(order)}
                          disabled={approving === order.id}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                        >
                          <CheckCircle size={14} />
                          {approving === order.id ? 'Approving...' : 'Approve'}
                        </button>
                      )}

                      {isApproved && (
                        <span className="flex items-center gap-1.5 text-green-700 text-sm font-medium">
                          <CheckCircle size={14} />
                          Assignment Approved
                        </span>
                      )}
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
