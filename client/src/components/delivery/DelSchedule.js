import React, { useState, useEffect } from 'react';
import {
  Clock,
  MapPin,
  Navigation,
  Package,
  User,
  Star,
  CheckCircle,
  AlertCircle,
  Calendar,
  Route,
  Phone,
  Building,
  Timer,
  ExternalLink,
  Play,
  Pause,
  Check
} from 'lucide-react';
import {
  getAllOrders,
  getAllOrderProducts,
  getAllProducts,
  getAllCustomers,
  getAllBuildings,
  getAllEmployees,
  getAllTimeSlots,
  getAllTeams,
  getAllTrucks
} from '../../services/informationService';

export default function DeliverySchedule() {
  const [orders, setOrders] = useState([]);
  const [orderProducts, setOrderProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [teams, setTeams] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [currentOrder, setCurrentOrder] = useState(null);

  // Generate mock data for demonstration
  const generateMockData = () => {
    const today = new Date().toISOString().split('T')[0];

    const mockTrucks = [
      { id: 'TRK_MOCK_001', plate_no: 'WXY1234', tone: 3 },
      { id: 'TRK_MOCK_002', plate_no: 'ABC5678', tone: 5 }
    ];

    const mockTeams = [
      { id: 'TEAM_DEL_001', team_type: 'Delivery Team A' },
      { id: 'TEAM_DEL_002', team_type: 'Delivery Team B' },
      { id: 'TEAM_WH_001', team_type: 'Warehouse Team A' }
    ];

    const mockTimeSlots = [
      {
        id: 'TS_MOCK_001',
        date: today,
        time_window_start: '08:00',
        time_window_end: '12:00',
        available_flag: false,
        delivery_team_id: 'TEAM_DEL_001',
        warehouse_team_id: 'TEAM_WH_001',
        truck_id: 'TRK_MOCK_001'
      },
      {
        id: 'TS_MOCK_002',
        date: today,
        time_window_start: '13:00',
        time_window_end: '17:00',
        available_flag: false,
        delivery_team_id: 'TEAM_DEL_002',
        warehouse_team_id: 'TEAM_WH_001',
        truck_id: 'TRK_MOCK_002'
      }
    ];

    const mockCustomers = [
      { id: 'CUST_MOCK_001', full_name: 'John Tan', phone: '012-3456789', email: 'john@example.com', address: '123 Jalan Raja', city: 'Kuala Lumpur', postcode: '50100', state: 'WP Kuala Lumpur' },
      { id: 'CUST_MOCK_002', full_name: 'Sarah Lee', phone: '012-9876543', email: 'sarah@example.com', address: '456 Jalan Ampang', city: 'Kuala Lumpur', postcode: '50450', state: 'WP Kuala Lumpur' },
      { id: 'CUST_MOCK_003', full_name: 'Ahmad Ibrahim', phone: '013-2468135', email: 'ahmad@example.com', address: '789 Jalan Damansara', city: 'Petaling Jaya', postcode: '47400', state: 'Selangor' }
    ];

    const mockBuildings = [
      { id: 'BLD_MOCK_001', building_name: 'Menara KLCC', postal_code: '50088' },
      { id: 'BLD_MOCK_002', building_name: 'Pavilion Residences', postal_code: '55100' },
      { id: 'BLD_MOCK_003', building_name: 'The Gardens', postal_code: '59200' }
    ];

    const mockProducts = [
      { id: 'PROD_MOCK_001', product_name: 'Samsung Smart TV 55"', estimated_installation_time_min: 30 },
      { id: 'PROD_MOCK_002', product_name: 'LG Washing Machine', estimated_installation_time_min: 45 },
      { id: 'PROD_MOCK_003', product_name: 'Panasonic Air Conditioner', estimated_installation_time_min: 60 }
    ];

    const mockOrders = [
      {
        id: 'ORD_MOCK_001',
        customer_id: 'CUST_MOCK_001',
        building_id: 'BLD_MOCK_001',
        time_slot_id: 'TS_MOCK_001',
        order_status: 'Scheduled',
        scheduled_start_date_time: `${today}T08:00:00`,
        scheduled_end_date_time: `${today}T09:30:00`,
        truck_loading_sequence: 3,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ORD_MOCK_002',
        customer_id: 'CUST_MOCK_002',
        building_id: 'BLD_MOCK_002',
        time_slot_id: 'TS_MOCK_001',
        order_status: 'Scheduled',
        scheduled_start_date_time: `${today}T10:00:00`,
        scheduled_end_date_time: `${today}T11:30:00`,
        truck_loading_sequence: 2,
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ORD_MOCK_003',
        customer_id: 'CUST_MOCK_003',
        building_id: 'BLD_MOCK_003',
        time_slot_id: 'TS_MOCK_002',
        order_status: 'Scheduled',
        scheduled_start_date_time: `${today}T13:00:00`,
        scheduled_end_date_time: `${today}T14:30:00`,
        truck_loading_sequence: 1,
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    const mockOrderProducts = [
      { order_id: 'ORD_MOCK_001', product_id: 'PROD_MOCK_001', quantity: 1 },
      { order_id: 'ORD_MOCK_002', product_id: 'PROD_MOCK_002', quantity: 1 },
      { order_id: 'ORD_MOCK_002', product_id: 'PROD_MOCK_003', quantity: 1 },
      { order_id: 'ORD_MOCK_003', product_id: 'PROD_MOCK_001', quantity: 2 }
    ];

    return {
      orders: mockOrders,
      orderProducts: mockOrderProducts,
      products: mockProducts,
      customers: mockCustomers,
      buildings: mockBuildings,
      timeSlots: mockTimeSlots,
      teams: mockTeams,
      trucks: mockTrucks
    };
  };

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
          timeSlotsData,
          teamsData,
          trucksData
        ] = await Promise.all([
          getAllOrders(),
          getAllOrderProducts(),
          getAllProducts(),
          getAllCustomers(),
          getAllBuildings(),
          getAllTimeSlots(),
          getAllTeams(),
          getAllTrucks()
        ]);

        // Use real data if available, otherwise use mock data
        const hasRealData = ordersData.length > 0 || timeSlotsData.length > 0;

        // if (!hasRealData) {
          const mockData = generateMockData();

          setOrders(mockData.orders);
          setOrderProducts(mockData.orderProducts);
          setProducts(mockData.products);
          setCustomers(mockData.customers);
          setBuildings(mockData.buildings);
          setTimeSlots(mockData.timeSlots);
          setTeams(mockData.teams);
          setTrucks(mockData.trucks);
        // } else {
        //   console.log('[DelSchedule] ✅ Using real data from API');
        //   setOrders(ordersData);
        //   setOrderProducts(orderProductsData);
        //   setProducts(productsData);
        //   setCustomers(customersData);
        //   setBuildings(buildingsData);
        //   setTimeSlots(timeSlotsData);
        //   setTeams(teamsData);
        //   setTrucks(trucksData);
        // }
      } catch (error) {
        console.error('[DelSchedule] ❌ ERROR loading delivery data:', error);
        // Use mock data on error
        const mockData = generateMockData();
        console.log('[DelSchedule] 🔹 Using mock data due to error');
        setOrders(mockData.orders);
        setOrderProducts(mockData.orderProducts);
        setProducts(mockData.products);
        setCustomers(mockData.customers);
        setBuildings(mockData.buildings);
        setTimeSlots(mockData.timeSlots);
        setTeams(mockData.teams);
        setTrucks(mockData.trucks);
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
    orderActualStart: (order) => order.actual_start_date_time || order.ActualStartDateTime,
    orderActualEnd: (order) => order.actual_end_date_time || order.ActualEndDateTime,
    orderActualArrival: (order) => order.actual_arrival_date_time || order.ActualArrivalDateTime,
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
    truckId: (truck) => truck.id || truck.TruckID,
    truckPlate: (truck) => truck.plate_no || truck.PlateNo || truck.CarPlate || ''
  };

  // Filter orders for delivery (scheduled orders only)
  const deliveryOrders = orders.filter(order => {
    const status = field.orderStatus(order);
    return status === 'Scheduled' || status === 'In Progress' || status === 'Completed';
  });

  // Filter orders by selected date
  const filteredOrders = deliveryOrders.filter(order => {
    const scheduledStart = field.orderScheduledStart(order);
    if (!scheduledStart) return false;
    const orderDate = new Date(scheduledStart).toISOString().split('T')[0];
    return orderDate === selectedDate;
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
      case 'Completed': return 'bg-green-100 text-green-800';
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

  const updateOrderStatus = async (orderId, newStatus) => {
    // TODO: Call API to update order status
    setOrders(prev => prev.map(order =>
      field.orderId(order) === orderId
        ? { ...order, order_status: newStatus, OrderStatus: newStatus, actual_start_date_time: newStatus === 'In Progress' ? new Date() : order.actual_start_date_time }
        : order
    ));
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Navigation className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Delivery Schedule</h1>
                <p className="text-gray-600">Optimized delivery routes and schedules</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
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
              const completedOrders = timeSlotOrders.filter(o => field.orderStatus(o) === 'Completed').length;

              // Get team and truck info from timeslot
              const deliveryTeam = timeSlot ? teams.find(t => field.teamId(t) === field.timeSlotDeliveryTeamId(timeSlot)) : null;
              const warehouseTeam = timeSlot ? teams.find(t => field.teamId(t) === field.timeSlotWarehouseTeamId(timeSlot)) : null;
              const truck = timeSlot ? trucks.find(tr => field.truckId(tr) === field.timeSlotTruckId(timeSlot)) : null;

              return (
                <div key={timeSlotId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Time Slot Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Clock className="h-6 w-6 text-blue-600 mr-3" />
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {timeSlot ? `${field.timeSlotStart(timeSlot)} - ${field.timeSlotEnd(timeSlot)}` : 'Time Slot'}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {timeSlot ? field.timeSlotDate(timeSlot) : 'Unassigned Time Slot'}
                          </p>
                          {/* Team and Truck Info */}
                          {(deliveryTeam || warehouseTeam || truck) && (
                            <div className="flex items-center gap-3 mt-2 text-xs">
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
                          )}
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
                                      <div className="flex items-center">
                                        <User className="h-3 w-3 mr-1" />
                                        {field.customerName(customer)}
                                      </div>
                                      <div className="flex items-center">
                                        <Phone className="h-3 w-3 mr-1" />
                                        {field.customerPhone(customer)}
                                      </div>
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
                                  <MapPin className="h-4 w-4 mr-2 mt-0.5 text-gray-400" />
                                  <div>
                                    <p className="text-sm text-gray-900 font-medium">{building ? field.buildingName(building) : 'No building'}</p>
                                    <p className="text-xs text-gray-600">{field.buildingAddress(building, customer)}</p>
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
                                  {field.orderActualStart(order) && (
                                    <div className="text-blue-600">
                                      Started: {formatTime(field.orderActualStart(order))}
                                    </div>
                                  )}
                                  {field.orderActualEnd(order) && (
                                    <div className="text-green-600">
                                      Completed: {formatTime(field.orderActualEnd(order))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="lg:col-span-2 flex items-center space-x-2">
                                {/* Status Update Buttons */}
                                {field.orderStatus(order) === 'Pending' && (
                                  <button
                                    onClick={() => updateOrderStatus(field.orderId(order), 'In Progress')}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Start Delivery"
                                  >
                                    <Play className="h-4 w-4" />
                                  </button>
                                )}
                                {field.orderStatus(order) === 'In Progress' && (
                                  <button
                                    onClick={() => updateOrderStatus(field.orderId(order), 'Completed')}
                                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                    title="Mark Complete"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                )}

                                {/* Navigation Button */}
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

                            {/* Additional Info for Completed Orders */}
                            {field.orderStatus(order) === 'Completed' && field.orderRating(order) && (
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
