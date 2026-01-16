import React, { useEffect, useMemo, useState } from 'react';
import ScopeMonthSelector from '../../common/ScopeMonthSelector';
import {
  getAllOrdersSummary, getAllCustomers, getAllBuildings, getAllOrderProducts, getAllProducts,
  getAllEmployees, getAllEmployeeTeamAssignments, getAllTeams
} from '../../../services/informationService';
import {
  Package, CheckCircle, Star, Clock, ChevronDown, ChevronUp, User, MapPin, ClipboardList, Users
} from 'lucide-react';

export default function OrderPerformance() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [orderProducts, setOrderProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [teamAssignments, setTeamAssignments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [scope, setScope] = useState('month');
  const [expandedOrders, setExpandedOrders] = useState({});

  // selected month state (focus month). Defaults to current month.
  const [selectedMonthDate, setSelectedMonthDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    getAllOrdersSummary().then(setOrders).catch(err => console.warn(err));
    getAllCustomers().then(setCustomers).catch(err => console.warn(err));
    getAllBuildings().then(setBuildings).catch(err => console.warn(err));
    getAllOrderProducts().then(setOrderProducts).catch(err => console.warn(err));
    getAllProducts().then(setProducts).catch(err => console.warn(err));
    getAllEmployees().then(setEmployees).catch(err => console.warn(err));
    getAllEmployeeTeamAssignments().then(setTeamAssignments).catch(err => console.warn(err));
    getAllTeams().then(setTeams).catch(err => console.warn(err));
  }, []);

  const getCustomerId = (order) => order.customer_id ?? order.CustomerID ?? order.customerId;
  const getBuildingId = (order) => order.building_id ?? order.BuildingID ?? order.buildingId;
  const getOrderId = (order) => order.id ?? order.order_id ?? order.OrderID ?? order.orderId;
  const getOrderStatus = (order) => order.order_status ?? order.orderStatus ?? order.OrderStatus ?? order.status ?? '';
  const getOrderEmployeeId = (order) => order.employee_id ?? order.EmployeeID ?? order.employeeId;

  const getCustomerName = (customerId) => {
    const customer = customers.find(c => (c.id || c.CustomerID || c.customerId) === customerId);
    return customer?.full_name || customer?.FullName || customer?.name || customerId;
  };
  const getBuildingName = (buildingId) => {
    const building = buildings.find(b => (b.id || b.BuildingID || b.building_id) === buildingId);
    return building?.building_name || building?.BuildingName || building?.name || buildingId;
  };
  const getBuildingAddress = (buildingId) => {
    const building = buildings.find(b => (b.id || b.BuildingID || b.building_id) === buildingId);
    return building?.address || building?.Address || building?.building_address || '';
  };
  const getCustomerDetails = (customerId) => {
    const customer = customers.find(c => (c.id || c.CustomerID || c.customerId) === customerId);
    if (!customer) return null;
    const name = customer.full_name || customer.FullName || customer.name || customerId;
    const email = customer.email || '';
    const phone = customer.phone || customer.contact_number || '';
    const addressParts = [
      customer.address,
      customer.city,
      customer.postcode,
      customer.state
    ].filter(Boolean);
    return { name, email, phone, address: addressParts.join(', ') };
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
  const getOrderKey = (order, index) => getOrderId(order) || `row-${index}`;

  const productById = useMemo(() => {
    return products.reduce((acc, product) => {
      const id = product.id || product.ProductID || product.product_id || product.productId;
      if (id) acc[id] = product;
      return acc;
    }, {});
  }, [products]);

  const orderProductsByOrderId = useMemo(() => {
    return orderProducts.reduce((acc, op) => {
      const orderId = op.order_id || op.OrderID || op.orderId;
      if (!orderId) return acc;
      if (!acc[orderId]) acc[orderId] = [];
      acc[orderId].push(op);
      return acc;
    }, {});
  }, [orderProducts]);

  const employeeById = useMemo(() => {
    return employees.reduce((acc, emp) => {
      const id = emp.id || emp.EmployeeID || emp.employeeId;
      if (id) acc[id] = emp;
      return acc;
    }, {});
  }, [employees]);

  const teamById = useMemo(() => {
    return teams.reduce((acc, team) => {
      const id = team.id || team.TeamID || team.teamId;
      if (id) acc[id] = team;
      return acc;
    }, {});
  }, [teams]);

  const assignmentsByEmployee = useMemo(() => {
    return teamAssignments.reduce((acc, assignment) => {
      const employeeId = assignment.employee_id || assignment.EmployeeID || assignment.employeeId;
      if (!employeeId) return acc;
      const teamId = assignment.team_id || assignment.TeamID || assignment.teamId;
      if (!acc[employeeId]) acc[employeeId] = [];
      if (teamId) acc[employeeId].push(teamId);
      return acc;
    }, {});
  }, [teamAssignments]);

  const getEmployeeTeams = (employeeId) => {
    const teamIds = assignmentsByEmployee[employeeId] || [];
    const names = teamIds
      .map(id => teamById[id]?.team_type || teamById[id]?.teamType || teamById[id]?.name)
      .filter(Boolean);
    return names.length > 0 ? names : ['No team'];
  };

  const formatDateDisplay = (dateInput) => {
    if (!dateInput) return '';
    if (typeof dateInput?.toDate === 'function') {
      const d = dateInput.toDate();
      return d.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }
    if (typeof dateInput === 'number' || (typeof dateInput === 'string' && /^\d+$/.test(dateInput))) {
      const d = new Date(Number(dateInput));
      return d.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }
    if (typeof dateInput === 'string') {
      const d = new Date(dateInput);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
      }
      return dateInput;
    }
    if (dateInput instanceof Date) {
      return dateInput.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }
    return String(dateInput);
  };

  // Month navigation handlers
  const prevMonth = () => setSelectedMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setSelectedMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Order Management</h3>

        <ScopeMonthSelector
          scope={scope}
          onScopeChange={setScope}
          selectedMonthDate={selectedMonthDate}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          formatMonthYear={formatMonthYear}
        />
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Building</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {scopeOrders.map((order, index) => {
              const rowKey = getOrderKey(order, index);
              const rating = getOrderRating(order);
              const isExpanded = !!expandedOrders[rowKey];
              const customerId = getCustomerId(order);
              const buildingId = getBuildingId(order);
              const employeeId = getOrderEmployeeId(order);
              const employee = employeeById[employeeId];
              const customerDetails = getCustomerDetails(customerId);
              const buildingName = getBuildingName(buildingId);
              const buildingAddress = getBuildingAddress(buildingId);
              const productLines = (orderProductsByOrderId[getOrderId(order)] || []).map(op => {
                const productId = op.product_id || op.ProductID || op.productId;
                const product = productById[productId];
                return {
                  id: productId,
                  name: product?.product_name || product?.ProductName || 'Unknown product',
                  quantity: op.quantity ?? op.Quantity ?? 1
                };
              });

              return (
                <React.Fragment key={rowKey}>
                  <tr>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedOrders(prev => ({ ...prev, [rowKey]: !prev[rowKey] }))}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                        title={isExpanded ? 'Hide details' : 'Show details'}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{getOrderId(order)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{getCustomerName(customerId)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{buildingName}</td>
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
                  {isExpanded && (
                    <tr className="bg-gray-50">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          <div className="rounded-lg border border-gray-200 bg-white p-4">
                            <div className="flex items-center text-sm font-semibold text-gray-900 mb-2">
                              <ClipboardList className="h-4 w-4 mr-2 text-gray-500" />
                              Order Details
                            </div>
                            <div className="space-y-2 text-sm text-gray-600">
                              <div>Created: {formatDateDisplay(order.created_at)}</div>
                              <div>Scheduled Start: {formatDateDisplay(order.scheduled_start_date_time)}</div>
                              <div>Scheduled End: {formatDateDisplay(order.scheduled_end_date_time)}</div>
                              <div>Actual Start: {formatDateDisplay(order.actual_start_date_time)}</div>
                              <div>Actual End: {formatDateDisplay(order.actual_end_date_time)}</div>
                              <div>Arrival: {formatDateDisplay(order.actual_arrival_date_time)}</div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-gray-200 bg-white p-4">
                            <div className="flex items-center text-sm font-semibold text-gray-900 mb-2">
                              <User className="h-4 w-4 mr-2 text-gray-500" />
                              Customer
                            </div>
                            <div className="space-y-2 text-sm text-gray-600">
                              <div>{customerDetails?.name || 'Unknown customer'}</div>
                              {customerDetails?.email && <div>{customerDetails.email}</div>}
                              {customerDetails?.phone && <div>{customerDetails.phone}</div>}
                              {(customerDetails?.address || buildingAddress) && (
                                <div className="flex items-start">
                                  <MapPin className="h-4 w-4 mr-2 mt-0.5 text-gray-400" />
                                  <span>{customerDetails?.address || buildingAddress}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-lg border border-gray-200 bg-white p-4">
                            <div className="flex items-center text-sm font-semibold text-gray-900 mb-2">
                              <Users className="h-4 w-4 mr-2 text-gray-500" />
                              Teams & Products
                            </div>
                            <div className="space-y-2 text-sm text-gray-600">
                              <div>
                                Employee: {employee?.name || employee?.displayName || 'Unassigned'}
                              </div>
                              <div>
                                Teams: {employeeId ? getEmployeeTeams(employeeId).join(', ') : 'No team'}
                              </div>
                              <div className="pt-2">
                                <div className="font-medium text-gray-700">Products</div>
                                {productLines.length > 0 ? (
                                  <ul className="list-disc list-inside">
                                    {productLines.map((p, idx) => (
                                      <li key={`${p.id || 'product'}-${idx}`}>
                                        {p.name} {p.quantity ? `x${p.quantity}` : ''}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="text-gray-500">No products linked</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {scopeOrders.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">
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
