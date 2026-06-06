import React, { useState, useMemo, useEffect } from 'react';
import { Truck, Package, Clock, Users, MapPin, CheckCircle, RotateCcw, Maximize, Info, Calendar, User, Play, Check, Navigation } from 'lucide-react';
import LoadingChecklist from '../common/LoadingChecklist';
import {
  getAllOrders,
  getAllOrderProducts,
  getAllProducts,
  getAllCustomers,
  getAllBuildings,
  getAllTimeSlots,
  getAllTeams,
  getAllEmployeeTeamAssignments,
  getAllTrucks,
  updateTimeSlot,
  updateOrderStatus as updateOrderStatusApi
} from '../../services/informationService';
import { useAuth } from '../../contexts/AuthContext';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

const WarehouseLoadingSchedule = () => {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [teamAutoSelectEnabled, setTeamAutoSelectEnabled] = useState(true);
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
  const [assignments, setAssignments] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [departingSlot, setDepartingSlot] = useState(null); // id of slot being departed

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
          assignmentsData,
          trucksData
        ] = await Promise.all([
          getAllOrders(),
          getAllOrderProducts(),
          getAllProducts(),
          getAllCustomers(),
          getAllBuildings(),
          getAllTimeSlots(),
          getAllTeams(),
          getAllEmployeeTeamAssignments(),
          getAllTrucks()
        ]);

        // Always use real data from API
        console.log('[TruckSchedule] ✅ Using real data from API');
        setOrders(Array.isArray(ordersData) ? ordersData : (ordersData?.data ?? []));
        setOrderProducts(Array.isArray(orderProductsData) ? orderProductsData : (orderProductsData?.data ?? []));
        setProducts(Array.isArray(productsData) ? productsData : (productsData?.data ?? []));
        setCustomers(Array.isArray(customersData) ? customersData : (customersData?.data ?? []));
        setBuildings(Array.isArray(buildingsData) ? buildingsData : (buildingsData?.data ?? []));
        setTimeSlots(Array.isArray(timeSlotsData) ? timeSlotsData : (timeSlotsData?.data ?? []));
        setTeams(Array.isArray(teamsData) ? teamsData : (teamsData?.data ?? []));
        setAssignments(Array.isArray(assignmentsData) ? assignmentsData : (assignmentsData?.data ?? []));
        setTrucks(Array.isArray(trucksData) ? trucksData : (trucksData?.data ?? []));
      } catch (error) {
        console.error('[TruckSchedule] ❌ ERROR loading warehouse data:', error);
        // Set empty arrays on error
        setOrders([]);
        setOrderProducts([]);
        setProducts([]);
        setCustomers([]);
        setBuildings([]);
        setTimeSlots([]);
        setTeams([]);
        setAssignments([]);
        setTrucks([]);
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
    timeSlotLoadingStart: (ts) => ts.loading_start_date_time || ts.LoadingStartDateTime,
    timeSlotLoadingEnd: (ts) => ts.loading_end_date_time || ts.LoadingEndDateTime,
    timeSlotDeliveryTeamId: (ts) => ts.delivery_team_id || ts.DeliveryTeamID,
    timeSlotWarehouseTeamId: (ts) => ts.warehouse_team_id || ts.WarehouseTeamID,
    timeSlotTruckId: (ts) => ts.truck_id || ts.TruckID,
    teamId: (team) => team.id || team.TeamID,
    teamType: (team) => team.team_type || team.TeamType || '',
    teamActive: (team) => team.available_flag ?? team.AvailableFlag ?? true,
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

  const getEmployeeId = () => {
    return currentUser?.employeeId || sessionStorage.getItem('employeeId') || '';
  };

  const getAssignmentTeamId = (assignment) => {
    return assignment?.team_id || assignment?.TeamID || assignment?.teamId || assignment?.team?.id || assignment?.team?.TeamID || null;
  };

  const getAssignmentEmployeeId = (assignment) => {
    return assignment?.employee_id || assignment?.EmployeeID || assignment?.employeeId || assignment?.employee?.id || assignment?.employee?.EmployeeID || null;
  };

  const warehouseTeams = teams.filter(team => field.teamActive(team) && field.teamType(team).toLowerCase().includes('warehouse'));

  useEffect(() => {
    if (!teamAutoSelectEnabled) return;
    if (selectedTeam !== 'all') return;
    if (warehouseTeams.length === 0) return;

    const employeeId = getEmployeeId();
    const assignment = assignments.find(a => String(getAssignmentEmployeeId(a)) === String(employeeId));
    if (!assignment) {
      const randomTeam = warehouseTeams[Math.floor(Math.random() * warehouseTeams.length)];
      if (randomTeam) setSelectedTeam(field.teamId(randomTeam));
      return;
    }

    const assignedTeamId = getAssignmentTeamId(assignment);
    const matchedTeam = warehouseTeams.find(team => String(field.teamId(team)) === String(assignedTeamId));
    if (matchedTeam) {
      setSelectedTeam(field.teamId(matchedTeam));
    } else {
      const randomTeam = warehouseTeams[Math.floor(Math.random() * warehouseTeams.length)];
      if (randomTeam) setSelectedTeam(field.teamId(randomTeam));
    }
  }, [assignments, warehouseTeams, currentUser, selectedTeam, teamAutoSelectEnabled]);

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
        LorryTripID:          field.timeSlotId(ts),
        TruckID:              field.timeSlotTruckId(ts),
        DeliveryTeamID:       field.timeSlotDeliveryTeamId(ts),
        WarehouseTeamID:      field.timeSlotWarehouseTeamId(ts),
        Date:                 field.timeSlotDate(ts),
        LoadingStartTime:     field.timeSlotStart(ts),
        LoadingEndTime:       field.timeSlotEnd(ts),
        DepartureTime:        field.timeSlotEnd(ts),
        Status:               status,
        LoadingStartDateTime: field.timeSlotLoadingStart(ts),
        LoadingEndDateTime:   field.timeSlotLoadingEnd(ts),
        // A.3.1a: authoritative slot trip state
        slot_status:          ts.slot_status || 'scheduled',
        departed_at:          ts.departed_at || null,
      };
    });

  if (lorryTrips.length > 0) {
    console.log('[TruckSchedule] Sample lorry trip:', lorryTrips[0]);
  }

  const priorityByOrderId = useMemo(() => {
    const bySlot = new Map();
    orders.forEach(order => {
      const slotId = field.orderTimeSlotId(order);
      if (!slotId) return;
      if (!bySlot.has(slotId)) bySlot.set(slotId, []);
      bySlot.get(slotId).push(order);
    });

    const map = new Map();
    bySlot.forEach(slotOrders => {
      const sorted = [...slotOrders].sort((a, b) => {
        const aStart = field.orderScheduledStart(a);
        const bStart = field.orderScheduledStart(b);
        return new Date(aStart || 0) - new Date(bStart || 0);
      });
      const total = sorted.length;
      sorted.forEach((order, index) => {
        const orderId = field.orderId(order);
        if (orderId) map.set(orderId, total - index);
      });
    });

    return map;
  }, [orders]);

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
    Priority: priorityByOrderId.get(field.orderId(order)) || 1,
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

  // A.3.1a: slot status badge colours
  const getSlotStatusStyle = (slotStatus) => {
    switch (slotStatus) {
      case 'out_for_delivery': return 'bg-orange-100 text-orange-800 border border-orange-200';
      case 'completed':        return 'bg-green-100 text-green-800 border border-green-200';
      case 'scheduled':
      default:                 return 'bg-blue-100 text-blue-800 border border-blue-200';
    }
  };

  const getSlotStatusLabel = (slotStatus) => {
    switch (slotStatus) {
      case 'out_for_delivery': return 'Out for Delivery';
      case 'completed':        return 'Completed';
      case 'scheduled':
      default:                 return 'Scheduled';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Delivered':
        return 'bg-teal-100 text-teal-800 border-teal-200';
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
      case 'Delivered':
        return <CheckCircle className="w-4 h-4" />;
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

  // A.3.1a: Depart slot — calls POST /api/time-slots/:id/depart
  const departSlot = async (timeSlotId) => {
    if (!window.confirm('Confirm the truck has departed with all items loaded?')) return;
    setDepartingSlot(timeSlotId);
    try {
      const employeeId = getEmployeeId();
      const res = await fetch(`${API_BASE_URL}/api/time-slots/${timeSlotId}/depart`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ employee_id: employeeId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { time_slot } = await res.json();
      // Update local slot_status so the badge refreshes immediately
      setTimeSlots(prev => prev.map(ts =>
        ts.id === timeSlotId ? { ...ts, slot_status: time_slot.slot_status, departed_at: time_slot.departed_at } : ts
      ));
      // Refresh orders so statuses update
      const fresh = await getAllOrders();
      setOrders(Array.isArray(fresh) ? fresh : (fresh?.data ?? []));
    } catch (err) {
      console.error('[TruckSchedule] Depart slot failed:', err.message);
      alert(`Failed to depart: ${err.message}`);
    } finally {
      setDepartingSlot(null);
    }
  };

  const updateLoadingTimestamp = async (timeSlotId, payload) => {
    try {
      await updateTimeSlot(timeSlotId, payload);
      setTimeSlots(prev => prev.map(slot =>
        field.timeSlotId(slot) === timeSlotId
          ? { ...slot, ...payload }
          : slot
      ));
    } catch (error) {
      console.error('Failed to update loading timestamp:', error);
      alert('Failed to update loading timestamp. Please try again.');
    }
  };

  const filteredTrips = lorryTrips.filter(trip => {
    const dateMatch = trip.Date === selectedDate;
    const truckMatch = selectedTruck === 'all' || trip.TruckID === selectedTruck;
    const teamMatch = selectedTeam === 'all' || String(trip.WarehouseTeamID) === String(selectedTeam);
    return dateMatch && truckMatch && teamMatch;
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
      <div className="max-w-full mx-auto">
        {/* Filters and View Toggle */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
                {warehouseTeams.map(team => (
                  <option key={field.teamId(team)} value={field.teamId(team)}>
                    {field.teamType(team)}
                  </option>
                ))}
              </select>
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
                          <div className="text-xs text-gray-500 mt-1">
                            Loading Start: {trip.LoadingStartDateTime ? new Date(trip.LoadingStartDateTime).toLocaleString() : 'Not started'}
                          </div>
                          <div className="text-xs text-gray-500">
                            Loading End: {trip.LoadingEndDateTime ? new Date(trip.LoadingEndDateTime).toLocaleString() : 'Not completed'}
                          </div>
                        </div>
                      </div>
                      {/* A.3.1a: slot status badge */}
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${getSlotStatusStyle(trip.slot_status)}`}>
                          {trip.slot_status === 'out_for_delivery' && <Navigation className="w-3 h-3" />}
                          {trip.slot_status === 'completed'        && <CheckCircle className="w-3 h-3" />}
                          {getSlotStatusLabel(trip.slot_status)}
                        </span>
                        {trip.departed_at && (
                          <span className="text-xs text-gray-500">
                            Departed: {new Date(trip.departed_at).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      {!trip.LoadingStartDateTime && (
                        <button
                          onClick={() => updateLoadingTimestamp(trip.LorryTripID, { loading_start_date_time: new Date().toISOString() })}
                          className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
                          title="Start Loading"
                        >
                          Start Loading
                        </button>
                      )}
                      {trip.LoadingStartDateTime && !trip.LoadingEndDateTime && (
                        <button
                          onClick={() => updateLoadingTimestamp(trip.LorryTripID, { loading_end_date_time: new Date().toISOString() })}
                          className="px-3 py-1 rounded-md bg-green-600 text-white text-xs hover:bg-green-700"
                          title="End Loading"
                        >
                          End Loading
                        </button>
                      )}
                      {/* A.3.1a: Depart button — shown when loading complete and slot not yet departed */}
                      {trip.LoadingEndDateTime && trip.slot_status === 'scheduled' && (
                        <button
                          onClick={() => departSlot(trip.LorryTripID)}
                          disabled={departingSlot === trip.LorryTripID}
                          className="px-3 py-1 rounded-md bg-orange-600 text-white text-xs hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1"
                          title="Mark truck as departed"
                        >
                          <Navigation className="w-3 h-3" />
                          {departingSlot === trip.LorryTripID ? 'Departing…' : 'Depart'}
                        </button>
                      )}
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
                          const status = order.OrderStatus;

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
                                                              <div className="flex items-center mb-3">
                                                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                                                  status === 'Loaded' ? 'bg-green-100 text-green-700' :
                                                                  status === 'Loading' ? 'bg-blue-100 text-blue-700' :
                                                                  'bg-gray-100 text-gray-500'
                                                                }`}>
                                                                  {status === 'Loaded' ? '✓ Loaded' : status}
                                                                </span>
                                                                <span className="ml-2 text-xs text-gray-400">
                                                                  Use Scan Station to confirm items
                                                                </span>
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
                              {/* A2.1 — Picking Checklist */}
                              {(order.id || order.OrderID) && (
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                    Picking Checklist
                                  </p>
                                  <LoadingChecklist
                                    orderId={order.id || order.OrderID}
                                    orderRef={order.odoo_order_ref || (order.id || order.OrderID)?.toString().slice(0, 8).toUpperCase()}
                                    customerName={customer?.full_name || customer?.name || ''}
                                    stage="warehouse"
                                    employeeId={currentUser?.employeeId || null}
                                  />
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
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">
                {filteredTrips.filter(t => t.slot_status === 'out_for_delivery').length}
              </div>
              <div className="text-sm text-gray-600">Out for Delivery</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {filteredTrips.filter(t => t.slot_status === 'completed').length}
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
