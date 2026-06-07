import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, User, Package, Wrench, AlertTriangle, CheckCircle, Phone, Mail, Play, Check } from 'lucide-react';
import {
    getAllOrders,
    getAllOrderProducts,
    getAllProducts,
    getAllCustomers,
    getAllBuildings,
    getAllEmployees,
    getAllEmployeeTeamAssignments,
    getAllTeams,
    updateOrderStatus as updateOrderStatusApi
} from '../../services/informationService';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL as REACT_APP_API_BASE_URL } from '../../utils/apiBaseUrl';

const InstallationSchedule = () => {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [teamAutoSelectEnabled, setTeamAutoSelectEnabled] = useState(true);

  // Data state
  const [orders, setOrders] = useState([]);
  const [orderProducts, setOrderProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [installationSchedules, setInstallationSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load all data
  useEffect(() => {
    async function loadData() {
      try {
        const [
          ordersData,
          orderProductsData,
          productsData,
          customersData,
          buildingsData,
          employeesData,
          assignmentsData,
          teamsData,
          installationSchedulesResponse
        ] = await Promise.all([
          getAllOrders(),
          getAllOrderProducts(),
          getAllProducts(),
          getAllCustomers(),
          getAllBuildings(),
          getAllEmployees(),
          getAllEmployeeTeamAssignments(),
          getAllTeams(),
          fetch(`${REACT_APP_API_BASE_URL}/api/scheduler/installation-schedules`)
            .then(res => res.ok ? res.json() : { success: false, schedules: [] })
            .catch(() => ({ success: false, schedules: [] }))
        ]);

        const installSchedules = installationSchedulesResponse.success ? installationSchedulesResponse.schedules : [];

        // Always use real data from API
        console.log('[InsSchedule] ✅ Using real data from API');
        setOrders(Array.isArray(ordersData) ? ordersData : (ordersData?.data ?? []));
        setOrderProducts(Array.isArray(orderProductsData) ? orderProductsData : (orderProductsData?.data ?? []));
        setProducts(Array.isArray(productsData) ? productsData : (productsData?.data ?? []));
        setCustomers(Array.isArray(customersData) ? customersData : (customersData?.data ?? []));
        setBuildings(Array.isArray(buildingsData) ? buildingsData : (buildingsData?.data ?? []));
        setEmployees(Array.isArray(employeesData) ? employeesData : (employeesData?.data ?? []));
        setAssignments(Array.isArray(assignmentsData) ? assignmentsData : (assignmentsData?.data ?? []));
        setTeams(Array.isArray(teamsData) ? teamsData : (teamsData?.data ?? []));
        setInstallationSchedules(installSchedules);
      } catch (error) {
        console.error('[InsSchedule] ❌ ERROR loading installation data:', error);
        // Set empty arrays on error
        setOrders([]);
        setOrderProducts([]);
        setProducts([]);
        setCustomers([]);
        setBuildings([]);
        setEmployees([]);
        setAssignments([]);
        setTeams([]);
        setInstallationSchedules([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Field accessor helpers
  const field = {
    orderId: (order) => order.id || order.OrderID,
    orderCustomerId: (order) => order.customer_id || order.CustomerID,
    orderBuildingId: (order) => order.building_id || order.BuildingID,
    orderEmployeeId: (order) => order.employee_id || order.EmployeeID,
    orderTimeSlotId: (order) => order.time_slot_id || order.TimeSlotID,
    orderStatus: (order) => order.order_status || order.OrderStatus || 'Pending',
    orderScheduledStart: (order) => order.scheduled_start_date_time || order.ScheduledStartDateTime,
    orderScheduledEnd: (order) => order.scheduled_end_date_time || order.ScheduledEndDateTime,
    deliveryStart: (order) => order.delivery_start_date_time || order.DeliveryStartDateTime,
    deliveryEnd: (order) => order.delivery_end_date_time || order.DeliveryEndDateTime,
    orderAttempts: (order) => order.number_of_attempts || order.NumberOfAttempts || 0,
    orderRating: (order) => order.customer_rating || order.CustomerRating,
    orderFeedback: (order) => order.customer_feedback || order.CustomerFeedback || '',
    orderDelayReason: (order) => order.delay_reason || order.DelayReason || '',
    installStart: (order) => order.install_start_date_time || order.InstallStartDateTime,
    installEnd: (order) => order.install_end_date_time || order.InstallEndDateTime,
    customerId: (cust) => cust.id || cust.CustomerID,
    customerName: (cust) => cust.full_name || cust.FullName || cust.name || '',
    customerEmail: (cust) => cust.email,
    customerPhone: (cust) => cust.phone || cust.contact_number,
    customerAddress: (cust) => cust.address,
    customerCity: (cust) => cust.city,
    customerPostcode: (cust) => cust.postcode || cust.postal_code,
    customerState: (cust) => cust.state,
    buildingId: (bld) => bld.id || bld.building_id || bld.BuildingID,
    buildingName: (bld) => bld.building_name || bld.BuildingName || '',
    buildingType: (bld) => bld.housing_type || bld.HousingType || '',
    buildingPostcode: (bld) => bld.postal_code || bld.PostalCode || '',
    buildingLoadingBay: (bld) => bld.loading_bay_available ?? bld.LoadingBayAvailable ?? false,
    buildingLift: (bld) => bld.lift_available ?? bld.LiftAvailable ?? false,
    buildingAccessStart: (bld) => bld.access_time_window_start || bld.AccessTimeWindowStart || '',
    buildingAccessEnd: (bld) => bld.access_time_window_end || bld.AccessTimeWindowEnd || '',
    buildingPreReg: (bld) => bld.pre_registration_required ?? bld.PreRegistrationRequired ?? false,
    buildingSpecialEquip: (bld) => bld.special_equipment_needed || bld.SpecialEquipmentNeeded || '',
    buildingNarrowDoors: (bld) => bld.narrow_doorways ?? bld.NarrowDoorways ?? false,
    buildingNotes: (bld) => bld.notes || bld.Notes || '',
    productId: (prod) => prod.id || prod.product_id || prod.ProductID,
    productName: (prod) => prod.product_name || prod.ProductName || '',
    productLength: (prod) => prod.package_length_cm || prod.PackageLengthCM || 0,
    productWidth: (prod) => prod.package_width_cm || prod.PackageWidthCM || 0,
    productHeight: (prod) => prod.package_height_cm || prod.PackageHeightCM || 0,
    productInstallMin: (prod) => prod.estimated_installation_time_min || prod.EstimatedInstallationTimeMin || 0,
    productInstallMax: (prod) => prod.estimated_installation_time_max || prod.EstimatedInstallationTimeMax || 0,
    productInstallerRequired: (prod) => prod.installer_team_required_flag ?? prod.InstallerTeamRequiredFlag ?? false,
    productFragile: (prod) => prod.fragile_flag ?? prod.FragileFlag ?? false,
    productNoLieDown: (prod) => prod.no_lie_down_flag ?? prod.NoLieDownFlag ?? false,
    orderProductOrderId: (op) => op.order_id || op.OrderID,
    orderProductProductId: (op) => op.product_id || op.ProductID,
    orderProductQuantity: (op) => op.quantity || op.Quantity || 1,
    employeeId: (emp) => emp.id || emp.EmployeeID,
    employeeName: (emp) => emp.name || emp.displayName || '',
    employeeEmail: (emp) => emp.email,
    employeeContact: (emp) => emp.contactNumber || emp.contact_number || '',
    employeeRole: (emp) => emp.role?.name || emp.roleName || emp.role || '',
    teamId: (team) => team.id || team.TeamID,
    teamType: (team) => team.team_type || team.TeamType || '',
    teamActive: (team) => team.available_flag ?? team.AvailableFlag ?? true,
    installScheduleId: (is) => is.id,
    installScheduleOrderId: (is) => is.order_id,
    installScheduleTeamId: (is) => is.installation_team_id,
    installScheduleEstArrival: (is) => is.estimated_arrival_time,
    installScheduleStatus: (is) => is.status || 'Scheduled'
  };

  const getEmployeeId = () => {
    return currentUser?.employeeId || sessionStorage.getItem('employeeId') || '';
  };

  const getAssignmentTeamId = (assignment) => {
    return assignment?.team_id || assignment?.TeamID || assignment?.teamId || assignment?.team?.id || assignment?.team?.TeamID || null;
  };

  const getAssignmentEmployeeId = (assignment) => {
    return assignment?.employee_id || assignment?.EmployeeID || assignment?.employeeId || assignment?.employee?.id || assignment?.employee?.EmployeeID || null;
  };

  const installationTeams = teams.filter(team => field.teamActive(team) && field.teamType(team).toLowerCase().includes('installation'));

  useEffect(() => {
    if (!teamAutoSelectEnabled) return;
    if (selectedTeam !== 'all') return;
    if (installationTeams.length === 0) return;

    const employeeId = getEmployeeId();
    const assignment = assignments.find(a => String(getAssignmentEmployeeId(a)) === String(employeeId));
    if (!assignment) {
      const randomTeam = installationTeams[Math.floor(Math.random() * installationTeams.length)];
      if (randomTeam) setSelectedTeam(field.teamId(randomTeam));
      return;
    }

    const assignedTeamId = getAssignmentTeamId(assignment);
    const matchedTeam = installationTeams.find(team => String(field.teamId(team)) === String(assignedTeamId));
    if (matchedTeam) {
      setSelectedTeam(field.teamId(matchedTeam));
    } else {
      const randomTeam = installationTeams[Math.floor(Math.random() * installationTeams.length)];
      if (randomTeam) setSelectedTeam(field.teamId(randomTeam));
    }
  }, [assignments, installationTeams, currentUser, selectedTeam, teamAutoSelectEnabled]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Installing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Delivered':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'Loaded':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'Scheduled':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'In Progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Installing':
        return <Clock className="w-4 h-4" />;
      case 'Delivered':
        return <CheckCircle className="w-4 h-4" />;
      case 'Loaded':
        return <Package className="w-4 h-4" />;
      case 'Scheduled':
        return <Calendar className="w-4 h-4" />;
      case 'In Progress':
        return <Clock className="w-4 h-4" />;
      case 'Completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'Cancelled':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  // Use installation schedules if available, otherwise fall back to filtering orders
  const useSchedules = installationSchedules.length > 0;

  // Get installation orders from schedules or filter orders that require installation
  const installationOrders = useSchedules
    ? installationSchedules.map(schedule => {
        // Find the related order
        const order = orders.find(o => field.orderId(o) === field.installScheduleOrderId(schedule));
        return {
          ...order,
          installationSchedule: schedule
        };
      }).filter(item => item.id) // Only include if order was found
    : orders.filter(order => {
        const orderProds = orderProducts.filter(op => field.orderProductOrderId(op) === field.orderId(order));
        return orderProds.some(op => {
          const product = products.find(p => field.productId(p) === field.orderProductProductId(op));
          return product && field.productInstallerRequired(product);
        });
      });

  // Filter orders by date and team
  const filteredOrders = installationOrders.filter(order => {
    // For scheduled installations, use estimated_arrival_time
    if (order.installationSchedule) {
      const estArrival = field.installScheduleEstArrival(order.installationSchedule);
      if (!estArrival) return false;
      const arrivalDate = new Date(estArrival).toISOString().split('T')[0];
      const dateMatch = arrivalDate === selectedDate;

      // Filter by team if selected
      if (selectedTeam !== 'all') {
        const teamId = field.installScheduleTeamId(order.installationSchedule);
        return dateMatch && teamId === selectedTeam;
      }

      return dateMatch;
    } else {
      // Fall back to scheduled start time for unscheduled orders
      const scheduledStart = field.orderScheduledStart(order);
      if (!scheduledStart) return false;
      const orderDate = new Date(scheduledStart).toISOString().split('T')[0];
      if (orderDate !== selectedDate) return false;
      return selectedTeam === 'all';
    }
  });
  const formatTime = (dateTime) => {
    if (!dateTime) return 'Not started';
    try {
      const date = new Date(dateTime);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return 'Invalid time';
    }
  };

  const formatDate = (dateTime) => {
    if (!dateTime) return '';
    try {
      const date = new Date(dateTime);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading installation schedule...</p>
        </div>
      </div>
    );
  }

  const orderRequiresInstaller = (order) => {
    const orderProds = orderProducts.filter(op => field.orderProductOrderId(op) === field.orderId(order));
    return orderProds.some(op => {
      const product = products.find(p => field.productId(p) === field.orderProductProductId(op));
      return product && field.productInstallerRequired(product);
    });
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const result = await updateOrderStatusApi(orderId, newStatus);
      const updated = result?.order;
      setOrders(prev => prev.map(order =>
        field.orderId(order) === orderId
          ? (updated ? { ...order, ...updated } : { ...order, order_status: newStatus, OrderStatus: newStatus })
          : order
      ));
    } catch (error) {
      console.error('Failed to update order status:', error);
      alert('Failed to update order status. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-full mx-auto">
        {/* <h1 className="text-2xl font-bold text-gray-900 mb-6">Installation Schedule</h1> */}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Team</label>
              <select
                value={selectedTeam}
                onChange={(e) => {
                  setSelectedTeam(e.target.value);
                  setTeamAutoSelectEnabled(false);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Teams</option>
                {installationTeams.map(team => (
                  <option key={field.teamId(team)} value={field.teamId(team)}>
                    {field.teamType(team)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Schedule Cards */}
        <div className="space-y-6">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No installations scheduled</h3>
              <p className="text-gray-600">There are no installations scheduled for the selected date and team.</p>
            </div>
          ) : (
            filteredOrders.map(order => {
              const customer = customers.find(c => field.customerId(c) === field.orderCustomerId(order));
              const building = buildings.find(b => field.buildingId(b) === field.orderBuildingId(order));
              const employee = employees.find(e => field.employeeId(e) === field.orderEmployeeId(order));

              // Get installation schedule info if available
              const installSchedule = order.installationSchedule;
              const installTeam = installSchedule ? teams.find(t => field.teamId(t) === field.installScheduleTeamId(installSchedule)) : null;
              const estArrival = installSchedule ? field.installScheduleEstArrival(installSchedule) : null;
              const orderStatus = field.orderStatus(order);
              const installStatus = orderStatus === 'Completed'
                ? 'Completed'
                : (installSchedule ? field.installScheduleStatus(installSchedule) : orderStatus);
              const requiresInstaller = orderRequiresInstaller(order);

              // Get products for this order
              const orderProds = orderProducts.filter(op => field.orderProductOrderId(op) === field.orderId(order));
              const orderProductsDetails = orderProds.map(op => {
                const product = products.find(p => field.productId(p) === field.orderProductProductId(op));
                return {
                  ...op,
                  product
                };
              }).filter(op => op.product && field.productInstallerRequired(op.product));

              return (
                <div key={field.orderId(order)} className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-xl font-semibold text-gray-900">{field.orderId(order)}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium border flex items-center space-x-1 ${getStatusColor(installStatus)}`}>
                        {getStatusIcon(installStatus)}
                        <span>{installStatus}</span>
                      </span>
                      {installTeam && (
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                          {field.teamType(installTeam)}
                        </span>
                      )}
                    </div>
                    {requiresInstaller && orderStatus === 'Delivered' && (
                      <button
                        onClick={() => updateOrderStatus(field.orderId(order), 'Installing')}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Start Installation"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                    )}
                    {requiresInstaller && orderStatus === 'Installing' && (
                      <button
                        onClick={() => updateOrderStatus(field.orderId(order), 'Completed')}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Mark Installation Completed"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Attempt #{field.orderAttempts(order) || 1}</p>
                      {field.orderRating(order) && (
                        <div className="flex items-center justify-end mt-1">
                          <span className="text-yellow-400">★</span>
                          <span className="text-sm font-medium ml-1">{field.orderRating(order)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column */}
                    <div className="space-y-4">
                      {/* Time Information */}
                      <div className="bg-blue-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                          <Clock className="w-4 h-4 mr-2 text-blue-600" />
                          Schedule
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {estArrival && (
                            <div className="col-span-2 mb-2">
                              <p className="text-gray-600">Estimated Arrival</p>
                              <p className="font-medium text-blue-600 text-lg">
                                {formatTime(estArrival)} ({formatDate(estArrival)})
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-gray-600">Scheduled</p>
                            <p className="font-medium">
                              {formatTime(field.orderScheduledStart(order))} - {formatTime(field.orderScheduledEnd(order))}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Delivery</p>
                            <p className="font-medium">
                              {field.deliveryStart(order) ? formatTime(field.deliveryStart(order)) : 'Not started'} -
                              {field.deliveryEnd(order) ? formatTime(field.deliveryEnd(order)) : 'Not completed'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Install Start</p>
                            <p className="font-medium">
                              {field.installStart(order) ? formatTime(field.installStart(order)) : 'Not started'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Install End</p>
                            <p className="font-medium">
                              {field.installEnd(order) ? formatTime(field.installEnd(order)) : 'Not completed'}
                            </p>
                          </div>
                        </div>
                        {field.orderDelayReason(order) && (
                          <div className="mt-3 p-2 bg-yellow-100 rounded text-sm">
                            <span className="font-medium text-yellow-800">Delay Reason: </span>
                            <span className="text-yellow-700">{field.orderDelayReason(order)}</span>
                          </div>
                        )}
                      </div>

                      {/* Customer Information */}
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                          <User className="w-4 h-4 mr-2 text-blue-600" />
                          Customer
                        </h4>
                        {customer ? (
                          <div className="space-y-2 text-sm">
                            <p className="font-medium">{field.customerName(customer)}</p>
                            <div className="flex items-center space-x-2">
                              <Phone className="w-3 h-3 text-gray-400" />
                              <span>{field.customerPhone(customer)}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Mail className="w-3 h-3 text-gray-400" />
                              <span>{field.customerEmail(customer)}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Customer information not available</p>
                        )}
                      </div>

                      {/* Team & Employee */}
                      {employee && (
                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                            <User className="w-4 h-4 mr-2 text-blue-600" />
                            Assignment
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-gray-600">Technician: </span>
                              <span className="font-medium">{field.employeeName(employee)}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Contact: </span>
                              <span>{field.employeeContact(employee)}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Role: </span>
                              <span>{field.employeeRole(employee)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column */}
                    <div className="space-y-4">
                      {/* Product Information */}
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                          <Package className="w-4 h-4 mr-2 text-blue-600" />
                          Products ({orderProductsDetails.length})
                        </h4>
                        <div className="space-y-3">
                          {orderProductsDetails.map((op, idx) => {
                            const product = op.product;
                            return (
                              <div key={idx} className="border-b last:border-b-0 pb-3 last:pb-0">
                                <div className="space-y-2 text-sm">
                                  <p className="font-medium text-blue-600">
                                    {field.orderProductQuantity(op)}x {field.productName(product)}
                                  </p>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="text-gray-600">Dimensions: </span>
                                      <span>{field.productLength(product)} × {field.productWidth(product)} × {field.productHeight(product)} cm</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">Install Time: </span>
                                      <span>{field.productInstallMin(product)}-{field.productInstallMax(product)} min</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2 flex-wrap gap-1">
                                    {field.productInstallerRequired(product) && (
                                      <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">Installer Required</span>
                                    )}
                                    {field.productFragile(product) && (
                                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">Fragile</span>
                                    )}
                                    {field.productNoLieDown(product) && (
                                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">Keep Upright</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Location Information */}
                      {building && customer && (
                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                            <MapPin className="w-4 h-4 mr-2 text-blue-600" />
                            Location
                          </h4>
                          <div className="space-y-2 text-sm">
                            <p className="font-medium">{field.buildingName(building)}</p>
                            <p>{field.customerAddress(customer)}</p>
                            <p>{field.customerCity(customer)}, {field.customerState(customer)} {field.buildingPostcode(building)}</p>

                            <div className="mt-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Access Hours:</span>
                                <span>{field.buildingAccessStart(building)} - {field.buildingAccessEnd(building)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Loading Bay:</span>
                                <span className={field.buildingLoadingBay(building) ? 'text-green-600' : 'text-red-600'}>
                                  {field.buildingLoadingBay(building) ? 'Available' : 'Not Available'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Lift Access:</span>
                                <span className={field.buildingLift(building) ? 'text-green-600' : 'text-red-600'}>
                                  {field.buildingLift(building) ? 'Available' : 'Not Available'}
                                </span>
                              </div>
                            </div>

                            {field.buildingSpecialEquip(building) && (
                              <div className="mt-3 p-2 bg-yellow-50 rounded">
                                <p className="font-medium text-yellow-800 mb-1 text-xs">Special Equipment Required:</p>
                                <p className="text-yellow-700 text-xs">{field.buildingSpecialEquip(building)}</p>
                              </div>
                            )}

                            {field.buildingNarrowDoors(building) && (
                              <div className="mt-2 p-2 bg-orange-50 rounded">
                                <p className="text-orange-700 text-xs font-medium">⚠️ Narrow doorways - Take precaution</p>
                              </div>
                            )}

                            {field.buildingNotes(building) && (
                              <div className="mt-2 p-2 bg-gray-50 rounded">
                                <p className="text-gray-700 text-xs">{field.buildingNotes(building)}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Feedback */}
                      {field.orderFeedback(order) && (
                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-2">Customer Feedback</h4>
                          <p className="text-sm text-gray-600 italic">"{field.orderFeedback(order)}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default InstallationSchedule;
