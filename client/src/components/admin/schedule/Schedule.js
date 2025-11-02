import React, { useEffect, useState, useMemo } from 'react';
import {
  getAllTimeSlots, addTimeSlot, updateTimeSlot, deleteTimeSlot,
  getAllLorryTrips, addLorryTrip, updateLorryTrip,
  getAllTrucks, getAllTeams, getAllOrders, getAllOrderProducts,
  getAllEmployees, getAllEmployeeTeamAssignments,
  getAllCustomers, getAllBuildings, getAllProducts
} from '../../../services/informationService';
import { Calendar, Truck, Package, Users, MapPin, Edit, Save, X, Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

// Helper for generating days in a given month
function getMonthDates(year, month) {
  const dates = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    dates.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return dates;
}

export default function Schedule() {
  const [viewMode, setViewMode] = useState('weekly');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingTimeSlot, setEditingTimeSlot] = useState(null);
  const [expandedSlots, setExpandedSlots] = useState(new Set());
  const [showAddModal, setShowAddModal] = useState(false);

  // Data
  const [timeSlots, setTimeSlots] = useState([]);
  const [lorryTrips, setLorryTrips] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderProducts, setOrderProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeAssignments, setEmployeeAssignments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [productsList, setProductsList] = useState([]);

  // Modal & flow
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [addOrEdit, setAddOrEdit] = useState('add');

  // Reschedule controls
  const [rescheduleMode, setRescheduleMode] = useState('now');
  const [rescheduleDate, setRescheduleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [rescheduleHour, setRescheduleHour] = useState(() => new Date().toTimeString().slice(0, 5));
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleMessage, setRescheduleMessage] = useState('');

  // Generate mock data for demonstration
  const generateMockData = () => {
    const today = new Date().toISOString().split('T')[0];

    const mockTrucks = [
      { id: 'TRK_MOCK_001', plate_no: 'WXY1234', tone: 3, length_cm: 600, width_cm: 240, height_cm: 260 },
      { id: 'TRK_MOCK_002', plate_no: 'ABC5678', tone: 5, length_cm: 800, width_cm: 250, height_cm: 280 }
    ];

    const mockTeams = [
      { id: 'TEAM_DEL_001', team_type: 'Delivery Team A' },
      { id: 'TEAM_WH_001', team_type: 'Warehouse Team A' }
    ];

    const mockTimeSlots = [
      {
        id: 'TS_MOCK_001',
        date: today,
        time_window_start: '08:00',
        time_window_end: '12:00',
        available_flag: false,
        truck_id: 'TRK_MOCK_001',
        delivery_team_id: 'TEAM_DEL_001',
        warehouse_team_id: 'TEAM_WH_001'
      },
      {
        id: 'TS_MOCK_002',
        date: today,
        time_window_start: '13:00',
        time_window_end: '17:00',
        available_flag: false,
        truck_id: 'TRK_MOCK_002',
        delivery_team_id: 'TEAM_DEL_001',
        warehouse_team_id: 'TEAM_WH_001'
      }
    ];

    const mockCustomers = [
      { id: 'CUST_MOCK_001', full_name: 'John Tan', phone: '012-3456789' },
      { id: 'CUST_MOCK_002', full_name: 'Sarah Lee', phone: '012-9876543' }
    ];

    const mockBuildings = [
      { id: 'BLD_MOCK_001', building_name: 'Menara KLCC' },
      { id: 'BLD_MOCK_002', building_name: 'Pavilion Tower' }
    ];

    const mockProducts = [
      {
        id: 'PROD_MOCK_001',
        product_name: 'Samsung Smart TV 55"',
        installer_team_required_flag: true,
        estimated_installation_time_min: 30,
        estimated_installation_time_max: 60
      },
      {
        id: 'PROD_MOCK_002',
        product_name: 'LG Washing Machine',
        installer_team_required_flag: true,
        estimated_installation_time_min: 45,
        estimated_installation_time_max: 90
      }
    ];

    const mockOrders = [
      {
        id: 'ORD_MOCK_001',
        customer_id: 'CUST_MOCK_001',
        building_id: 'BLD_MOCK_001',
        time_slot_id: 'TS_MOCK_001',
        order_status: 'Scheduled',
        scheduled_start_date_time: `${today}T08:00:00`,
        scheduled_end_date_time: `${today}T09:30:00`
      },
      {
        id: 'ORD_MOCK_002',
        customer_id: 'CUST_MOCK_002',
        building_id: 'BLD_MOCK_002',
        time_slot_id: 'TS_MOCK_002',
        order_status: 'Scheduled',
        scheduled_start_date_time: `${today}T13:00:00`,
        scheduled_end_date_time: `${today}T14:30:00`
      }
    ];

    const mockOrderProducts = [
      { order_id: 'ORD_MOCK_001', product_id: 'PROD_MOCK_001', quantity: 1 },
      { order_id: 'ORD_MOCK_002', product_id: 'PROD_MOCK_002', quantity: 1 }
    ];

    const mockLorryTrips = [];
    const mockEmployees = [
      { id: 'EMP_MOCK_001', name: 'Ahmad Abdullah', display_name: 'Ahmad' },
      { id: 'EMP_MOCK_002', name: 'Siti Nurhaliza', display_name: 'Siti' },
      { id: 'EMP_MOCK_003', name: 'Wong Wei Lun', display_name: 'Wei Lun' }
    ];
    const mockEmployeeAssignments = [
      { employee_id: 'EMP_MOCK_001', team_id: 'TEAM_DEL_001' },
      { employee_id: 'EMP_MOCK_002', team_id: 'TEAM_DEL_001' },
      { employee_id: 'EMP_MOCK_003', team_id: 'TEAM_WH_001' }
    ];

    return {
      timeSlots: mockTimeSlots,
      lorryTrips: mockLorryTrips,
      trucks: mockTrucks,
      teams: mockTeams,
      orders: mockOrders,
      orderProducts: mockOrderProducts,
      employees: mockEmployees,
      employeeAssignments: mockEmployeeAssignments,
      customers: mockCustomers,
      buildings: mockBuildings,
      products: mockProducts
    };
  };

  // --- Load all data once ---
  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      try {
        const [
          slots, trips, tks, tms, ords, ordProds, emps, empAssigns, custs, blds, prods
        ] = await Promise.all([
          getAllTimeSlots(),
          getAllLorryTrips(),
          getAllTrucks(),
          getAllTeams(),
          getAllOrders(),
          getAllOrderProducts(),
          getAllEmployees(),
          getAllEmployeeTeamAssignments(),
          getAllCustomers(),
          getAllBuildings(),
          getAllProducts()
        ]);

        if (!mounted) return;

        const slotsArray = Array.isArray(slots) ? slots : (slots?.data ?? []);
        const tripsArray = Array.isArray(trips) ? trips : (trips?.data ?? []);
        const ordsArray = Array.isArray(ords) ? ords : (ords?.data ?? []);

        // Use real data if available, otherwise use mock data
        const hasRealData = slotsArray.length > 0 || ordsArray.length > 0;

        // if (!hasRealData) {
          const mockData = generateMockData();
          setTimeSlots(mockData.timeSlots);
          setLorryTrips(mockData.lorryTrips);
          setTrucks(mockData.trucks);
          setTeams(mockData.teams);
          setOrders(mockData.orders);
          setOrderProducts(mockData.orderProducts);
          setEmployees(mockData.employees);
          setEmployeeAssignments(mockData.employeeAssignments);
          setCustomers(mockData.customers);
          setBuildings(mockData.buildings);
          setProductsList(mockData.products);
        // } else {
        //   setTimeSlots(slotsArray);
        //   setLorryTrips(tripsArray);
        //   setTrucks(Array.isArray(tks) ? tks : (tks?.data ?? []));
        //   setTeams(Array.isArray(tms) ? tms : (tms?.data ?? []));
        //   setOrders(ordsArray);
        //   setOrderProducts(Array.isArray(ordProds) ? ordProds : (ordProds?.data ?? []));
        //   setEmployees(Array.isArray(emps) ? emps : (emps?.data ?? []));
        //   setEmployeeAssignments(Array.isArray(empAssigns) ? empAssigns : (empAssigns?.data ?? []));
        //   setCustomers(Array.isArray(custs) ? custs : (custs?.data ?? []));
        //   setBuildings(Array.isArray(blds) ? blds : (blds?.data ?? []));
        //   setProductsList(Array.isArray(prods) ? prods : (prods?.data ?? []));
        // }

      } catch (err) {
        console.error('[Schedule] loadAll error:', err);
      }
    }
    loadAll();
    return () => { mounted = false; };
  }, []);

  // --- Field accessor helpers (normalize snake_case vs PascalCase) ---
  const field = useMemo(() => ({
    // TimeSlot
    timeSlotId: (ts) => ts?.id ?? ts?.TimeSlotID ?? ts?.time_slot_id ?? ts?.timeSlotId,
    timeSlotDate: (ts) => ts?.date ?? ts?.Date ?? ts?.time_slot_date,
    timeSlotStart: (ts) => ts?.time_window_start ?? ts?.TimeWindowStart ?? ts?.TimeWindowStart,
    timeSlotEnd: (ts) => ts?.time_window_end ?? ts?.TimeWindowEnd ?? ts?.TimeWindowEnd,
    timeSlotAvailable: (ts) => (ts?.available_flag ?? ts?.AvailableFlag ?? ts?.Available ?? true),
    timeSlotLorryTripId: (ts) => ts?.lorry_trip_id ?? ts?.LorryTripID ?? ts?.LorryTripId ?? ts?.lorryTripId,
    timeSlotTruckId: (ts) => ts?.truck_id ?? ts?.TruckID ?? ts?.truckId,
    timeSlotDeliveryTeamId: (ts) => ts?.delivery_team_id ?? ts?.DeliveryTeamID ?? ts?.deliveryTeamId,
    timeSlotWarehouseTeamId: (ts) => ts?.warehouse_team_id ?? ts?.WarehouseTeamID ?? ts?.warehouseTeamId,

    // LorryTrip
    lorryTripId: (lt) => lt?.id ?? lt?.LorryTripID ?? lt?.lorry_trip_id,
    lorryTripTruckId: (lt) => lt?.truck_id ?? lt?.TruckID ?? lt?.TruckId,
    lorryTripDeliveryTeamId: (lt) => lt?.delivery_team_id ?? lt?.DeliveryTeamID ?? lt?.DeliveryTeamId,
    lorryTripWarehouseTeamId: (lt) => lt?.warehouse_team_id ?? lt?.WarehouseTeamID ?? lt?.WarehouseTeamId,

    // Truck
    truckId: (t) => t?.id ?? t?.truck_id ?? t?.TruckID,
    truckPlate: (t) => t?.plate_no ?? t?.CarPlate ?? t?.plate,
    truckTone: (t) => t?.tone ?? t?.Tone ?? t?.capacity_tons ?? t?.capacity,
    truckLength: (t) => t?.length_cm ?? t?.LengthCM ?? t?.length,
    truckWidth: (t) => t?.width_cm ?? t?.WidthCM ?? t?.width,
    truckHeight: (t) => t?.height_cm ?? t?.HeightCM ?? t?.height,

    // Team
    teamId: (team) => team?.id ?? team?.TeamID ?? team?.team_id,
    teamType: (team) => team?.team_type ?? team?.TeamType ?? team?.type,

    // Employee
    employeeId: (emp) => emp?.id ?? emp?.EmployeeID ?? emp?.employee_id,
    employeeName: (emp) => emp?.name ?? emp?.displayName ?? emp?.display_name ?? `${emp?.firstName ?? ''} ${emp?.lastName ?? ''}`.trim(),

    // EmployeeTeamAssignment
    assignmentTeamId: (ea) => ea?.team_id ?? ea?.TeamID ?? ea?.teamId,
    assignmentEmployeeId: (ea) => ea?.employee_id ?? ea?.EmployeeID ?? ea?.employeeId,

    // Order
    orderId: (o) => o?.id ?? o?.OrderID ?? o?.order_id,
    orderCustomerId: (o) => o?.customer_id ?? o?.CustomerID ?? o?.customerId,
    orderBuildingId: (o) => o?.building_id ?? o?.BuildingID ?? o?.buildingId,
    orderTimeSlotId: (o) => o?.time_slot_id ?? o?.TimeSlotID ?? o?.timeSlotId,
    orderStatus: (o) => o?.order_status ?? o?.OrderStatus ?? o?.status,

    // OrderProduct
    orderProductId: (op) => op?.id ?? op?.OrderProductID ?? op?.order_product_id,
    orderProductOrderId: (op) => op?.order_id ?? op?.OrderID ?? op?.OrderId,
    orderProductProductId: (op) => op?.product_id ?? op?.ProductID ?? op?.productId,
    orderProductQuantity: (op) => op?.quantity ?? op?.Quantity ?? 1,

    // Customer
    customerId: (c) => c?.id ?? c?.CustomerID ?? c?.customer_id,
    customerName: (c) => c?.full_name ?? c?.FullName ?? c?.name,

    // Building
    buildingId: (b) => b?.id ?? b?.building_id ?? b?.BuildingID,
    buildingName: (b) => b?.building_name ?? b?.BuildingName ?? b?.name,

    // Product
    productId: (p) => p?.id ?? p?.product_id ?? p?.ProductID,
    productName: (p) => p?.product_name ?? p?.ProductName ?? p?.name,
    productInstallerRequired: (p) => (p?.installer_team_required_flag ?? p?.InstallerTeamRequiredFlag ?? false),
    productInstallMin: (p) => p?.estimated_installation_time_min ?? p?.EstimatedInstallationTimeMin ?? 0,
    productInstallMax: (p) => p?.estimated_installation_time_max ?? p?.EstimatedInstallationTimeMax ?? 0,
  }), []);

  // --- lookup helpers using normalized keys ---
  const getLorryTrip = (tripId) => lorryTrips.find(t => String(field.lorryTripId(t)) === String(tripId));
  const getTruck = (truckId) => trucks.find(t => String(field.truckId(t)) === String(truckId));
  const getTeam = (teamId) => teams.find(t => String(field.teamId(t)) === String(teamId));
  const getOrdersForSlot = (timeSlotId) => orders.filter(o => String(field.orderTimeSlotId(o)) === String(timeSlotId));
  const getOrderProductsForOrder = (orderId) => orderProducts.filter(op => String(field.orderProductOrderId(op)) === String(orderId));

  const getEmployeesForTeam = (teamId) => {
    const assigned = employeeAssignments.filter(ea => String(field.assignmentTeamId(ea)) === String(teamId));
    return employees.filter(e => assigned.some(a => String(field.assignmentEmployeeId(a)) === String(field.employeeId(e))));
  };

  // --- small helpers ---
  const getCurrentWeekDates = () => {
    const start = new Date(selectedDate);
    const day = start.getDay();
    const diff = start.getDate() - day;
    start.setDate(diff);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const formatDate = (date) => (date instanceof Date ? date.toISOString().split('T')[0] : String(date));

  const getTimeSlotsForDate = (date) => {
    const dateStr = formatDate(date);
    return timeSlots.filter(slot => {
      const slotDate = field.timeSlotDate(slot);
      // slotDate might be already in ISO or Date or string; normalize
      if (!slotDate) return false;
      if (typeof slotDate === 'string') return slotDate.startsWith(dateStr);
      if (slotDate instanceof Date) return formatDate(slotDate) === dateStr;
      return String(slotDate) === dateStr;
    });
  };

  // --- CRUD handlers ---
  const handleEditTimeSlot = (slot) => {
    setAddOrEdit('edit');
    const lorryTrip = getLorryTrip(field.timeSlotLorryTripId(slot)) || {};
    // normalize editing object to expected fields for the modal
    setEditingTimeSlot({
      ...slot,
      TimeSlotID: field.timeSlotId(slot),
      Date: field.timeSlotDate(slot),
      TimeWindowStart: field.timeSlotStart(slot),
      TimeWindowEnd: field.timeSlotEnd(slot),
      AvailableFlag: field.timeSlotAvailable(slot),
      LorryTripID: field.timeSlotLorryTripId(slot),
      lorryTrip: { ...lorryTrip }
    });
    setShowAddModal(true);
  };

  const handleDeleteTimeSlot = async (slot) => {
    if (!window.confirm('Delete this time slot?')) return;
    try {
      await deleteTimeSlot(field.timeSlotId(slot));
      setTimeSlots(prev => prev.filter(s => String(field.timeSlotId(s)) !== String(field.timeSlotId(slot))));
    } catch (err) {
      console.error('deleteTimeSlot error', err);
      alert('Failed to delete time slot: ' + (err.message || err));
    }
  };

  const handleAddTimeSlot = () => {
    setAddOrEdit('add');
    setEditingTimeSlot({
      Date: formatDate(selectedDate),
      TimeWindowStart: '',
      TimeWindowEnd: '',
      AvailableFlag: true,
      LorryTripID: '',
      lorryTrip: {}
    });
    setShowAddModal(true);
  };

  const handleSaveEdit = async () => {
    setModalLoading(true);
    setModalError('');
    try {
      let lorryTripID = editingTimeSlot?.LorryTripID;
      const tripData = { ...(editingTimeSlot?.lorryTrip || {}) };

      if (!lorryTripID) {
        const newTrip = await addLorryTrip(tripData);
        lorryTripID = newTrip?.LorryTripID ?? newTrip?.id ?? newTrip?.lorry_trip_id;
      } else {
        await updateLorryTrip(lorryTripID, tripData);
      }

      const slotData = {
        Date: editingTimeSlot.Date,
        TimeWindowStart: editingTimeSlot.TimeWindowStart,
        TimeWindowEnd: editingTimeSlot.TimeWindowEnd,
        AvailableFlag: !!editingTimeSlot.AvailableFlag,
        LorryTripID: lorryTripID
      };

      if (addOrEdit === 'edit') {
        await updateTimeSlot(editingTimeSlot.TimeSlotID, slotData);
      } else {
        await addTimeSlot(slotData);
      }

      const refreshed = await getAllTimeSlots();
      setTimeSlots(Array.isArray(refreshed) ? refreshed : (refreshed?.data ?? []));
      setEditingTimeSlot(null);
      setShowAddModal(false);
    } catch (e) {
      console.error('handleSaveEdit error', e);
      setModalError('Error saving: ' + (e.message || e));
    }
    setModalLoading(false);
  };

  // --- assign helpers used in modal ---
  const handleAssignTruck = (truckId) => {
    setEditingTimeSlot(ts => ({ ...ts, lorryTrip: { ...ts.lorryTrip, TruckID: truckId } }));
  };
  const handleAssignTeam = (teamId) => {
    setEditingTimeSlot(ts => ({ ...ts, lorryTrip: { ...ts.lorryTrip, DeliveryTeamID: teamId } }));
  };
  const handleAssignWarehouseTeam = (teamId) => {
    setEditingTimeSlot(ts => ({ ...ts, lorryTrip: { ...ts.lorryTrip, WarehouseTeamID: teamId } }));
  };

  // --- UI helpers ---
  const getStatusColor = (available, orderCount) => {
    if (!available) return 'bg-gray-100 border-gray-300';
    if (orderCount === 0) return 'bg-green-50 border-green-200';
    return 'bg-blue-50 border-blue-200';
  };

  const toggleSlotExpansion = (slotId) => {
    setExpandedSlots(prev => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  // --- Scheduler trigger ---
  const triggerScheduler = async () => {
    setRescheduleLoading(true);
    setRescheduleMessage('');
    try {
      let runAt;
      if (rescheduleMode === 'now') runAt = new Date().toISOString();
      else {
        if (!rescheduleDate || !rescheduleHour) {
          setRescheduleMessage('Please select both date and time.');
          setRescheduleLoading(false);
          return;
        }
        runAt = new Date(`${rescheduleDate}T${rescheduleHour}:00`).toISOString();
      }

      const resp = await fetch('/api/scheduler/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runAt })
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || `Scheduler returned ${resp.status}`);
      }
      const json = await resp.json();
      setRescheduleMessage(json.message || 'Scheduler triggered successfully.');
    } catch (err) {
      console.error('triggerScheduler error', err);
      setRescheduleMessage('Failed to trigger scheduler: ' + (err.message || err));
    } finally {
      setRescheduleLoading(false);
    }
  };

  // Pre-computed maps for fast lookup
  const employeeMap = useMemo(() => new Map(
    (employees || []).map(e => {
      const id = String(e?.id ?? e?.employee_id ?? e?.EmployeeID ?? '').trim();
      return [id, { ...e, id }];
    })
  ), [employees]);

  // defensive employee name lookup
  const employeeNameFromId = (employeeId, row) => {
    const candidate = employeeId ?? row?.EmployeeID ?? row?.employee_id ?? row?.employeeId ?? null;
    if (candidate === null || candidate === undefined || candidate === '') return 'Unassigned';
    const key = String(candidate).trim();
    const emp = employeeMap.get(key);
    return emp?.name ?? emp?.displayName ?? `Employee (${key})`;
  };

  // --- Render helpers per view ---

  const renderWeeklyView = () => {
    const weekDates = getCurrentWeekDates();
    return (
      <div className="grid grid-cols-7 gap-4">
        {weekDates.map(date => (
          <div key={formatDate(date)} className="min-h-96">
            <div className="bg-gray-50 p-2 text-center font-medium mb-3 rounded">
              <div className="text-sm text-gray-600">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div className="text-lg">{date.getDate()}</div>
            </div>
            <div className="space-y-2">
              {getTimeSlotsForDate(date).map(slot => {
                const slotId = field.timeSlotId(slot) ?? `${formatDate(date)}-${field.timeSlotStart(slot)}-${field.timeSlotEnd(slot)}`;
                const trip = getLorryTrip(field.timeSlotLorryTripId(slot)) || {};
                // Check for direct truck/team IDs on time slot first, then fall back to lorry trip
                const truckId = field.timeSlotTruckId(slot) || field.lorryTripTruckId(trip);
                const deliveryTeamId = field.timeSlotDeliveryTeamId(slot) || field.lorryTripDeliveryTeamId(trip);
                const truck = getTruck(truckId) || {};
                const deliveryTeam = getTeam(deliveryTeamId) || {};
                const teamMembers = getEmployeesForTeam(field.teamId(deliveryTeam)) || [];
                const slotOrders = getOrdersForSlot(field.timeSlotId(slot)).map(order => {
                  const customer = customers.find(c => String(field.customerId(c)) === String(field.orderCustomerId(order))) || {};
                  const building = buildings.find(b => String(field.buildingId(b)) === String(field.orderBuildingId(order))) || {};
                  const orderProductRows = orderProducts.filter(op => String(field.orderProductOrderId(op)) === String(field.orderId(order)));
                  const products = orderProductRows.map(op => {
                    const product = productsList.find(p => String(field.productId(p)) === String(field.orderProductProductId(op))) || {};
                    return {
                      ...op,
                      ProductName: field.productName(product),
                      InstallerTeamRequiredFlag: field.productInstallerRequired(product),
                      EstimatedInstallationTimeMin: field.productInstallMin(product),
                      EstimatedInstallationTimeMax: field.productInstallMax(product)
                    };
                  });
                  const enriched = { ...order, CustomerName: field.customerName(customer), BuildingName: field.buildingName(building), products };
                  // debug per-enriched-order
                  // console.log('[Schedule] Enriched order', { orderId: field.orderId(order), customer, building, productsSample: products.slice(0,3) });
                  return enriched;
                });

                // debug for slot
                // console.log('[Schedule] Slot debug', { slotId, rawSlot: slot, lorryTripId: field.timeSlotLorryTripId(slot), trip, ordersCount: slotOrders.length });

                return (
                  <div
                    key={slotId}
                    className={`p-2 rounded-lg border-2 cursor-pointer transition-all ${getStatusColor(field.timeSlotAvailable(slot), slotOrders.length)}`}
                    onClick={() => toggleSlotExpansion(slotId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium">{field.timeSlotStart(slot)} - {field.timeSlotEnd(slot)}</div>
                      <div className="flex items-center gap-1">
                        <button onClick={e => { e.stopPropagation(); handleEditTimeSlot(slot); }} className="p-1 hover:bg-white rounded"><Edit size={12} /></button>
                        <button onClick={e => { e.stopPropagation(); handleDeleteTimeSlot(slot); }} className="p-1 hover:bg-red-100 rounded" title="Delete"><Trash2 size={12} /></button>
                        {expandedSlots.has(slotId) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </div>
                    </div>

                    <div className="text-xs text-gray-600 mt-1">
                      <div className="flex items-center gap-1"><Truck size={10} />{field.truckPlate(truck)}</div>
                      <div className="flex items-center gap-1"><Package size={10} />{slotOrders.length} orders</div>
                    </div>

                    {expandedSlots.has(slotId) && (
                      <div className="mt-2 pt-2 border-t border-gray-200 text-xs space-y-1">
                        <div><strong>Team:</strong> {field.teamType(deliveryTeam) || '—'}</div>
                        <div><strong>Truck:</strong> {field.truckTone(truck)}T - {field.truckPlate(truck)}</div>
                        <div><strong>Team Members:</strong> {teamMembers.map(e => field.employeeName(e)).join(', ') || 'None'}</div>
                        {slotOrders.map((order, orderIdx) => {
                          const orderKey = field.orderId(order) || `${slotId}-order-${orderIdx}`;
                          return (
                            <div key={orderKey} className="bg-white p-2 rounded mt-1">
                              <div><strong>{order.CustomerName}</strong></div>
                              <div>{order.BuildingName}</div>
                              <div className="text-green-600">{field.orderStatus(order)}</div>
                              {order.products.map((product, idx) => {
                                const productKey = field.orderProductId(product) || `${orderKey}-prod-${idx}`;
                                return (
                                  <div key={productKey} className="flex items-center gap-1 text-gray-600">
                                    <Package size={8} /> {field.orderProductQuantity(product)}x {product.ProductName}
                                    {product.InstallerTeamRequiredFlag && (<span className="bg-orange-100 text-orange-600 px-1 rounded text-xs">Install</span>)}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderDailyView = () => {
    const slots = getTimeSlotsForDate(selectedDate);
    return (
      <div>
        <div className="mb-4 text-center">
          <h2 className="text-lg font-semibold text-gray-800">{selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h2>
        </div>
        <div className="space-y-4">
          {slots.length === 0 && <div className="text-center text-gray-500 text-sm py-8">No time slots scheduled for this day</div>}
          {slots.map(slot => {
            const slotId = field.timeSlotId(slot) ?? `${formatDate(selectedDate)}-${field.timeSlotStart(slot)}-${field.timeSlotEnd(slot)}`;
            const trip = getLorryTrip(field.timeSlotLorryTripId(slot)) || {};
            // Check for direct truck/team IDs on time slot first, then fall back to lorry trip
            const truckId = field.timeSlotTruckId(slot) || field.lorryTripTruckId(trip);
            const deliveryTeamId = field.timeSlotDeliveryTeamId(slot) || field.lorryTripDeliveryTeamId(trip);
            const truck = getTruck(truckId) || {};
            const deliveryTeam = getTeam(deliveryTeamId) || {};
            const teamMembers = getEmployeesForTeam(field.teamId(deliveryTeam)) || [];
            const slotOrders = getOrdersForSlot(field.timeSlotId(slot)).map(order => {
              const customer = customers.find(c => String(field.customerId(c)) === String(field.orderCustomerId(order))) || {};
              const building = buildings.find(b => String(field.buildingId(b)) === String(field.orderBuildingId(order))) || {};
              const orderProductRows = orderProducts.filter(op => String(field.orderProductOrderId(op)) === String(field.orderId(order)));
              const products = orderProductRows.map(op => {
                const product = productsList.find(p => String(field.productId(p)) === String(field.orderProductProductId(op))) || {};
                return {
                  ...op,
                  ProductName: field.productName(product),
                  InstallerTeamRequiredFlag: field.productInstallerRequired(product),
                  EstimatedInstallationTimeMin: field.productInstallMin(product),
                  EstimatedInstallationTimeMax: field.productInstallMax(product)
                };
              });
              return { ...order, CustomerName: field.customerName(customer), BuildingName: field.buildingName(building), products };
            });

            return (
              <div key={slotId} className={`p-6 rounded-lg border-2 ${getStatusColor(field.timeSlotAvailable(slot), slotOrders.length)}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-semibold text-gray-800">{field.timeSlotStart(slot)} - {field.timeSlotEnd(slot)}</div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${field.timeSlotAvailable(slot) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{field.timeSlotAvailable(slot) ? 'Available' : 'Unavailable'}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleEditTimeSlot(slot)} className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"><Edit size={14} /> Edit</button>
                    <button onClick={() => handleDeleteTimeSlot(slot)} className="p-1 hover:bg-red-100 rounded" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm flex items-center gap-2 text-gray-700"><Truck size={16} /> Truck Details</h3>
                    <div className="bg-white p-3 rounded-md border text-sm">
                      <div><strong>Plate:</strong> {field.truckPlate(truck)}</div>
                      <div><strong>Capacity:</strong> {field.truckTone(truck)}T</div>
                      <div><strong>Dimensions:</strong> {field.truckLength(truck)}×{field.truckWidth(truck)}×{field.truckHeight(truck)}cm</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-medium text-sm flex items-center gap-2 text-gray-700"><Users size={16} /> Team Details</h3>
                    <div className="bg-white p-3 rounded-md border text-sm">
                      <div><strong>Team:</strong> {field.teamType(deliveryTeam)}</div>
                      <div><strong>ID:</strong> {field.teamId(deliveryTeam)}</div>
                      <div><strong>Members:</strong> {teamMembers.map(e => field.employeeName(e)).join(', ')}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-medium text-sm flex items-center gap-2 text-gray-700"><Package size={16} /> Orders ({slotOrders.length})</h3>
                    <div className="bg-white p-3 rounded-md border max-h-32 overflow-y-auto text-sm">
                      {slotOrders.length > 0 ? slotOrders.map((order, orderIdx) => {
                        const orderKey = field.orderId(order) || `${slotId}-order-${orderIdx}`;
                        return (
                          <div key={orderKey} className="mb-2 last:mb-0 pb-2 last:pb-0 border-b last:border-b-0">
                            <div className="font-medium text-sm">{order.CustomerName}</div>
                            <div className="text-xs text-gray-600 flex items-center gap-1"><MapPin size={10} />{order.BuildingName}</div>
                            <div className="text-xs text-green-600">{field.orderStatus(order)}</div>
                            <div className="mt-1 space-y-1">
                              {order.products.map((product, idx) => {
                                const productKey = field.orderProductId(product) || `${orderKey}-prod-${idx}`;
                                return (
                                  <div key={productKey} className="text-xs flex items-center justify-between">
                                    <span>{field.orderProductQuantity(product)}× {product.ProductName}</span>
                                    {product.InstallerTeamRequiredFlag && (<span className="bg-orange-100 text-orange-600 px-1 py-0.5 rounded text-xs">Install ({product.EstimatedInstallationTimeMin}-{product.EstimatedInstallationTimeMax}min)</span>)}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }) : (<div className="text-gray-500 text-center text-xs">No orders assigned</div>)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMonthlyView = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const monthDates = getMonthDates(year, month);
    const firstDay = new Date(year, month, 1).getDay();
    const weeks = [];
    let week = [];
    for (let i = 0; i < firstDay; i++) week.push(null);
    monthDates.forEach(date => { week.push(date); if (week.length === 7) { weeks.push(week); week = []; } });
    if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

    return (
      <div>
        <div className="mb-4 text-center font-medium text-lg">{selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
        <div className="grid grid-cols-7 gap-1 bg-gray-50 rounded-t">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="text-xs py-2 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((date, idx) => {
            const cellKey = date ? formatDate(date) : `empty-${idx}`;
            if (!date) return <div key={cellKey} className="h-24 bg-gray-50" />;
            const slots = getTimeSlotsForDate(date);
            return (
              <div key={cellKey} className="h-24 border bg-white relative group">
                <div className="absolute top-1 left-1 text-xs text-gray-500">{date.getDate()}</div>
                <div className="flex flex-col gap-1 mt-5">
                  {slots.slice(0,2).map(slot => {
                    const sKey = field.timeSlotId(slot) ?? `${cellKey}-${field.timeSlotStart(slot)}`;
                    return (
                      <div key={sKey} className={`truncate px-1 py-0.5 rounded text-xs cursor-pointer ${field.timeSlotAvailable(slot) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`} title={`${field.timeSlotStart(slot)}-${field.timeSlotEnd(slot)}`} onClick={() => { handleEditTimeSlot(slot); setShowAddModal(true); }}>
                        {field.timeSlotStart(slot)}-{field.timeSlotEnd(slot)}
                      </div>
                    );
                  })}
                  {slots.length > 2 && <div key={`${cellKey}-more`} className="text-xs text-blue-600 cursor-pointer" onClick={() => { setSelectedDate(date); setViewMode("daily"); }}>+{slots.length - 2} more</div>}
                </div>
                <button key={`${cellKey}-add`} className="absolute bottom-1 right-1 text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100" title="Add TimeSlot" onClick={e => { e.stopPropagation(); setSelectedDate(date); handleAddTimeSlot(); }}><Plus size={12} /></button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTimeSlotModal = () => {
    if (!editingTimeSlot) return null;
    const trip = editingTimeSlot.lorryTrip || {};
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-4 rounded-md shadow-sm w-full max-w-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">{addOrEdit === 'add' ? 'Add TimeSlot' : 'Edit TimeSlot'}</h3>
            <button onClick={() => { setEditingTimeSlot(null); setShowAddModal(false); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          {modalError && <div className="text-red-600">{modalError}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={editingTimeSlot.Date} onChange={e => setEditingTimeSlot(ts => ({ ...ts, Date: e.target.value }))} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input type="time" value={editingTimeSlot.TimeWindowStart} onChange={e => setEditingTimeSlot(ts => ({ ...ts, TimeWindowStart: e.target.value }))} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input type="time" value={editingTimeSlot.TimeWindowEnd} onChange={e => setEditingTimeSlot(ts => ({ ...ts, TimeWindowEnd: e.target.value }))} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Available</label>
              <input type="checkbox" checked={!!editingTimeSlot.AvailableFlag} onChange={e => setEditingTimeSlot(ts => ({ ...ts, AvailableFlag: e.target.checked }))} className="mr-2" />
              <span className="text-sm font-medium text-gray-700">{editingTimeSlot.AvailableFlag ? 'Yes' : 'No'}</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign Truck</label>
              <select value={field.lorryTripTruckId(trip) || ''} onChange={e => handleAssignTruck(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                <option value="">-- Select Truck --</option>
                {trucks.map(truck => <option key={String(field.truckId(truck))} value={field.truckId(truck)}>{field.truckPlate(truck)} ({field.truckTone(truck)}T)</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign Delivery Team</label>
              <select value={field.lorryTripDeliveryTeamId(trip) || ''} onChange={e => handleAssignTeam(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                <option value="">-- Select Team --</option>
                {teams.map(team => <option key={String(field.teamId(team))} value={field.teamId(team)}>{field.teamType(team)}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign Warehouse Team</label>
              <select value={field.lorryTripWarehouseTeamId(trip) || ''} onChange={e => handleAssignWarehouseTeam(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                <option value="">-- Select Team --</option>
                {teams.map(team => <option key={`w-${String(field.teamId(team))}`} value={field.teamId(team)}>{field.teamType(team)}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={handleSaveEdit} disabled={modalLoading} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"><Save size={14} />{modalLoading ? 'Saving...' : 'Save'}</button>
            <button onClick={() => { setEditingTimeSlot(null); setShowAddModal(false); }} className="flex-1 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700">Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto bg-white">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-800 flex items-center gap-2"><Calendar className="text-blue-600" size={20} />TimeSlot Admin Calendar</h1>
          <button onClick={handleAddTimeSlot} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"><Plus size={14} />Add TimeSlot</button>
        </div>

        {/* <div className="mb-4 p-3 border rounded-md bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm font-medium">Reschedule trigger</div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="rescheduleMode" value="now" checked={rescheduleMode === 'now'} onChange={() => setRescheduleMode('now')} />Now</label>
                <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="rescheduleMode" value="specific" checked={rescheduleMode === 'specific'} onChange={() => setRescheduleMode('specific')} />Specific time</label>
              </div>

              {rescheduleMode === 'specific' && (
                <div className="flex items-center gap-2">
                  <input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} className="p-1 border rounded text-sm" />
                  <input type="time" value={rescheduleHour} onChange={e => setRescheduleHour(e.target.value)} className="p-1 border rounded text-sm" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={triggerScheduler} disabled={rescheduleLoading} className="px-3 py-1 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700">{rescheduleLoading ? 'Scheduling...' : 'Run Scheduler'}</button>
            </div>
          </div>

          {rescheduleMessage && <div className="mt-2 text-sm text-gray-700">{rescheduleMessage}</div>}
          <div className="mt-2 text-xs text-gray-500">Note: This will trigger the server-side scheduler (server endpoint: POST /api/scheduler/run).</div>
        </div> */}

        <div className="flex items-center gap-4">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {['daily','weekly','monthly'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1 rounded capitalize text-sm ${viewMode === mode ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-800'}`}>{mode}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { const newDate = new Date(selectedDate); if (viewMode === 'daily') newDate.setDate(newDate.getDate() - 1); else if (viewMode === 'weekly') newDate.setDate(newDate.getDate() - 7); else newDate.setMonth(newDate.getMonth() - 1); setSelectedDate(newDate); }} className="px-3 py-1 border rounded-md hover:bg-gray-50 text-sm">←</button>
            <span className="px-3 py-1 font-medium text-sm">
              {viewMode === 'daily' ? selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : viewMode === 'weekly' ? `Week of ${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => { const newDate = new Date(selectedDate); if (viewMode === 'daily') newDate.setDate(newDate.getDate() + 1); else if (viewMode === 'weekly') newDate.setDate(newDate.getDate() + 7); else newDate.setMonth(newDate.getMonth() + 1); setSelectedDate(newDate); }} className="px-3 py-1 border rounded-md hover:bg-gray-50 text-sm">→</button>
          </div>
        </div>
      </div>

      <div className="mb-6">
        {viewMode === 'daily' && renderDailyView()}
        {viewMode === 'weekly' && renderWeeklyView()}
        {viewMode === 'monthly' && renderMonthlyView()}
      </div>

      {showAddModal && renderTimeSlotModal()}
    </div>
  );
}