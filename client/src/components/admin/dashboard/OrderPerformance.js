import React, { useEffect, useState } from 'react';
import {
  getAllOrdersSummary, getAllCustomers, getAllBuildings
} from '../../../services/informationService';
import { Package, CheckCircle, Star, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

export default function OrderPerformance() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [scope, setScope] = useState('month');

  // selected month state (focus month). Defaults to current month.
  const [selectedMonthDate, setSelectedMonthDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    getAllOrdersSummary().then(setOrders).catch(err => console.warn(err));
    getAllCustomers().then(setCustomers).catch(err => console.warn(err));
    getAllBuildings().then(setBuildings).catch(err => console.warn(err));
  }, []);

  const getCustomerId = (order) => order.customer_id ?? order.CustomerID ?? order.customerId;
  const getBuildingId = (order) => order.building_id ?? order.BuildingID ?? order.buildingId;
  const getOrderId = (order) => order.id ?? order.order_id ?? order.OrderID ?? order.orderId;
  const getOrderStatus = (order) => order.order_status ?? order.orderStatus ?? order.OrderStatus ?? order.status ?? '';

  const getCustomerName = (customerId) => {
    const customer = customers.find(c => (c.id || c.CustomerID || c.customerId) === customerId);
    return customer?.full_name || customer?.FullName || customer?.name || customerId;
  };
  const getBuildingName = (buildingId) => {
    const building = buildings.find(b => (b.id || b.BuildingID || b.building_id) === buildingId);
    return building?.building_name || building?.BuildingName || building?.name || buildingId;
  };

  const normalizeStatus = (status) => String(status || '').trim().toLowerCase();
  const isCompletedStatus = (status) => ['completed'].includes(normalizeStatus(status));

  // Robust getOrderCreatedDate: returns Date object or null if no valid date found.
  const getOrderCreatedDate = (order) => {
    if (!order?.created_at) return null;

    const d = order.created_at instanceof Date
      ? order.created_at
      : new Date(order.created_at);
    return isNaN(d.getTime()) ? null : d;
  };


  const getOrderCompletionDate = (order) => {
    if (!order?.arrival_date) return null;

    const v = order.arrival_date;

    // Firestore Timestamp
    if (typeof v.toDate === 'function') {
      const d = v.toDate();
      return isNaN(d.getTime()) ? null : d;
    }

    // Date object / ISO string / epoch
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };


  // Defensive formatter (used only if needed)
  function formatMonthYear(date) {
    if (!date) return '';
    try {
      return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return String(date);
    }
  }

  // Helper to filter orders by month/year safely
  const ordersCreatedInMonth = (month, year) => (orders || []).filter(order => {
    const d = getOrderCreatedDate(order);
    if (!d) return false;
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const ordersCompletedInMonth = (month, year) => (orders || []).filter(order => {
    if (!isCompletedStatus(getOrderStatus(order))) return false;
    const d = getOrderCompletionDate(order) || getOrderCreatedDate(order);
    if (!d) return false;
    return d.getMonth() === month && d.getFullYear() === year;
  });

  // Selected month/year
  const now = selectedMonthDate;
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  // Orders for selected month
  const createdOrdersForMonth = ordersCreatedInMonth(currentMonth, currentYear);
  const completedOrdersForMonth = ordersCompletedInMonth(currentMonth, currentYear);

  const createdOrdersLastMonth = ordersCreatedInMonth(lastMonth, lastMonthYear);
  const completedOrdersLastMonth = ordersCompletedInMonth(lastMonth, lastMonthYear);

  const scopeOrders = scope === 'all' ? orders : createdOrdersForMonth;
  const createdOrdersCount = scope === 'all' ? orders.length : createdOrdersForMonth.length;
  const completedOrdersCount = scope === 'all'
    ? orders.filter(order => isCompletedStatus(getOrderStatus(order))).length
    : completedOrdersForMonth.length;
  const openOrdersCount = scope === 'all'
    ? orders.filter(order => !isCompletedStatus(getOrderStatus(order))).length
    : createdOrdersForMonth.filter(order => !isCompletedStatus(getOrderStatus(order))).length;

  const createdTrend = scope === 'all' ? null : createdOrdersForMonth.length - createdOrdersLastMonth.length;
  const completedTrend = scope === 'all' ? null : completedOrdersForMonth.length - completedOrdersLastMonth.length;

  // helpers for table display
  const getOrderRating = (order) => {
    const r = order.customer_rating ?? order.CustomerRating ?? order.rating ?? order.Rating ?? null;
    return (r === '' || r === null || typeof r === 'undefined') ? null : Number(r);
  };

  // Month navigation handlers
  const prevMonth = () => setSelectedMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setSelectedMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Order Management</h3>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="inline-flex items-center rounded-md border border-gray-200 bg-white p-1">
              <button
                onClick={() => setScope('month')}
                className={`px-3 py-1 text-xs font-medium rounded ${scope === 'month' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:text-gray-800'}`}
              >
                Selected month
              </button>
              <button
                onClick={() => setScope('all')}
                className={`px-3 py-1 text-xs font-medium rounded ${scope === 'all' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:text-gray-800'}`}
              >
                All time
              </button>
            </div>
            <button
              onClick={prevMonth}
              className="inline-flex items-center px-3 py-2 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="text-sm font-medium">{formatMonthYear(selectedMonthDate)}</div>

            <button
              onClick={nextMonth}
              className="inline-flex items-center px-3 py-2 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50"
              title="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Orders Created ({scope === 'all' ? 'all time' : 'selected month'})
              </p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{createdOrdersCount}</p>
              {createdTrend !== null && (
                <p className="text-xs text-gray-500 mt-1">
                  {createdTrend >= 0 ? '+' : ''}{createdTrend} vs last month
                </p>
              )}
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Orders Completed ({scope === 'all' ? 'all time' : 'selected month'})
              </p>
              <p className="text-2xl font-bold text-green-600 mt-1">{completedOrdersCount}</p>
              {completedTrend !== null && (
                <p className="text-xs text-gray-500 mt-1">
                  {completedTrend >= 0 ? '+' : ''}{completedTrend} vs last month
                </p>
              )}
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Open Orders ({scope === 'all' ? 'all time' : 'selected month'})
              </p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{openOrdersCount}</p>
              <p className="text-xs text-gray-500 mt-1">Not completed yet</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Clock className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Building</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {scopeOrders.map((order) => {
              const rating = getOrderRating(order);
              return (
                <tr key={getOrderId(order)}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{getOrderId(order)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getCustomerName(getCustomerId(order))}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getBuildingName(getBuildingId(order))}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="flex items-center">
                      <Star className="h-4 w-4 text-yellow-400 mr-1" />
                      {rating !== null ? rating.toFixed(1) : 'N/A'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      isCompletedStatus(getOrderStatus(order)) ? 'bg-green-100 text-green-800'
                        : normalizeStatus(getOrderStatus(order)) === 'pending' ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {getOrderStatus(order)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {scopeOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">
                  {scope === 'all' ? 'No orders available.' : 'No orders for selected month.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
