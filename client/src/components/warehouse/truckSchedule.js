import React, { useState, useMemo, useEffect } from 'react';
import { Truck, Package, Clock, Users, MapPin, AlertTriangle, CheckCircle, RotateCcw, Maximize, Info, Calendar, User } from 'lucide-react';
import {
  getAllOrders,
  getAllOrderProducts,
  getAllProducts,
  getAllCustomers,
  getAllBuildings,
  getAllTimeSlots,
  getAllTeams,
  getAllTrucks
} from '../../services/informationService';

const WarehouseLoadingSchedule = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTruck, setSelectedTruck] = useState('all');
  const [viewMode, setViewMode] = useState('schedule'); // 'schedule' or 'optimization'

  // Data state
  const [orders, setOrders] = useState([]);
  const [orderProducts, setOrderProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [teams, setTeams] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Generate mock data for demonstration
  const generateMockData = () => {
    const today = new Date().toISOString().split('T')[0];

    const mockTrucks = [
      { id: 'TRK_MOCK_001', plate_no: 'WXY1234', length_cm: 443, width_cm: 250, height_cm: 210, tone: 3 },
      { id: 'TRK_MOCK_002', plate_no: 'ABC5678', length_cm: 600, width_cm: 250, height_cm: 250, tone: 5 }
    ];

    const mockTeams = [
      { id: 'TEAM_DEL_001', team_type: 'Delivery Team A' },
      { id: 'TEAM_WH_001', team_type: 'Warehouse Team A' }
    ];

    const mockTimeSlots = [
      {
        id: 'TS_MOCK_WH_001',
        date: today,
        time_window_start: '07:00',
        time_window_end: '09:00',
        available_flag: false,
        delivery_team_id: 'TEAM_DEL_001',
        warehouse_team_id: 'TEAM_WH_001',
        truck_id: 'TRK_MOCK_001'
      },
      {
        id: 'TS_MOCK_WH_002',
        date: today,
        time_window_start: '08:00',
        time_window_end: '10:00',
        available_flag: false,
        delivery_team_id: 'TEAM_DEL_001',
        warehouse_team_id: 'TEAM_WH_001',
        truck_id: 'TRK_MOCK_002'
      }
    ];

    const mockCustomers = [
      { id: 'CUST_MOCK_WH_001', full_name: 'Alice Tan', address: 'Mont Kiara' },
      { id: 'CUST_MOCK_WH_002', full_name: 'Bob Lee', address: 'KLCC' }
    ];

    const mockBuildings = [
      { id: 'BLD_MOCK_WH_001', building_name: 'Menara KLCC' },
      { id: 'BLD_MOCK_WH_002', building_name: 'Pavilion Tower' }
    ];

    const mockProducts = [
      { id: 'PROD_MOCK_WH_001', product_name: 'Samsung Refrigerator', package_length_cm: 180, package_width_cm: 70, package_height_cm: 65, fragile_flag: false, no_lie_down_flag: true },
      { id: 'PROD_MOCK_WH_002', product_name: 'LG Washing Machine', package_length_cm: 95, package_width_cm: 60, package_height_cm: 85, fragile_flag: false, no_lie_down_flag: true },
      { id: 'PROD_MOCK_WH_003', product_name: 'Daikin Air Conditioner', package_length_cm: 115, package_width_cm: 83, package_height_cm: 43, fragile_flag: true, no_lie_down_flag: true }
    ];

    const mockOrders = [
      {
        id: 'ORD_MOCK_WH_001',
        customer_id: 'CUST_MOCK_WH_001',
        building_id: 'BLD_MOCK_WH_001',
        time_slot_id: 'TS_MOCK_WH_001',
        order_status: 'Ready for Loading',
        scheduled_start_date_time: `${today}T09:00:00`,
        scheduled_end_date_time: `${today}T10:30:00`,
        truck_loading_sequence: 2,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ORD_MOCK_WH_002',
        customer_id: 'CUST_MOCK_WH_002',
        building_id: 'BLD_MOCK_WH_002',
        time_slot_id: 'TS_MOCK_WH_001',
        order_status: 'Ready for Loading',
        scheduled_start_date_time: `${today}T14:00:00`,
        scheduled_end_date_time: `${today}T15:30:00`,
        truck_loading_sequence: 1,
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ORD_MOCK_WH_003',
        customer_id: 'CUST_MOCK_WH_001',
        building_id: 'BLD_MOCK_WH_001',
        time_slot_id: 'TS_MOCK_WH_002',
        order_status: 'Loading in Progress',
        scheduled_start_date_time: `${today}T11:00:00`,
        scheduled_end_date_time: `${today}T12:30:00`,
        truck_loading_sequence: 1,
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    const mockOrderProducts = [
      { order_id: 'ORD_MOCK_WH_001', product_id: 'PROD_MOCK_WH_001', quantity: 1 },
      { order_id: 'ORD_MOCK_WH_002', product_id: 'PROD_MOCK_WH_002', quantity: 1 },
      { order_id: 'ORD_MOCK_WH_002', product_id: 'PROD_MOCK_WH_003', quantity: 1 },
      { order_id: 'ORD_MOCK_WH_003', product_id: 'PROD_MOCK_WH_001', quantity: 2 }
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
        const hasRealData = timeSlotsData.length > 0 || ordersData.length > 0;

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
        //   console.log('[TruckSchedule] ✅ Using real data from API');
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
        // Use mock data on error
        const mockData = generateMockData();
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

  // Field accessors for flexible data handling
  const field = {
    truckId: (truck) => truck.id || truck.TruckID,
    truckPlate: (truck) => truck.plate_no || truck.CarPlate || '',
    truckLength: (truck) => truck.length_cm || truck.LengthCM || 400,
    truckWidth: (truck) => truck.width_cm || truck.WidthCM || 200,
    truckHeight: (truck) => truck.height_cm || truck.HeightCM || 200,
    truckTone: (truck) => truck.tone || truck.Tone || 3,
    orderId: (order) => order.id || order.OrderID,
    orderCustomerId: (order) => order.customer_id || order.CustomerID,
    orderBuildingId: (order) => order.building_id || order.BuildingID,
    orderTimeSlotId: (order) => order.time_slot_id || order.TimeSlotID,
    orderStatus: (order) => order.order_status || order.OrderStatus || 'Pending',
    orderScheduledStart: (order) => order.scheduled_start_date_time || order.ScheduledStartDateTime,
    orderScheduledEnd: (order) => order.scheduled_end_date_time || order.ScheduledEndDateTime,
    orderLoadingSequence: (order) => order.truck_loading_sequence || order.TruckLoadingSequence || null,
    orderCreatedAt: (order) => order.created_at || order.CreatedAt,
    timeSlotId: (ts) => ts.id || ts.TimeSlotID,
    timeSlotDate: (ts) => ts.date || ts.Date,
    timeSlotStart: (ts) => ts.time_window_start || ts.TimeWindowStart,
    timeSlotEnd: (ts) => ts.time_window_end || ts.TimeWindowEnd,
    timeSlotDeliveryTeamId: (ts) => ts.delivery_team_id || ts.DeliveryTeamID,
    timeSlotWarehouseTeamId: (ts) => ts.warehouse_team_id || ts.WarehouseTeamID,
    timeSlotTruckId: (ts) => ts.truck_id || ts.TruckID,
    teamId: (team) => team.id || team.TeamID,
    teamType: (team) => team.team_type || team.TeamType || '',
    customerId: (cust) => cust.id || cust.CustomerID,
    customerName: (cust) => cust.full_name || cust.name || '',
    customerAddress: (cust) => cust.address || '',
    buildingId: (bld) => bld.id || bld.BuildingID,
    buildingName: (bld) => bld.building_name || '',
    productId: (prod) => prod.id || prod.ProductID,
    productName: (prod) => prod.product_name || prod.ProductName || '',
    productLength: (prod) => prod.package_length_cm || prod.PackageLengthCM || 50,
    productWidth: (prod) => prod.package_width_cm || prod.PackageWidthCM || 50,
    productHeight: (prod) => prod.package_height_cm || prod.PackageHeightCM || 50,
    productFragile: (prod) => prod.fragile_flag ?? prod.FragileFlag ?? false,
    productNoLieDown: (prod) => prod.no_lie_down_flag ?? prod.NoLieDownFlag ?? false,
    orderProductOrderId: (op) => op.order_id || op.OrderID,
    orderProductProductId: (op) => op.product_id || op.ProductID,
    orderProductQuantity: (op) => op.quantity || op.Quantity || 1,
    orderProductDismantle: (op) => op.dismantle_required ?? op.DismantleRequired ?? false
  };

  // Convert trucks data to object format for easy lookup
  const trucksObj = trucks.reduce((acc, truck) => {
    acc[field.truckId(truck)] = {
      TruckID: field.truckId(truck),
      CarPlate: field.truckPlate(truck),
      LengthCM: field.truckLength(truck),
      WidthCM: field.truckWidth(truck),
      HeightCM: field.truckHeight(truck),
      Tone: field.truckTone(truck)
    };
    return acc;
  }, {});

  const lorryTrips = timeSlots
    .filter(ts => field.timeSlotTruckId(ts)) // Only slots with assigned trucks
    .filter(ts => field.timeSlotDate(ts) === selectedDate) // Filter by selected date
    .map(ts => {
      // Find orders for this timeslot
      const slotOrders = orders.filter(o => field.orderTimeSlotId(o) === field.timeSlotId(ts));
      const status = slotOrders.length === 0 ? 'Scheduled' :
                     slotOrders.every(o => field.orderStatus(o) === 'Completed') ? 'Completed' :
                     slotOrders.some(o => field.orderStatus(o) === 'In Progress') ? 'Loading' : 'Scheduled';

      return {
        LorryTripID: field.timeSlotId(ts),
        TruckID: field.timeSlotTruckId(ts),
        DeliveryTeamID: field.timeSlotDeliveryTeamId(ts),
        WarehouseTeamID: field.timeSlotWarehouseTeamId(ts),
        Date: field.timeSlotDate(ts),
        LoadingStartTime: field.timeSlotStart(ts),
        LoadingEndTime: field.timeSlotEnd(ts),
        DepartureTime: field.timeSlotEnd(ts),
        Status: status
      };
    });

  if (lorryTrips.length > 0) {
    console.log('[TruckSchedule] Sample lorry trip:', lorryTrips[0]);
  }

  // Convert orders data to expected format
  const ordersData = orders.map(order => ({
    OrderID: field.orderId(order),
    CustomerID: field.orderCustomerId(order),
    BuildingID: field.orderBuildingId(order),
    TimeSlotID: field.orderTimeSlotId(order),
    DeliveryTeamID: timeSlots.find(ts => field.timeSlotId(ts) === field.orderTimeSlotId(order))?.delivery_team_id,
    LorryTripID: field.orderTimeSlotId(order), // Use timeslot ID as lorry trip ID
    OrderStatus: field.orderStatus(order),
    ScheduledStartDateTime: field.orderScheduledStart(order) ? new Date(field.orderScheduledStart(order)) : null,
    ScheduledEndDateTime: field.orderScheduledEnd(order) ? new Date(field.orderScheduledEnd(order)) : null,
    Priority: 1,
    LoadingSequence: field.orderLoadingSequence(order) || 1,
    CreatedAt: field.orderCreatedAt(order) ? new Date(field.orderCreatedAt(order)) : new Date()
  }));

  // Convert orderProducts data
  const orderProductsData = orderProducts.map(op => ({
    OrderID: field.orderProductOrderId(op),
    ProductID: field.orderProductProductId(op),
    Quantity: field.orderProductQuantity(op),
    LoadingPosition: 'Auto',
    IsLoaded: false
  }));

  // Convert products data to object format
  const productsObj = products.reduce((acc, prod) => {
    acc[field.productId(prod)] = {
      ProductID: field.productId(prod),
      ProductName: field.productName(prod),
      PackageLengthCM: field.productLength(prod),
      PackageWidthCM: field.productWidth(prod),
      PackageHeightCM: field.productHeight(prod),
      WeightKG: 50, // Default weight
      FragileFlag: field.productFragile(prod),
      NoLieDownFlag: field.productNoLieDown(prod),
      StackableFlag: !field.productNoLieDown(prod),
      MaxStackHeight: field.productNoLieDown(prod) ? 1 : 2
    };
    return acc;
  }, {});

  // Convert customers to object format
  const customersObj = customers.reduce((acc, cust) => {
    acc[field.customerId(cust)] = {
      name: field.customerName(cust),
      address: field.customerAddress(cust)
    };
    return acc;
  }, {});

  // Convert teams to object format
  const teamsObj = teams.reduce((acc, team) => {
    acc[field.teamId(team)] = {
      TeamType: field.teamType(team)
    };
    return acc;
  }, {});

  // Calculate truck utilization and optimization
  const calculateTruckOptimization = (lorryTripId) => {
    const trip = lorryTrips.find(t => t.LorryTripID === lorryTripId);
    if (!trip) return null;

    const truck = trucksObj[trip.TruckID];
    if (!truck) return null;

    const tripOrders = ordersData.filter(o => o.LorryTripID === lorryTripId);

    let totalVolume = 0;
    let totalWeight = 0;
    let items = [];

    tripOrders.forEach(order => {
      const orderItems = orderProductsData.filter(op => op.OrderID === order.OrderID);
      orderItems.forEach(item => {
        const product = productsObj[item.ProductID];
        if (!product) return;

        const volume = (product.PackageLengthCM * product.PackageWidthCM * product.PackageHeightCM) / 1000000; // Convert to cubic meters
        const weight = product.WeightKG * item.Quantity;

        totalVolume += volume * item.Quantity;
        totalWeight += weight;

        for (let i = 0; i < item.Quantity; i++) {
          items.push({
            ...item,
            ...product,
            orderInfo: order,
            customerInfo: customersObj[order.CustomerID]
          });
        }
      });
    });

    const truckVolume = (truck.LengthCM * truck.WidthCM * truck.HeightCM) / 1000000;
    const truckWeight = truck.Tone * 1000; // Convert to kg

    const volumeUtilization = (totalVolume / truckVolume) * 100;
    const weightUtilization = (totalWeight / truckWeight) * 100;

    return {
      truck,
      trip,
      items,
      totalVolume: totalVolume.toFixed(2),
      totalWeight,
      truckVolume: truckVolume.toFixed(2),
      truckWeight,
      volumeUtilization: volumeUtilization.toFixed(1),
      weightUtilization: weightUtilization.toFixed(1),
      maxUtilization: Math.max(volumeUtilization, weightUtilization).toFixed(1)
    };
  };

  // Optimize loading sequence
  const optimizeLoading = (items) => {
    // Sort by delivery time first (FIFO), then by fragility, then by size
    return items.sort((a, b) => {
      // First by delivery time
      if (a.orderInfo.ScheduledStartDateTime !== b.orderInfo.ScheduledStartDateTime) {
        return new Date(a.orderInfo.ScheduledStartDateTime) - new Date(b.orderInfo.ScheduledStartDateTime);
      }
      // Then by fragility (fragile items on top)
      if (a.FragileFlag !== b.FragileFlag) {
        return b.FragileFlag - a.FragileFlag;
      }
      // Then by NoLieDownFlag (items that can't lie down loaded last)
      if (a.NoLieDownFlag !== b.NoLieDownFlag) {
        return a.NoLieDownFlag - b.NoLieDownFlag;
      }
      // Finally by volume (larger items first)
      const aVolume = a.PackageLengthCM * a.PackageWidthCM * a.PackageHeightCM;
      const bVolume = b.PackageLengthCM * b.PackageWidthCM * b.PackageHeightCM;
      return bVolume - aVolume;
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Scheduled':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Loading':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Ready for Loading':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Loading in Progress':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Loaded':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Scheduled':
        return <Calendar className="w-4 h-4" />;
      case 'Loading':
        return <RotateCcw className="w-4 h-4" />;
      case 'Completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'Ready for Loading':
        return <Package className="w-4 h-4" />;
      case 'Loading in Progress':
        return <RotateCcw className="w-4 h-4" />;
      case 'Loaded':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const filteredTrips = lorryTrips.filter(trip => {
    const dateMatch = trip.Date === selectedDate;
    const truckMatch = selectedTruck === 'all' || trip.TruckID === selectedTruck;
    return dateMatch && truckMatch;
  });

  const optimizationData = useMemo(() => {
    return filteredTrips.map(trip => calculateTruckOptimization(trip.LorryTripID));
  }, [filteredTrips]);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading warehouse schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Filters and View Toggle */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Truck</label>
              <select
                value={selectedTruck}
                onChange={(e) => setSelectedTruck(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Trucks</option>
                {Object.values(trucksObj).map(truck => (
                  <option key={truck.TruckID} value={truck.TruckID}>
                    {truck.CarPlate} - {truck.Tone}T
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setViewMode('schedule')}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    viewMode === 'schedule'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Schedule View
                </button>
                <button
                  onClick={() => setViewMode('optimization')}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    viewMode === 'optimization'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Optimization View
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content based on view mode */}
        {viewMode === 'schedule' ? (
          /* Schedule View */
          <div className="space-y-6">
            {filteredTrips.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <Truck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No trips scheduled</h3>
                <p className="text-gray-600">There are no loading trips scheduled for the selected date and truck.</p>
              </div>
            ) : (
              filteredTrips.map(trip => {
                const truck = trucksObj[trip.TruckID];
                const tripOrders = ordersData.filter(o => o.LorryTripID === trip.LorryTripID);
                const warehouseTeam = teamsObj[trip.WarehouseTeamID];
                const deliveryTeam = teamsObj[trip.DeliveryTeamID];

                return (
                  <div key={trip.LorryTripID} className="bg-white rounded-lg shadow-sm p-6">
                    {/* Trip Header */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center space-x-4">
                        <div className="bg-blue-100 p-3 rounded-lg">
                          <Truck className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-gray-900">{truck.CarPlate}</h3>
                          <p className="text-gray-600">Trip ID: {trip.LorryTripID}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium border flex items-center space-x-1 ${getStatusColor(trip.Status)}`}>
                        {getStatusIcon(trip.Status)}
                        <span>{trip.Status}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Truck Info */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                          <Truck className="w-4 h-4 mr-2 text-blue-600" />
                          Truck Details
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Capacity:</span>
                            <span className="font-medium">{truck.Tone}T</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Dimensions:</span>
                            <span className="font-medium">{truck.LengthCM}×{truck.WidthCM}×{truck.HeightCM} cm</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Volume:</span>
                            <span className="font-medium">{((truck.LengthCM * truck.WidthCM * truck.HeightCM) / 1000000).toFixed(1)} m³</span>
                          </div>
                        </div>
                      </div>

                      {/* Schedule Info */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                          <Clock className="w-4 h-4 mr-2 text-blue-600" />
                          Schedule
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Loading:</span>
                            <span className="font-medium">{trip.LoadingStartTime} - {trip.LoadingEndTime}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Departure:</span>
                            <span className="font-medium">{trip.DepartureTime}</span>
                          </div>
                        </div>
                      </div>

                      {/* Team Info */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                          <Users className="w-4 h-4 mr-2 text-blue-600" />
                          Teams
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-gray-600">Warehouse: </span>
                            <span className="font-medium">{warehouseTeam?.TeamType}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Delivery: </span>
                            <span className="font-medium">{deliveryTeam?.TeamType}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Orders */}
                    <div className="mt-6">
                      <h4 className="font-medium text-gray-900 mb-4">Orders ({tripOrders.length})</h4>
                      <div className="space-y-3">
                        {tripOrders.map(order => {
                          const orderItems = orderProductsData.filter(op => op.OrderID === order.OrderID);
                          const customer = customersObj[order.CustomerID];

                          return (
                            <div key={order.OrderID} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center space-x-3">
                                  <span className="font-medium text-blue-600">{order.OrderID}</span>
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(order.OrderStatus)}`}>
                                    {order.OrderStatus}
                                  </span>
                                  <span className="text-sm text-gray-600">Priority {order.Priority}</span>
                                </div>
                                <div className="text-sm text-gray-600">
                                  Seq: {order.LoadingSequence} | {customer?.name} - {customer?.address}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                                {orderItems.map((item, index) => {
                                  const product = productsObj[item.ProductID];
                                  return (
                                    <div key={index} className="bg-gray-50 rounded p-3">
                                      <div className="font-medium text-gray-900 mb-1">{product?.ProductName}</div>
                                      <div className="text-gray-600">
                                        <div>Qty: {item.Quantity}</div>
                                        <div>Pos: {item.LoadingPosition}</div>
                                        <div className="flex items-center space-x-2 mt-1">
                                          {product?.FragileFlag && (
                                            <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-xs">Fragile</span>
                                          )}
                                          {product?.NoLieDownFlag && (
                                            <span className="px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">Upright</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
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
        ) : (
          /* Optimization View */
          <div className="space-y-6">
            {optimizationData.map(data => {
              const optimizedItems = optimizeLoading([...data.items]);
              
              return (
                <div key={data.trip.LorryTripID} className="bg-white rounded-lg shadow-sm p-6">
                  {/* Optimization Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="bg-green-100 p-3 rounded-lg">
                        <Maximize className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">{data.truck.CarPlate} - Optimization</h3>
                        <p className="text-gray-600">Trip ID: {data.trip.LorryTripID}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{data.maxUtilization}%</div>
                      <div className="text-sm text-gray-600">Max Utilization</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Utilization Stats */}
                    <div className="space-y-4">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-4">Utilization Analysis</h4>
                        
                        {/* Volume Utilization */}
                        <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">Volume</span>
                            <span className="text-sm font-medium text-gray-900">{data.volumeUtilization}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${Math.min(data.volumeUtilization, 100)}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {data.totalVolume} / {data.truckVolume} m³
                          </div>
                        </div>

                        {/* Weight Utilization */}
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">Weight</span>
                            <span className="text-sm font-medium text-gray-900">{data.weightUtilization}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full" 
                              style={{ width: `${Math.min(data.weightUtilization, 100)}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {data.totalWeight} / {data.truckWeight} kg
                          </div>
                        </div>
                      </div>

                      {/* Loading Tips */}
                      <div className="bg-yellow-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                          <AlertTriangle className="w-4 h-4 mr-2 text-yellow-600" />
                          Loading Guidelines
                        </h4>
                        <div className="space-y-2 text-sm text-gray-700">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            <span>Load fragile items on top and secure properly</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                            <span>Keep upright items in designated positions</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span>Load in reverse delivery order (LIFO)</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span>Distribute weight evenly across truck bed</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Optimized Loading Sequence */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-4">Optimized Loading Sequence</h4>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {optimizedItems.map((item, index) => {
                          const volume = ((item.PackageLengthCM * item.PackageWidthCM * item.PackageHeightCM) / 1000000).toFixed(3);
                          const deliveryTime = new Date(item.orderInfo.ScheduledStartDateTime).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          });
                          
                          return (
                            <div key={index} className="bg-gray-50 rounded-lg p-3 border-l-4 border-blue-500">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-3">
                                  <div className="bg-blue-100 text-blue-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                                    {index + 1}
                                  </div>
                                  <span className="font-medium text-gray-900">{item.ProductName}</span>
                                </div>
                                <div className="text-xs text-gray-600">
                                  Delivery: {deliveryTime}
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                                <div>
                                  <div>Order: {item.OrderID}</div>
                                  <div>Customer: {item.customerInfo?.name}</div>
                                  <div>Position: {item.LoadingPosition || 'Auto-assign'}</div>
                                </div>
                                <div>
                                  <div>Size: {item.PackageLengthCM}×{item.PackageWidthCM}×{item.PackageHeightCM}cm</div>
                                  <div>Weight: {item.WeightKG}kg | Volume: {volume}m³</div>
                                  <div className="flex space-x-1 mt-1">
                                    {item.FragileFlag && (
                                      <span className="px-1 py-0.5 bg-red-100 text-red-600 rounded text-xs">Fragile</span>
                                    )}
                                    {item.NoLieDownFlag && (
                                      <span className="px-1 py-0.5 bg-yellow-100 text-yellow-600 rounded text-xs">Upright</span>
                                    )}
                                    {item.StackableFlag && (
                                      <span className="px-1 py-0.5 bg-green-100 text-green-600 rounded text-xs">Stackable</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Visual Loading Layout */}
                  <div className="mt-6">
                    <h4 className="font-medium text-gray-900 mb-4">Truck Loading Layout</h4>
                    <div className="bg-gray-100 rounded-lg p-4">
                      <div className="relative">
                        {/* Truck Outline */}
                        <div 
                          className="border-2 border-gray-400 rounded-lg bg-white relative"
                          style={{ 
                            width: '100%', 
                            height: '200px'
                          }}
                        >
                          {/* Truck Cab */}
                          <div className="absolute -left-8 top-1/2 transform -translate-y-1/2 w-6 h-16 bg-blue-600 rounded-l-lg"></div>
                          
                          {/* Loading Areas */}
                          <div className="grid grid-cols-4 gap-2 h-full p-2">
                            {optimizedItems.slice(0, 8).map((item, index) => {
                              const priorityColor = item.orderInfo.Priority === 1 ? 'bg-red-200 border-red-400' : 
                                                   item.orderInfo.Priority === 2 ? 'bg-yellow-200 border-yellow-400' : 
                                                   'bg-blue-200 border-blue-400';
                              
                              return (
                                <div
                                  key={index}
                                  className={`rounded border-2 ${priorityColor} p-1 flex flex-col justify-center items-center text-xs text-center relative`}
                                  title={`${item.ProductName} - ${item.customerInfo?.name}`}
                                >
                                  <div className="font-medium truncate w-full">{item.ProductName.split(' ')[0]}</div>
                                  <div className="text-xs text-gray-600">{item.WeightKG}kg</div>
                                  {item.FragileFlag && (
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">!</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Legend */}
                          <div className="absolute -bottom-12 left-0 right-0 flex justify-center space-x-4 text-xs">
                            <div className="flex items-center space-x-1">
                              <div className="w-3 h-3 bg-red-200 border border-red-400 rounded"></div>
                              <span>Priority 1</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <div className="w-3 h-3 bg-yellow-200 border border-yellow-400 rounded"></div>
                              <span>Priority 2</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <div className="w-3 h-3 bg-blue-200 border border-blue-400 rounded"></div>
                              <span>Priority 3+</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                              <span>Fragile</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {optimizedItems.length > 8 && (
                        <div className="mt-4 text-center text-sm text-gray-600">
                          + {optimizedItems.length - 8} more items (use multiple levels or optimize further)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-6 flex justify-end space-x-3">
                    <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium">
                      Export Layout
                    </button>
                    <button className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium">
                      Re-optimize
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                      Confirm Loading Plan
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary Statistics */}
        <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{filteredTrips.length}</div>
              <div className="text-sm text-gray-600">Total Trips</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {filteredTrips.filter(t => t.Status === 'Completed').length}
              </div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {ordersData.filter(o => filteredTrips.some(t => t.LorryTripID === o.LorryTripID)).length}
              </div>
              <div className="text-sm text-gray-600">Total Orders</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">
                {optimizationData.filter(d => d !== null).length > 0
                  ? (optimizationData.filter(d => d !== null).reduce((acc, data) => acc + parseFloat(data.maxUtilization), 0) / optimizationData.filter(d => d !== null).length).toFixed(1)
                  : 0}%
              </div>
              <div className="text-sm text-gray-600">Avg Utilization</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarehouseLoadingSchedule;