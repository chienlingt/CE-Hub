import {
  Calendar,
  Check,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  Package,
  Phone,
  Play,
  Route,
  Star,
  Timer,
  User
} from 'lucide-react';
import { getSlotStatusStyle, getSlotStatusLabel } from '../../utils/slotStatusHelpers';
import { toLocalDateKey, todayLocalDateKey } from '../../utils/dateKey';
import { useEffect, useState } from 'react';
import LoadingChecklist from '../common/LoadingChecklist';
import { ScannerSection } from '../common/ScanStation';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAllBuildings,
  getAllCustomers,
  getAllEmployeeTeamAssignments,
  getAllOrderProducts,
  getAllOrders,
  getAllProducts,
  getAllTeams,
  getAllTimeSlots,
  getAllTrucks,
} from '../../services/informationService';
import { API_BASE_URL } from '../../utils/apiBaseUrl';

export default function DeliverySchedule() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [orderProducts, setOrderProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [teams, setTeams] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayLocalDateKey());
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [teamAutoSelectEnabled, setTeamAutoSelectEnabled] = useState(true);
  const [endingTrip, setEndingTrip] = useState(null); // timeSlotId being ended

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
          assignmentsData,
          timeSlotsData,
          teamsData,
          trucksData
        ] = await Promise.all([
          getAllOrders(),
          getAllOrderProducts(),
          getAllProducts(),
          getAllCustomers(),
          getAllBuildings(),
          getAllEmployeeTeamAssignments(),
          getAllTimeSlots(),
          getAllTeams(),
          getAllTrucks()
        ]);

        // Always use real data from API
        console.log('[DelSchedule] ✅ Using real data from API');
        setOrders(Array.isArray(ordersData) ? ordersData : (ordersData?.data ?? []));
        setOrderProducts(Array.isArray(orderProductsData) ? orderProductsData : (orderProductsData?.data ?? []));
        setProducts(Array.isArray(productsData) ? productsData : (productsData?.data ?? []));
        setCustomers(Array.isArray(customersData) ? customersData : (customersData?.data ?? []));
        setBuildings(Array.isArray(buildingsData) ? buildingsData : (buildingsData?.data ?? []));
        setAssignments(Array.isArray(assignmentsData) ? assignmentsData : (assignmentsData?.data ?? []));
        setTimeSlots(Array.isArray(timeSlotsData) ? timeSlotsData : (timeSlotsData?.data ?? []));
        setTeams(Array.isArray(teamsData) ? teamsData : (teamsData?.data ?? []));
        setTrucks(Array.isArray(trucksData) ? trucksData : (trucksData?.data ?? []));
      } catch (error) {
        console.error('[DelSchedule] ❌ ERROR loading delivery data:', error);
        // Set empty arrays on error
        setOrders([]);
        setOrderProducts([]);
        setProducts([]);
        setCustomers([]);
        setBuildings([]);
        setAssignments([]);
        setTimeSlots([]);
        setTeams([]);
        setTrucks([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    // Auto-refresh orders every 30s so status changes (dispatch, deliver) appear without manual reload
    const refreshTimer = setInterval(() => getAllOrders().then(d => setOrders(Array.isArray(d) ? d : (d?.data ?? []))), 30000);
    return () => clearInterval(refreshTimer);
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
    orderDeliveryStart: (order) => order.delivery_start_date_time || order.DeliveryStartDateTime || order.actual_start_date_time || order.ActualStartDateTime,
    orderDeliveryEnd: (order) => order.delivery_end_date_time || order.DeliveryEndDateTime || order.actual_arrival_date_time || order.ActualArrivalDateTime,
    orderAttempts: (order) => order.number_of_attempts || order.NumberOfAttempts || 0,
    orderRating: (order) => order.customer_rating || order.CustomerRating,
    orderFeedback: (order) => order.customer_feedback || order.CustomerFeedback || '',
    orderProofUrl: (order) => order.proof_of_delivery_url || order.ProofOfDeliveryURL,
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
    buildingAddress: (bld, cust) => {
      if (!cust) return field.buildingName(bld);
      const addr = field.customerAddress(cust);
      const city = field.customerCity(cust);
      const state = field.customerState(cust);
      return [addr, city, state].filter(Boolean).join(', ');
    },
    productId: (prod) => prod.id || prod.product_id || prod.ProductID,
    productName: (prod) => prod.product_name || prod.ProductName || '',
    orderProductOrderId: (op) => op.order_id || op.OrderID,
    orderProductProductId: (op) => op.product_id || op.ProductID,
    orderProductQuantity: (op) => op.quantity || op.Quantity || 1,
    timeSlotId: (ts) => ts.id || ts.TimeSlotID,
    timeSlotDate: (ts) => ts.date || ts.Date,
    timeSlotStart: (ts) => ts.time_window_start || ts.TimeWindowStart,
    timeSlotEnd: (ts) => ts.time_window_end || ts.TimeWindowEnd,
    timeSlotAvailable: (ts) => ts.available_flag ?? ts.AvailableFlag ?? true,
    timeSlotDeliveryTeamId: (ts) => ts.delivery_team_id || ts.DeliveryTeamID,
    timeSlotWarehouseTeamId: (ts) => ts.warehouse_team_id || ts.WarehouseTeamID,
    timeSlotTruckId: (ts) => ts.truck_id || ts.TruckID,
    orderLoadingSequence: (order) => order.truck_loading_sequence || order.TruckLoadingSequence || null,
    teamId: (team) => team.id || team.TeamID,
    teamType: (team) => team.team_type || team.TeamType || '',
    teamActive: (team) => team.available_flag ?? team.AvailableFlag ?? true,
    truckId: (truck) => truck.id || truck.TruckID,
    truckPlate: (truck) => truck.plate_no || truck.PlateNo || truck.CarPlate || ''
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

  const deliveryTeams = teams.filter(team => field.teamActive(team) && field.teamType(team).toLowerCase().includes('delivery'));

  useEffect(() => {
    if (!teamAutoSelectEnabled) return;
    if (selectedTeam !== 'all') return;
    if (deliveryTeams.length === 0) return;

    const employeeId = getEmployeeId();
    const assignment = assignments.find(a => String(getAssignmentEmployeeId(a)) === String(employeeId));
    if (!assignment) {
      const randomTeam = deliveryTeams[Math.floor(Math.random() * deliveryTeams.length)];
      if (randomTeam) setSelectedTeam(field.teamId(randomTeam));
      return;
    }

    const assignedTeamId = getAssignmentTeamId(assignment);
    const matchedTeam = deliveryTeams.find(team => String(field.teamId(team)) === String(assignedTeamId));
    if (matchedTeam) {
      setSelectedTeam(field.teamId(matchedTeam));
    } else {
      const randomTeam = deliveryTeams[Math.floor(Math.random() * deliveryTeams.length)];
      if (randomTeam) setSelectedTeam(field.teamId(randomTeam));
    }
  }, [assignments, deliveryTeams, currentUser, selectedTeam, teamAutoSelectEnabled]);

  // Filter orders for delivery (scheduled orders only)
  const deliveryOrders = orders.filter(order => {
    const status = field.orderStatus(order);
    return ['Scheduled', 'Loaded', 'Delivering', 'In Progress', 'Delivered'].includes(status);
  });

  // Filter orders by selected date
  const filteredOrders = deliveryOrders.filter(order => {
    const scheduledStart = field.orderScheduledStart(order);
    const timeSlot = timeSlots.find(ts => String(field.timeSlotId(ts)) === String(field.orderTimeSlotId(order)));
    const slotDate = timeSlot ? field.timeSlotDate(timeSlot) : null;
    const orderDate = slotDate
      ? toLocalDateKey(slotDate)
      : (scheduledStart ? toLocalDateKey(scheduledStart) : null);
    if (!orderDate) return false;
    if (orderDate !== selectedDate) return false;
    if (selectedTeam === 'all') return true;
    const deliveryTeamId = timeSlot ? field.timeSlotDeliveryTeamId(timeSlot) : null;
    return String(deliveryTeamId) === String(selectedTeam);
  });


  // Group orders by time slot
  const groupedOrders = filteredOrders.reduce((groups, order) => {
    const timeSlotId = field.orderTimeSlotId(order) || 'unassigned';
    if (!groups[timeSlotId]) {
      groups[timeSlotId] = [];
    }
    groups[timeSlotId].push(order);
    return groups;
  }, {});

  // Sort orders within each time slot by truck loading sequence (or scheduled time as fallback)
  Object.keys(groupedOrders).forEach(timeSlotId => {
    groupedOrders[timeSlotId].sort((a, b) => {
      const seqA = a.truck_loading_sequence || a.TruckLoadingSequence;
      const seqB = b.truck_loading_sequence || b.TruckLoadingSequence;

      // If both have loading sequence, sort by that (lower sequence = delivered first)
      if (seqA && seqB) {
        return seqA - seqB;
      }

      // Otherwise fallback to scheduled time
      return new Date(field.orderScheduledStart(a)) - new Date(field.orderScheduledStart(b));
    });
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Delivering': return 'bg-blue-100 text-blue-800';
      case 'Loaded': return 'bg-indigo-100 text-indigo-800';
      case 'Delivered': return 'bg-green-100 text-green-800';
      case 'In Progress': return 'bg-blue-100 text-blue-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Failed': return 'bg-red-100 text-red-800';
      case 'Scheduled': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTime = (date) => {
    if (!date) return 'N/A';
    try {
      return new Date(date).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return 'N/A';
    }
  };

  const generateGoogleMapsRoute = (orders) => {
    if (orders.length === 0) return '#';

    const addresses = orders.map(order => {
      const customer = customers.find(c => field.customerId(c) === field.orderCustomerId(order));
      const building = buildings.find(b => field.buildingId(b) === field.orderBuildingId(order));
      return field.buildingAddress(building, customer);
    }).filter(Boolean);

    if (addresses.length === 0) return '#';

    const waypoints = addresses.map(addr => encodeURIComponent(addr)).join('|');
    const destination = encodeURIComponent(addresses[addresses.length - 1]);

    return `https://www.google.com/maps/dir/Current+Location/${waypoints}/${destination}`;
  };

  const generateSingleLocationMap = (address) => {
    return `https://www.google.com/maps/search/${encodeURIComponent(address)}`;
  };

  // A.3.6a: slot status helpers — imported from slotStatusHelpers.js

  // A.3.6a: End Trip — calls POST /api/time-slots/:id/end-trip
  const endTrip = async (timeSlotId, slotOrders) => {
    const nonTerminal = slotOrders.filter(o => !['Delivered','Cancelled','Failed'].includes(field.orderStatus(o)));
    if (nonTerminal.length > 0) {
      alert(`Cannot end trip — ${nonTerminal.length} order(s) are still in progress.`);
      return;
    }
    if (!window.confirm('Confirm truck has returned and all orders are done?')) return;
    setEndingTrip(timeSlotId);
    try {
      const employeeId = getEmployeeId();
      const res = await fetch(`${API_BASE_URL}/api/time-slots/${timeSlotId}/end-trip`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ employee_id: employeeId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { time_slot } = await res.json();
      setTimeSlots(prev => prev.map(ts =>
        ts.id === timeSlotId ? { ...ts, slot_status: time_slot.slot_status, ended_at: time_slot.ended_at } : ts
      ));
    } catch (err) {
      console.error('[DelSchedule] End trip failed:', err.message);
      alert(`Failed to end trip: ${err.message}`);
    } finally {
      setEndingTrip(null);
    }
  };


  const getEstimatedDuration = (order) => {
    // Calculate estimated duration based on products
    const orderProds = orderProducts.filter(op => field.orderProductOrderId(op) === field.orderId(order));
    let totalMinutes = 30; // Base delivery time

    orderProds.forEach(op => {
      const product = products.find(p => field.productId(p) === field.orderProductProductId(op));
      if (product) {
        const installMin = product.estimated_installation_time_min || 0;
        totalMinutes += installMin * field.orderProductQuantity(op);
      }
    });

    return totalMinutes;
  };

  const getTotalEstimatedTime = (orders) => {
    return orders.reduce((total, order) => total + getEstimatedDuration(order), 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading delivery schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-full mx-auto">
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
                {deliveryTeams.map(team => (
                  <option key={field.teamId(team)} value={field.teamId(team)}>
                    {field.teamType(team)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Time Slot Schedule */}
        <div className="space-y-6">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No deliveries scheduled</h3>
              <p className="text-gray-600">There are no deliveries scheduled for the selected date.</p>
            </div>
          ) : (
            Object.entries(groupedOrders).map(([timeSlotId, timeSlotOrders]) => {
              const timeSlot = timeSlots.find(ts => field.timeSlotId(ts) === timeSlotId);
              const totalTime = getTotalEstimatedTime(timeSlotOrders);
              const completedOrders = timeSlotOrders.filter(o => field.orderStatus(o) === 'Delivered').length;

              // Get team and truck info from timeslot
              const deliveryTeam = timeSlot ? teams.find(t => field.teamId(t) === field.timeSlotDeliveryTeamId(timeSlot)) : null;
              const warehouseTeam = timeSlot ? teams.find(t => field.teamId(t) === field.timeSlotWarehouseTeamId(timeSlot)) : null;
              const truck = timeSlot ? trucks.find(tr => field.truckId(tr) === field.timeSlotTruckId(timeSlot)) : null;
              const slotStatus = timeSlot?.slot_status || 'scheduled';
              const isActive = slotStatus === 'out_for_delivery';

              return (
                <div key={timeSlotId} className={`bg-white rounded-xl shadow-sm overflow-hidden ${isActive ? 'border-2 border-orange-400' : 'border border-gray-100'}`}>
                  {/* A.3.6a: Active indicator strip */}
                  {isActive && (
                    <div className="bg-orange-500 text-white text-xs font-semibold text-center py-1 tracking-wide">
                      TRUCK IS OUT FOR DELIVERY
                    </div>
                  )}
                  {/* Time Slot Header */}
                  <div className={`p-6 border-b border-gray-100 ${isActive ? 'bg-gradient-to-r from-orange-50 to-amber-50' : 'bg-gradient-to-r from-blue-50 to-indigo-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Clock className={`h-6 w-6 mr-3 ${isActive ? 'text-orange-600' : 'text-blue-600'}`} />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {timeSlot ? `${field.timeSlotStart(timeSlot)} - ${field.timeSlotEnd(timeSlot)}` : 'Time Slot'}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {timeSlot ? field.timeSlotDate(timeSlot) : 'Unassigned Time Slot'}
                          </p>
                          {/* Team, Truck and Slot Status */}
                          <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                            {/* A.3.6a: slot status badge */}
                            <span className={`px-2 py-1 rounded font-medium ${getSlotStatusStyle(slotStatus)}`}>
                              {getSlotStatusLabel(slotStatus)}
                            </span>
                            {timeSlot?.departed_at && (
                              <span className="text-gray-500">
                                Departed: {new Date(timeSlot.departed_at).toLocaleTimeString()}
                              </span>
                            )}
                            {deliveryTeam && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                                Delivery: {field.teamType(deliveryTeam)}
                              </span>
                            )}
                            {warehouseTeam && (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
                                Warehouse: {field.teamType(warehouseTeam)}
                              </span>
                            )}
                            {truck && (
                              <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">
                                Truck: {field.truckPlate(truck)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-blue-600">{timeSlotOrders.length}</p>
                          <p className="text-xs text-gray-600">Orders</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-green-600">{completedOrders}</p>
                          <p className="text-xs text-gray-600">Completed</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-purple-600">{totalTime}m</p>
                          <p className="text-xs text-gray-600">Est. Time</p>
                        </div>
                        <a
                          href={generateGoogleMapsRoute(timeSlotOrders)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Route className="h-4 w-4 mr-2" />
                          Optimal Route
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                        {/* A.3.6a: End Trip button — visible when slot is active */}
                        {isActive && (
                          <button
                            onClick={() => endTrip(timeSlotId, timeSlotOrders)}
                            disabled={endingTrip === timeSlotId}
                            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            <Check className="h-4 w-4 mr-2" />
                            {endingTrip === timeSlotId ? 'Ending…' : 'End Trip'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Orders List */}
                  <div className="p-6">
                    <div className="space-y-4">
                      {timeSlotOrders.map((order, index) => {
                        const customer = customers.find(c => field.customerId(c) === field.orderCustomerId(order));
                        const building = buildings.find(b => field.buildingId(b) === field.orderBuildingId(order));
                        const orderProds = orderProducts.filter(op => field.orderProductOrderId(op) === field.orderId(order));
                        const orderProductNames = orderProds.map(op => {
                          const product = products.find(p => field.productId(p) === field.orderProductProductId(op));
                          return product ? `${field.orderProductQuantity(op)}x ${field.productName(product)}` : '';
                        }).filter(Boolean);

                        const loadingSeq = field.orderLoadingSequence(order);
                        const status = field.orderStatus(order);

                        return (
                          <div key={field.orderId(order)} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                              {/* Sequence Number */}
                              <div className="lg:col-span-1">
                                <div className="flex flex-col items-center gap-1">
                                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                    {index + 1}
                                  </div>
                                  {loadingSeq && (
                                    <span className="text-xs text-gray-500" title="Truck Loading Sequence">
                                      Load: {loadingSeq}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Order Info */}
                              <div className="lg:col-span-4">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold text-gray-900">{field.orderId(order)}</h4>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(field.orderStatus(order))}`}>
                                    {field.orderStatus(order)}
                                  </span>
                                </div>
                                <div className="space-y-1 text-sm text-gray-600">
                                  {customer && (
                                    <>
                                      <div className="flex items-center gap-1">
                                        <User className="h-3 w-3 flex-shrink-0" />
                                        <span>{field.customerName(customer)}</span>
                                      </div>
                                      {/* Customer phone*/}
                                      <div className="flex items-center gap-1">
                                        <Phone className="h-3 w-3 flex-shrink-0" />
                                        <span>{field.customerPhone(customer) || 'N/A'}</span>
                                      </div>
                                      {/* Contact person at site from remarks */}
                                      {order.remarks_contact_phone && (
                                        <div className="flex items-center gap-1">
                                          <Phone className="h-3 w-3 flex-shrink-0 text-blue-400" />
                                          <span className="text-blue-700 font-medium">{order.remarks_contact_phone}</span>
                                          {order.remarks_contact_name && (
                                            <span className="text-blue-500 text-xs">({order.remarks_contact_name})</span>
                                          )}
                                          <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">site contact</span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                  <div className="flex items-center">
                                    <Package className="h-3 w-3 mr-1" />
                                    {orderProductNames.length > 0 ? orderProductNames.join(', ') : 'No items'}
                                  </div>
                                </div>
                              </div>

                              {/* Address */}
                              <div className="lg:col-span-3">
                                <div className="flex items-start">
                                  <MapPin className="h-4 w-4 mr-2 mt-0.5 text-gray-400 flex-shrink-0" />
                                  <div className="space-y-1 min-w-0">
                                    {/* Remarks address takes priority */}
                                    {order.remarks_delivery_address ? (
                                      <>
                                        <p className="text-sm text-blue-800 font-semibold leading-tight">{order.remarks_delivery_address}</p>
                                        <p className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded inline-block">from remarks</p>
                                        {order.original_delivery_address && (
                                          <p className="text-xs text-gray-400 line-through leading-tight">{order.original_delivery_address}</p>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-sm text-gray-900 font-medium">{building ? field.buildingName(building) : 'No building'}</p>
                                        <p className="text-xs text-gray-600">{field.buildingAddress(building, customer)}</p>
                                      </>
                                    )}
                                    {/* Driver notes */}
                                    {(order.delivery_notes || order.remarks_driver_notes) && (
                                      <p className="text-xs text-amber-700 bg-amber-50 px-1.5 py-1 rounded border border-amber-200 leading-tight mt-1">
                                        {order.delivery_notes || order.remarks_driver_notes}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Time Info */}
                              <div className="lg:col-span-2">
                                <div className="text-sm">
                                  <div className="flex items-center text-gray-600 mb-1">
                                    <Timer className="h-3 w-3 mr-1" />
                                    Est. {getEstimatedDuration(order)}m
                                  </div>
                                  {field.orderDeliveryStart(order) && (
                                    <div className="text-blue-600">
                                      Delivery Start: {formatTime(field.orderDeliveryStart(order))}
                                    </div>
                                  )}
                                  {field.orderDeliveryEnd(order) && (
                                    <div className="text-green-600">
                                      Delivery End: {formatTime(field.orderDeliveryEnd(order))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Actions — only navigation button remains */}
                              <div className="lg:col-span-2 flex items-center space-x-2">
                                <a
                                  href={generateSingleLocationMap(field.buildingAddress(building, customer))}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                                >
                                  <Navigation className="h-4 w-4 mr-1" />
                                  Navigate
                                </a>
                              </div>
                            </div>

                            {/* A2 — Loading Checklist (read-only progress) + Unloading Checklist (at customer) */}
                            {field.orderId(order) && !['Delivered'].includes(status) && (
                              <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                                {/* Loading stage — read-only; departure via DriverDashboard Leave warehouse */}
                                {!['Delivering', 'Delivered'].includes(status) && (
                                  <>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                      Loading Checklist
                                    </p>
                                    <LoadingChecklist
                                      orderId={field.orderId(order)}
                                      orderRef={order.odoo_order_ref || 'Not Synced'}
                                      customerName={customer ? field.customerName(customer) : ''}
                                      stage="driver"
                                      employeeId={currentUser?.employeeId || null}
                                    />
                                    {/* A2 — Scan Station (loading) */}
                                    <div className="mt-3">
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                        Scan Items to Load
                                      </p>
                                      <ScannerSection
                                        order={order}
                                        stage="driver"
                                        employeeId={currentUser?.employeeId || null}
                                        items={orderProducts.filter(op =>
                                          field.orderProductOrderId(op) === field.orderId(order)
                                        )}
                                        onItemUpdated={(updatedItem) => {
                                          setOrderProducts(prev =>
                                            prev.map(op => op.id === updatedItem.id ? { ...op, ...updatedItem } : op)
                                          );
                                        }}
                                      />
                                    </div>
                                  </>
                                )}
                                {/* Unloading stage — shown when en route OR after delivered */}
                                {['Delivering', 'Delivered'].includes(status) && (
                                  <>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                      Unloading Checklist
                                    </p>
                                    <LoadingChecklist
                                      orderId={field.orderId(order)}
                                      orderRef={order.odoo_order_ref || 'Not Synced'}
                                      customerName={customer ? field.customerName(customer) : ''}
                                      stage="unloading"
                                      employeeId={currentUser?.employeeId || null}
                                    />
                                    {/* A2 — Scan Station (unloading at customer) */}
                                    <div className="mt-3">
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                        Scan Items to Unload
                                      </p>
                                      <ScannerSection
                                        order={order}
                                        stage="unloading"
                                        employeeId={currentUser?.employeeId || null}
                                        items={orderProducts.filter(op =>
                                          field.orderProductOrderId(op) === field.orderId(order)
                                        )}
                                        onItemUpdated={(updatedItem) => {
                                          setOrderProducts(prev =>
                                            prev.map(op => op.id === updatedItem.id ? { ...op, ...updatedItem } : op)
                                          );
                                        }}
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Additional Info for Completed Orders */}
                            {field.orderStatus(order) === 'Delivered' && field.orderRating(order) && (
                              <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center">
                                    <Star className="h-4 w-4 text-yellow-400 mr-1 fill-current" />
                                    <span className="text-sm font-medium">{field.orderRating(order)}/5</span>
                                    {field.orderFeedback(order) && (
                                      <span className="text-sm text-gray-600 ml-3">"{field.orderFeedback(order)}"</span>
                                    )}
                                  </div>
                                  {field.orderProofUrl(order) && (
                                    <a
                                      href={field.orderProofUrl(order)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:text-blue-800"
                                    >
                                      View Proof of Delivery
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
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
}
