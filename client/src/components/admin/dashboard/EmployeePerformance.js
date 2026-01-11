import React, { useEffect, useState } from 'react';
import {
  getAllEmployees, getAllOrdersSummary, getAllEmployeeTeamAssignments, getAllTeams
} from '../../../services/informationService';
import {
  Users, Star, Phone, Badge, TrendingUp, DollarSign, ChevronLeft, ChevronRight, Search
} from 'lucide-react';

const FilterBar = ({
  scope,
  setScope,
  selectedMonthDate,
  prevMonth,
  nextMonth,
  formatMonthYear,
  searchTerm,
  setSearchTerm,
  helperText
}) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search employee or team"
          className="w-full sm:w-64 rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:ring-emerald-500"
        />
      </div>
      {/* {helperText && <div className="text-sm text-gray-500">{helperText}</div>} */}
    </div>

    <div className="flex items-center space-x-3">
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
);

export default function EmployeePerformance() {
  const [employees, setEmployees] = useState([]);
  const [orders, setOrders] = useState([]);
  const [teamAssignments, setTeamAssignments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [incentivePerOrder, setIncentivePerOrder] = useState(5); // 💰 default incentive per order
  const [scope, setScope] = useState('month');
  const [searchTerm, setSearchTerm] = useState('');

  // selected month state (focus month). Defaults to current month.
  const [selectedMonthDate, setSelectedMonthDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    getAllEmployees().then(setEmployees).catch(err => console.warn(err));
    getAllOrdersSummary().then(setOrders).catch(err => console.warn(err));
    getAllEmployeeTeamAssignments().then(setTeamAssignments).catch(err => console.warn(err));
    getAllTeams().then(setTeams).catch(err => console.warn(err));
  }, []);

  // Helpers for flexible field access and dates (same approach as Overview)
  const getOrderId = (order) => order.id || order.order_id || order.OrderID || order.orderId;
  const getOrderRating = (order) => {
    const r = order.customer_rating ?? order.CustomerRating ?? order.rating ?? order.Rating ?? null;
    return (r === '' || r === null || typeof r === 'undefined') ? null : Number(r);
  };
  const getOrderFeedback = (order) => order.customer_feedback ?? order.CustomerFeedback ?? order.feedback ?? '';
  const getOrderStatus = (order) => order.order_status ?? order.orderStatus ?? order.OrderStatus ?? order.status ?? '';
  const getEmployeeId = (order) => order.employee_id ?? order.EmployeeID ?? order.employeeId;

  const normalizeStatus = (status) => String(status || '').trim().toLowerCase();
  const isCompletedStatus = (status) => ['completed', 'delivered'].includes(normalizeStatus(status));

  const getRoleLabel = (employee) => {
    const role = employee?.role;
    if (role && typeof role === 'object') return role.name || 'Staff';
    if (typeof role === 'string') return role;
    if (employee?.roleName && typeof employee.roleName === 'string') return employee.roleName;
    if (employee?.roleName && typeof employee.roleName === 'object') return employee.roleName.name || 'Staff';
    return 'Staff Member';
  };

  // Robust getOrderCreatedDate: returns Date object or null if no valid date found.
  const getOrderCreatedDate = (order) => {
    if (!order) return null;
    const tryFields = ['created_at', 'createdAt', 'CreatedAt', 'created'];
    for (const f of tryFields) {
      const v = order[f];
      if (!v) continue;
      // Firestore Timestamp
      if (typeof v?.toDate === 'function') {
        const d = v.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      }
      // ISO string or epoch number or Date object
      if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) {
        const d = v instanceof Date ? v : new Date(v);
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      }
    }
    return null;
  };

  const getOrderCompletionDate = (order) => {
    if (!order) return null;
    const tryFields = ['actual_end_date_time', 'actual_arrival_date_time', 'updated_at', 'updatedAt'];
    for (const f of tryFields) {
      const v = order[f];
      if (!v) continue;
      if (typeof v?.toDate === 'function') {
        const d = v.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      }
      if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) {
        const d = v instanceof Date ? v : new Date(v);
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      }
    }
    return null;
  };

  // Helper: filter orders by month/year safely
  const ordersCreatedInMonth = (month, year) => orders.filter(order => {
    const d = getOrderCreatedDate(order);
    if (!d) return false;
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const ordersCompletedInMonth = (month, year) => orders.filter(order => {
    if (!isCompletedStatus(getOrderStatus(order))) return false;
    const d = getOrderCompletionDate(order) || getOrderCreatedDate(order);
    if (!d) return false;
    return d.getMonth() === month && d.getFullYear() === year;
  });

  // Month navigation handlers
  const prevMonth = () => {
    setSelectedMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setSelectedMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  // Helper to format selected month for header
  function formatMonthYear(date) {
    if (!date) return '';
    try {
      return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return String(date);
    }
  }

  // Derive current month/year and filtered orders for that month
  const now = selectedMonthDate;
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const filteredOrdersForMonth = ordersCreatedInMonth(currentMonth, currentYear);
  const filteredCompletedOrdersForMonth = ordersCompletedInMonth(currentMonth, currentYear);
  const scopedOrders = scope === 'all' ? orders : filteredOrdersForMonth;

  const teamById = teams.reduce((acc, team) => {
    const id = team.id || team.TeamID || team.teamId;
    if (id) acc[id] = team;
    return acc;
  }, {});

  const assignmentsByEmployee = teamAssignments.reduce((acc, assignment) => {
    const employeeId = assignment.employee_id || assignment.EmployeeID || assignment.employeeId;
    if (!employeeId) return acc;
    const teamId = assignment.team_id || assignment.TeamID || assignment.teamId;
    if (!acc[employeeId]) acc[employeeId] = [];
    if (teamId) acc[employeeId].push(teamId);
    return acc;
  }, {});

  const getEmployeeTeamNames = (employeeId) => {
    const teamIds = assignmentsByEmployee[employeeId] || [];
    const names = teamIds
      .map(id => teamById[id]?.team_type || teamById[id]?.teamType || teamById[id]?.name)
      .filter(Boolean);
    return names.length > 0 ? names : ['No team'];
  };

  // Calculate stats for each employee using only orders in the selected month
  const employeeStats = employees.map(employee => {
    const empId = employee.id || employee.EmployeeID || employee.employeeId;
    const employeeOrders = scopedOrders.filter(order => getEmployeeId(order) === empId);
    const completedOrdersForEmployee = scope === 'all'
      ? employeeOrders.filter(order => isCompletedStatus(getOrderStatus(order)))
      : filteredCompletedOrdersForMonth.filter(order => getEmployeeId(order) === empId);
    const ratings = employeeOrders.map(o => getOrderRating(o)).filter(r => typeof r === 'number' && !isNaN(r));
    const avgRating = ratings.length > 0
      ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length)
      : 0;
    const totalIncentive = employeeOrders.length * incentivePerOrder;
    const teamNames = getEmployeeTeamNames(empId);

    return {
      ...employee,
      employeeId: empId,
      orderCount: employeeOrders.length,
      completedOrderCount: completedOrdersForEmployee.length,
      avgRating,
      totalIncentive,
      orders: employeeOrders,
      teamNames
    };
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredEmployeeStats = employeeStats.filter(employee => {
    if (!normalizedSearch) return true;
    const name = employee.name || employee.displayName || '';
    const email = employee.email || '';
    const teamsText = (employee.teamNames || []).join(' ');
    return [name, email, teamsText].some(value => String(value || '').toLowerCase().includes(normalizedSearch));
  });

  const topPerformers = employeeStats
    .filter(emp => emp.orderCount > 0)
    .sort((a, b) => (b.avgRating * b.orderCount) - (a.avgRating * a.orderCount))
    .slice(0, 3);

  const filteredEmployeeIds = new Set(filteredEmployeeStats.map(emp => emp.employeeId));
  const scopedOrdersForTable = normalizedSearch
    ? scopedOrders.filter(order => filteredEmployeeIds.has(getEmployeeId(order)))
    : scopedOrders;

  return (
    <div className="space-y-6">

      {/* Scope + search controls */}
      <FilterBar
        scope={scope}
        setScope={setScope}
        selectedMonthDate={selectedMonthDate}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        formatMonthYear={formatMonthYear}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        helperText={`${scope === 'all' ? orders.length : filteredOrdersForMonth.length} orders in view`}
      />

      {/* 🔧 Incentive Control Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center mb-3 md:mb-0">
          <DollarSign className="h-5 w-5 mr-2 text-green-600" />
          Incentive Settings
        </h2>
        <div className="flex items-center space-x-3">
          <label className="text-sm text-gray-600">Incentive per Order (RM):</label>
          <input
            type="number"
            min="0"
            value={incentivePerOrder}
            onChange={e => setIncentivePerOrder(Number(e.target.value))}
            className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Top Performers Section */}

      {topPerformers.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-green-600" />
              Top Performers
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {topPerformers.map((employee, index) => (
                <div key={employee.EmployeeID} className="relative">
                  {index === 0 && (
                    <div className="absolute -top-2 -right-2 bg-yellow-400 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                      1
                    </div>
                  )}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">{employee.name}</h4>
                      <div className="flex items-center text-yellow-500">
                        <Star className="h-4 w-4 fill-current mr-1" />
                        <span className="text-sm font-medium">{employee.avgRating.toFixed(1)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{getRoleLabel(employee)}</p>
                    <p className="text-lg font-bold text-blue-600">{employee.orderCount} orders</p>
                    <p className="text-sm text-green-700 mt-1">Incentive: RM {employee.totalIncentive.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}


      {/* Employee Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredEmployeeStats.map((employee) => (
          <div key={employee.employeeId || employee.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <h4 className="font-semibold text-gray-900 text-lg">{employee.name || employee.displayName}</h4>
                    <span className={`ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(employee.activeFlag ?? employee.ActiveFlag ?? true)
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                      }`}>
                      {(employee.activeFlag ?? employee.ActiveFlag ?? true) ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 flex items-center">
                    <Badge className="h-4 w-4 mr-1" />
                    {getRoleLabel(employee)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Teams: {employee.teamNames.join(', ')}
                  </p>
                  {(employee.contactNumber || employee.contact_number) && (
                    <p className="text-sm text-gray-600 flex items-center mt-1">
                      <Phone className="h-4 w-4 mr-1" />
                      {employee.contactNumber || employee.contact_number}
                    </p>
                  )}
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-xl font-bold text-blue-600">{employee.orderCount}</p>
                  <p className="text-xs text-gray-600 mt-1">Orders</p>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xl font-bold text-yellow-600">
                    {employee.avgRating > 0 ? employee.avgRating.toFixed(1) : 'N/A'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Avg Rating</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-xl font-bold text-green-600">{employee.completedOrderCount}</p>
                  <p className="text-xs text-gray-600 mt-1">Completed</p>
                </div>
              </div>

              {/* Employee ID */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Employee ID: <span className="font-mono">{employee.employeeId || employee.id}</span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Orders Table for selected month */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">
            Order Details by Employee ({scope === 'all' ? 'All Time' : 'Selected Month'})
          </h3>
          <div className="flex items-center text-sm text-gray-500">
            <Users className="h-4 w-4 mr-1" />
            {scope === 'all' ? orders.length : filteredOrdersForMonth.length} orders
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer Feedback</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {scopedOrdersForTable.map((order) => {
                const empId = getEmployeeId(order);
                const employee = employees.find(e => (e.id || e.EmployeeID) === empId);
                const rating = getOrderRating(order);
                return (
                  <tr key={getOrderId(order)} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{getOrderId(order)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div>
                        <div className="font-medium">{employee?.name || employee?.displayName || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">ID: {empId}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {rating !== null ? (
                        <div className="flex items-center">
                          <Star className="h-4 w-4 text-yellow-400 mr-1 fill-current" />
                          <span className="font-medium">{rating.toFixed(1)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">No rating</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={getOrderFeedback(order)}>
                      {getOrderFeedback(order) || 'No feedback provided'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isCompletedStatus(getOrderStatus(order)) ? 'bg-green-100 text-green-800'
                          : normalizeStatus(getOrderStatus(order)) === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}>
                        {getOrderStatus(order)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {scopedOrdersForTable.length === 0 && (
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
    </div>
  );
}
