import React, { useEffect, useState, useMemo } from 'react';
import {
  getAllTimeSlots, addTimeSlot, updateTimeSlot, deleteTimeSlot,
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
  const [editingOrder, setEditingOrder] = useState(null);
  const [showOrderEditModal, setShowOrderEditModal] = useState(false);
  const [orderEditLoading, setOrderEditLoading] = useState(false);
  const [orderEditError, setOrderEditError] = useState('');
  const [showMonthlyOrdersModal, setShowMonthlyOrdersModal] = useState(false);
  const [monthlyOrdersDate, setMonthlyOrdersDate] = useState(null);

  // Data
  const [timeSlots, setTimeSlots] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderProducts, setOrderProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeAssignments, setEmployeeAssignments] = useState([]);
  const [installationSchedules, setInstallationSchedules] = useState([]);
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

  // --- Load all data once ---
  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      try {
        const REACT_APP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';
        const [
          slots, tks, tms, ords, ordProds, emps, empAssigns, custs, blds, prods, installationSchedulesResponse
        ] = await Promise.all([
          getAllTimeSlots(),
          getAllTrucks(),
          getAllTeams(),
          getAllOrders(),
          getAllOrderProducts(),
          getAllEmployees(),
          getAllEmployeeTeamAssignments(),
          getAllCustomers(),
          getAllBuildings(),
          getAllProducts(),
          fetch(`${REACT_APP_API_BASE_URL}/api/scheduler/installation-schedules`)
            .then(res => res.ok ? res.json() : { success: false, schedules: [] })
            .catch(() => ({ success: false, schedules: [] }))
        ]);

        if (!mounted) return;

        const slotsArray = Array.isArray(slots) ? slots : (slots?.data ?? []);
        const ordsArray = Array.isArray(ords) ? ords : (ords?.data ?? []);

        // Always use real data from API
        setTimeSlots(slotsArray);
        setTrucks(Array.isArray(tks) ? tks : (tks?.data ?? []));
        setTeams(Array.isArray(tms) ? tms : (tms?.data ?? []));
        setOrders(ordsArray);
        setOrderProducts(Array.isArray(ordProds) ? ordProds : (ordProds?.data ?? []));
        setEmployees(Array.isArray(emps) ? emps : (emps?.data ?? []));
        setEmployeeAssignments(Array.isArray(empAssigns) ? empAssigns : (empAssigns?.data ?? []));
        setCustomers(Array.isArray(custs) ? custs : (custs?.data ?? []));
        setBuildings(Array.isArray(blds) ? blds : (blds?.data ?? []));
        setProductsList(Array.isArray(prods) ? prods : (prods?.data ?? []));
        setInstallationSchedules(installationSchedulesResponse?.success ? installationSchedulesResponse.schedules : []);

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
    timeSlotTruckId: (ts) => ts?.truck_id ?? ts?.TruckID ?? ts?.truckId,
    timeSlotDeliveryTeamId: (ts) => ts?.delivery_team_id ?? ts?.DeliveryTeamID ?? ts?.deliveryTeamId,
    timeSlotWarehouseTeamId: (ts) => ts?.warehouse_team_id ?? ts?.WarehouseTeamID ?? ts?.warehouseTeamId,

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
  const getTruck = (truckId) => trucks.find(t => String(field.truckId(t)) === String(truckId));
  const getTeam = (teamId) => teams.find(t => String(field.teamId(t)) === String(teamId));
  const getOrdersForSlot = (timeSlotId) => {
    return orders
      .filter(o => String(field.orderTimeSlotId(o)) === String(timeSlotId))
      .sort((a, b) => {
        const aStart = a.scheduled_start_date_time || a.ScheduledStartDateTime;
        const bStart = b.scheduled_start_date_time || b.ScheduledStartDateTime;
        return new Date(aStart || 0) - new Date(bStart || 0);
      });
  };
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
  const formatTimeRange = (start, end) => {
    if (!start || !end) return 'Not scheduled';
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 'Not scheduled';
    return `${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getTimeSlotsForDate = (date) => {
    const dateStr = formatDate(date);
    return timeSlots.filter(slot => {
      const slotDate = field.timeSlotDate(slot);
      // slotDate might be already in ISO or Date or string; normalize
      if (!slotDate) return false;
      if (typeof slotDate === 'string') return slotDate.startsWith(dateStr);
      if (slotDate instanceof Date) return formatDate(slotDate) === dateStr;
      return String(slotDate) === dateStr;
    }).sort((a, b) => {
      const aStart = field.timeSlotStart(a) || '';
      const bStart = field.timeSlotStart(b) || '';
      return String(aStart).localeCompare(String(bStart));
    });
  };

  const getOrdersForDate = (date) => {
    const dateStr = formatDate(date);
    return orders.filter(order => {
      const start = order.scheduled_start_date_time || order.ScheduledStartDateTime;
      if (!start) return false;
      const startDate = new Date(start);
      if (Number.isNaN(startDate.getTime())) return false;
      return formatDate(startDate) === dateStr;
    }).sort((a, b) => {
      const aStart = a.scheduled_start_date_time || a.ScheduledStartDateTime;
      const bStart = b.scheduled_start_date_time || b.ScheduledStartDateTime;
      return new Date(aStart || 0) - new Date(bStart || 0);
    });
  };

  const calculateServiceTimes = (order) => {
    const orderId = field.orderId(order);
    const orderProductRows = orderProducts.filter(op => String(field.orderProductOrderId(op)) === String(orderId));
    let totalDeliveryTime = 0;
    let totalInstallationTime = 0;
    let requiresInstallation = false;
    let hasAnyInstallationNeeded = false;

    for (const op of orderProductRows) {
      const product = productsList.find(p => String(field.productId(p)) === String(field.orderProductProductId(op))) || {};
      const serviceType = String(op?.service_type ?? op?.ServiceType ?? '').toLowerCase();
      const customMin = op?.custom_installation_time_min ?? op?.CustomInstallationTimeMin ?? op?.customInstallTimeMin ?? null;
      const customMax = op?.custom_installation_time_max ?? op?.CustomInstallationTimeMax ?? op?.customInstallTimeMax ?? null;
      const productMin = product?.estimated_installation_time_min ?? product?.EstimatedInstallationTimeMin ?? null;
      const productMax = product?.estimated_installation_time_max ?? product?.EstimatedInstallationTimeMax ?? null;
      const minMinutes = customMin ?? productMin ?? null;
      const maxMinutes = customMax ?? productMax ?? null;
      const hasInstallationEstimate = minMinutes !== null || maxMinutes !== null;
      const requiresInstallerTeam = !!field.productInstallerRequired(product);
      const includeInstallation = serviceType
        ? serviceType === 'delivery_installation'
        : (hasInstallationEstimate || requiresInstallerTeam);

      if (includeInstallation && requiresInstallerTeam) {
        requiresInstallation = true;
      }
      if (includeInstallation) {
        hasAnyInstallationNeeded = true;
      }

      if (includeInstallation && hasInstallationEstimate) {
        const dismantleRequired = op?.dismantle_required ?? op?.DismantleRequired ?? op?.dismantleRequired ?? false;
        if (dismantleRequired) {
          const dismantleMinutes = op?.custom_dismantle_time ?? op?.CustomDismantleTime ?? product?.dismantle_time ?? product?.DismantleTime ?? 0;
          totalInstallationTime += Number(dismantleMinutes || 0) * Math.max(op.quantity || 0, 1);
        }

        let installationMinutes = 0;
        if (minMinutes !== null && maxMinutes !== null) {
          installationMinutes = (Number(minMinutes) + Number(maxMinutes)) / 2;
        } else if (minMinutes !== null) {
          installationMinutes = Number(minMinutes);
        } else if (maxMinutes !== null) {
          installationMinutes = Number(maxMinutes);
        }
        totalInstallationTime += (installationMinutes * (op.quantity || 1));
      }
    }

    totalDeliveryTime = orderProductRows.length ? (hasAnyInstallationNeeded ? 0 : 10) : 0;

    return {
      calculatedDeliveryTime: totalDeliveryTime,
      calculatedInstallationTime: totalInstallationTime,
      calculatedServiceTime: totalDeliveryTime + totalInstallationTime,
      requiresInstallation
    };
  };

  const unscheduledOrders = useMemo(() => {
    return orders
      .filter(order => {
        const status = String(field.orderStatus(order) || '').toLowerCase();
        const hasSlot = !!field.orderTimeSlotId(order);
        const hasScheduledTimes = !!(order.scheduled_start_date_time || order.ScheduledStartDateTime);
        return status === 'pending' && !hasSlot && !hasScheduledTimes;
      })
      .map(order => {
        const customer = customers.find(c => String(field.customerId(c)) === String(field.orderCustomerId(order))) || {};
        const building = buildings.find(b => String(field.buildingId(b)) === String(field.orderBuildingId(order))) || {};
        const serviceTimes = calculateServiceTimes(order);
        const orderId = field.orderId(order);
        const orderProductRows = orderProducts.filter(op => String(field.orderProductOrderId(op)) === String(orderId));
        const products = orderProductRows.map(op => {
          const product = productsList.find(p => String(field.productId(p)) === String(field.orderProductProductId(op))) || {};
          return {
            ...op,
            ProductName: field.productName(product)
          };
        });

        return {
          ...order,
          ...serviceTimes,
          CustomerName: field.customerName(customer) || 'N/A',
          BuildingName: field.buildingName(building) || 'N/A',
          BuildingAccessStart: building?.access_time_window_start ?? building?.AccessTimeWindowStart ?? null,
          BuildingAccessEnd: building?.access_time_window_end ?? building?.AccessTimeWindowEnd ?? null,
          products
        };
      });
  }, [orders, customers, buildings, orderProducts, productsList, field]);

  // --- CRUD handlers ---
  const handleEditTimeSlot = (slot) => {
    setAddOrEdit('edit');
    // Directly use time_slot fields - no need for lorry_trips
    setEditingTimeSlot({
      ...slot,
      TimeSlotID: field.timeSlotId(slot),
      Date: field.timeSlotDate(slot),
      TimeWindowStart: field.timeSlotStart(slot),
      TimeWindowEnd: field.timeSlotEnd(slot),
      AvailableFlag: field.timeSlotAvailable(slot),
      truck_id: field.timeSlotTruckId(slot),
      delivery_team_id: field.timeSlotDeliveryTeamId(slot),
      warehouse_team_id: field.timeSlotWarehouseTeamId(slot)
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
      truck_id: null,
      delivery_team_id: null,
      warehouse_team_id: null
    });
    setShowAddModal(true);
  };

  const handleSaveEdit = async () => {
    setModalLoading(true);
    setModalError('');
    try {
      // Prepare time slot data - directly save to time_slots table
      const slotData = {
        date: editingTimeSlot.Date,
        time_window_start: editingTimeSlot.TimeWindowStart,
        time_window_end: editingTimeSlot.TimeWindowEnd,
        available_flag: !!editingTimeSlot.AvailableFlag,
        truck_id: editingTimeSlot.truck_id || null,
        delivery_team_id: editingTimeSlot.delivery_team_id || null,
        warehouse_team_id: editingTimeSlot.warehouse_team_id || null
      };

      if (addOrEdit === 'edit') {
        await updateTimeSlot(editingTimeSlot.TimeSlotID, slotData);
      } else {
        await addTimeSlot(slotData);
      }

      // Refresh time slots to get latest data
      const refreshedSlots = await getAllTimeSlots();
      setTimeSlots(Array.isArray(refreshedSlots) ? refreshedSlots : (refreshedSlots?.data ?? []));
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
    setEditingTimeSlot(ts => ({
      ...ts,
      truck_id: truckId
    }));
  };
  const handleAssignTeam = (teamId) => {
    setEditingTimeSlot(ts => ({
      ...ts,
      delivery_team_id: teamId
    }));
  };
  const handleAssignWarehouseTeam = (teamId) => {
    setEditingTimeSlot(ts => ({
      ...ts,
      warehouse_team_id: teamId
    }));
  };

  // --- Order reassignment handlers ---
  const handleEditOrder = (order) => {
    // Extract time from ISO string if available
    const getHHMM = (dt) => {
      if (!dt) return '';
      const d = new Date(dt);
      if (isNaN(d.getTime())) return '';
      // localized time might fail if not careful, better to slice if ISO, but safer to use methods
      // Assuming naive local time handling for now as mostly used in this app
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    setEditingOrder({
      ...order,
      OrderID: field.orderId(order),
      CurrentTimeSlotID: field.orderTimeSlotId(order),
      NewTimeSlotID: field.orderTimeSlotId(order),
      UseManualTime: false,
      ScheduledStartTime: '',
      ScheduledEndTime: '',
      _prefillStartTime: getHHMM(order.scheduled_start_date_time || order.ScheduledStartDateTime),
      _prefillEndTime: getHHMM(order.scheduled_end_date_time || order.ScheduledEndDateTime),
    });
    setShowOrderEditModal(true);
  };

  const handleReassignOrder = async () => {
    setOrderEditLoading(true);
    setOrderEditError('');
    try {
      const REACT_APP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

      // --- Validation Start ---
      if (!editingOrder.NewTimeSlotID) throw new Error('Please select a timeslot.');
      
      let scheduledStartISO = null;
      let scheduledEndISO = null;

      if (editingOrder.UseManualTime) {
         if (!editingOrder.ScheduledStartTime || !editingOrder.ScheduledEndTime) {
             throw new Error('Please enter both start and end time.');
         }
         // Get Date from Timeslot
         const targetSlot = timeSlots.find(ts => String(field.timeSlotId(ts)) === String(editingOrder.NewTimeSlotID));
         if (!targetSlot) throw new Error('Invalid timeslot selected.');
         
         const baseDate = field.timeSlotDate(targetSlot); // YYYY-MM-DD
         // Construct ISO strings assuming local time
         scheduledStartISO = new Date(`${baseDate}T${editingOrder.ScheduledStartTime}`).toISOString();
         scheduledEndISO = new Date(`${baseDate}T${editingOrder.ScheduledEndTime}`).toISOString();

         // Check if End Time is after Start Time
         if (editingOrder.ScheduledEndTime <= editingOrder.ScheduledStartTime) {
             throw new Error('End time must be after start time.');
         }

         // Validate Access Window
         const buildingRec = buildings.find(b => String(field.buildingId(b)) === String(field.orderBuildingId(editingOrder)));
         if (buildingRec) {
            const accStartFull = buildingRec.access_time_window_start || buildingRec.AccessTimeWindowStart;
            const accEndFull = buildingRec.access_time_window_end || buildingRec.AccessTimeWindowEnd;
            
            if (accStartFull && accEndFull) {
                 // Slicing to ensure HH:mm comparison (db might return HH:mm:ss)
                 const startStr = String(accStartFull).slice(0, 5);
                 const endStr = String(accEndFull).slice(0, 5);
                 
                 if (editingOrder.ScheduledStartTime < startStr || editingOrder.ScheduledEndTime > endStr) {
                     throw new Error(`Time is outside building access window (${startStr} - ${endStr})`);
                 }
            }
         }

         // Validate Overlap
         const existingOrders = getOrdersForSlot(editingOrder.NewTimeSlotID);
         const myId = editingOrder.OrderID;
         
         const isOverlapping = existingOrders.some(existing => {
             if (String(field.orderId(existing)) === String(myId)) return false; // skip self
             const exStart = existing.scheduled_start_date_time || existing.ScheduledStartDateTime;
             const exEnd = existing.scheduled_end_date_time || existing.ScheduledEndDateTime;
             if (!exStart || !exEnd) return false;
             
             // Check overlap: StartA < EndB && EndA > StartB
             // We can compare ISO strings
             if ((scheduledStartISO < exEnd) && (scheduledEndISO > exStart)) {
                 console.log(`[Validation] Overlap detected with Order ${field.orderId(existing)} (${exStart} - ${exEnd})`);
                 return true;
             }
             return false;
         });

         if (isOverlapping) {
             throw new Error('Selected time overlaps with another order in this timeslot. Please choose a different time.');
         }
      }
      // --- Validation End ---

      const attemptReassign = async (payload) => {
        const response = await fetch(`${REACT_APP_API_BASE_URL}/api/orders/${editingOrder.OrderID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
      };

      let { response, data } = await attemptReassign({
        time_slot_id: editingOrder.NewTimeSlotID,
        ...(editingOrder.UseManualTime ? {
          scheduled_start_date_time: scheduledStartISO,
          scheduled_end_date_time: scheduledEndISO
        } : {})
      });

      if (!response.ok || !data.success) {
        if (data?.code === 'TRUCK_UPGRADE_REQUIRED') {
          const confirmUpgrade = window.confirm(`${data.error || 'Truck space not enough.'} Reassign to 3-ton truck?`);
          if (confirmUpgrade) {
            ({ response, data } = await attemptReassign({
              time_slot_id: editingOrder.NewTimeSlotID,
              ...(editingOrder.UseManualTime ? {
                scheduled_start_date_time: scheduledStartISO,
                scheduled_end_date_time: scheduledEndISO
              } : {}),
              force_truck_tone: data.recommended_tone || 3
            }));
          }
        }
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to reassign order');
      }

      // Refresh orders to get latest data
      const refreshedOrders = await getAllOrders();
      setOrders(Array.isArray(refreshedOrders) ? refreshedOrders : (refreshedOrders?.data ?? []));

      setShowOrderEditModal(false);
      setEditingOrder(null);
      alert('Order reassigned successfully!');
    } catch (e) {
      console.error('Order reassignment error:', e);
      setOrderEditError(e.message || 'Failed to reassign order');
    }
    setOrderEditLoading(false);
  };

  const handleUnassignOrder = async () => {
    setOrderEditLoading(true);
    setOrderEditError('');
    try {
      const REACT_APP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';
      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/orders/${editingOrder.OrderID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time_slot_id: null })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to unassign order');
      }

      const refreshedOrders = await getAllOrders();
      setOrders(Array.isArray(refreshedOrders) ? refreshedOrders : (refreshedOrders?.data ?? []));

      setShowOrderEditModal(false);
      setEditingOrder(null);
      alert('Order unassigned successfully!');
    } catch (e) {
      console.error('Order unassign error:', e);
      setOrderEditError(e.message || 'Failed to unassign order');
    }
    setOrderEditLoading(false);
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

  const openMonthlyOrders = (date) => {
    setMonthlyOrdersDate(formatDate(date));
    setShowMonthlyOrdersModal(true);
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

  const installationScheduleByOrderId = useMemo(() => {
    const map = new Map();
    (installationSchedules || []).forEach(schedule => {
      const orderId = schedule?.order_id ?? schedule?.orderId ?? schedule?.OrderID ?? schedule?.orders?.id ?? schedule?.orders?.OrderID;
      if (orderId) map.set(String(orderId), schedule);
    });
    return map;
  }, [installationSchedules]);

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
                // Get truck/team IDs directly from time_slots table
                const truckId = field.timeSlotTruckId(slot);
                const deliveryTeamId = field.timeSlotDeliveryTeamId(slot);
                const warehouseTeamId = field.timeSlotWarehouseTeamId(slot);

                const truck = getTruck(truckId) || {};
                const deliveryTeam = getTeam(deliveryTeamId) || {};
                const warehouseTeam = getTeam(warehouseTeamId) || {};

                const deliveryTeamMembers = getEmployeesForTeam(field.teamId(deliveryTeam)) || [];
                const warehouseTeamMembers = getEmployeesForTeam(field.teamId(warehouseTeam)) || [];
                
                const slotOrders = getOrdersForSlot(field.timeSlotId(slot)).map(order => {
                  const customer = customers.find(c => String(field.customerId(c)) === String(field.orderCustomerId(order))) || {};
                  const building = buildings.find(b => String(field.buildingId(b)) === String(field.orderBuildingId(order))) || {};
                  const schedule = installationScheduleByOrderId.get(String(field.orderId(order)));
                  const installerTeamId = schedule?.installation_team_id ?? schedule?.installationTeamId ?? schedule?.team?.id ?? schedule?.teamId ?? schedule?.TeamID;
                  const installerTeam = installerTeamId ? (getTeam(installerTeamId) || schedule?.team || {}) : null;
                  const installerTeamMembers = installerTeamId ? getEmployeesForTeam(field.teamId(installerTeam) || installerTeamId) : [];
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
                  const enriched = {
                    ...order,
                    CustomerName: field.customerName(customer),
                    BuildingName: field.buildingName(building),
                    products,
                    InstallerTeamId: installerTeamId,
                    InstallerTeam: installerTeam,
                    InstallerTeamMembers: installerTeamMembers
                  };
                  // debug per-enriched-order
                  // console.log('[Schedule] Enriched order', { orderId: field.orderId(order), customer, building, productsSample: products.slice(0,3) });
                  return enriched;
                });

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
                      <div className="flex items-center gap-1"><Package size={10} />{slotOrders.length} orders</div>
                      <div className="flex items-center gap-1"><Truck size={10} />{field.truckPlate(truck) || 'N/A'}</div>
                      {deliveryTeamId && <div className="flex items-center gap-1"><Users size={10} />D: {field.teamType(deliveryTeam) || 'N/A'}</div>}
                      {warehouseTeamId && <div className="flex items-center gap-1"><Users size={10} />W: {field.teamType(warehouseTeam) || 'N/A'}</div>}
                    </div>

                    {expandedSlots.has(slotId) && (
                      <div className="mt-2 pt-2 border-t border-gray-200 text-xs space-y-1">
                        {deliveryTeamId && <div><strong>Delivery Team:</strong> {field.teamType(deliveryTeam) || '—'} ({deliveryTeamMembers.map(e => field.employeeName(e)).join(', ') || 'None'})</div>}
                        {warehouseTeamId && <div><strong>Warehouse Team:</strong> {field.teamType(warehouseTeam) || '—'} ({warehouseTeamMembers.map(e => field.employeeName(e)).join(', ') || 'None'})</div>}
                        <div><strong>Truck:</strong> {field.truckTone(truck)}T - {field.truckPlate(truck)}</div>
                        {slotOrders.map((order, orderIdx) => {
                          const orderKey = field.orderId(order) || `${slotId}-order-${orderIdx}`;
                          return (
                            <div key={orderKey} className="bg-white p-2 rounded mt-1 relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditOrder(order); }}
                                className="absolute top-2 right-2 p-1 hover:bg-blue-100 rounded text-blue-600"
                                title="Reassign to different timeslot"
                              >
                                <Edit size={14} />
                              </button>
                              <div><strong>{order.CustomerName}</strong></div>
                              <div>{order.BuildingName}</div>
                              <div className="text-green-600">{field.orderStatus(order)}</div>
                              {order.InstallerTeamId && (
                                <div className="text-xs text-gray-600">
                                  <strong>Installer Team:</strong> {field.teamType(order.InstallerTeam) || 'N/A'} ({(order.InstallerTeamMembers || []).map(e => field.employeeName(e)).join(', ') || 'None'})
                                </div>
                              )}
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
            // Get truck/team IDs directly from time_slots table
            const truckId = field.timeSlotTruckId(slot);
            const deliveryTeamId = field.timeSlotDeliveryTeamId(slot);
            const warehouseTeamId = field.timeSlotWarehouseTeamId(slot);

            const truck = getTruck(truckId) || {};
            const deliveryTeam = getTeam(deliveryTeamId) || {};
            const warehouseTeam = getTeam(warehouseTeamId) || {};

            const deliveryTeamMembers = getEmployeesForTeam(field.teamId(deliveryTeam)) || [];
            const warehouseTeamMembers = getEmployeesForTeam(field.teamId(warehouseTeam)) || [];

            const slotOrders = getOrdersForSlot(field.timeSlotId(slot)).map(order => {
              const customer = customers.find(c => String(field.customerId(c)) === String(field.orderCustomerId(order))) || {};
              const building = buildings.find(b => String(field.buildingId(b)) === String(field.orderBuildingId(order))) || {};
              const schedule = installationScheduleByOrderId.get(String(field.orderId(order)));
              const installerTeamId = schedule?.installation_team_id ?? schedule?.installationTeamId ?? schedule?.team?.id ?? schedule?.teamId ?? schedule?.TeamID;
              const installerTeam = installerTeamId ? (getTeam(installerTeamId) || schedule?.team || {}) : null;
              const installerTeamMembers = installerTeamId ? getEmployeesForTeam(field.teamId(installerTeam) || installerTeamId) : [];
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
              return {
                ...order,
                CustomerName: field.customerName(customer),
                BuildingName: field.buildingName(building),
                BuildingAddress: building?.address ?? customer?.address ?? '',
                products,
                InstallerTeamId: installerTeamId,
                InstallerTeam: installerTeam,
                InstallerTeamMembers: installerTeamMembers
              };
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
                      <div><strong>Plate:</strong> {field.truckPlate(truck) || 'N/A'}</div>
                      <div><strong>Capacity:</strong> {field.truckTone(truck)}T</div>
                      <div><strong>Dimensions:</strong> {field.truckLength(truck)}×{field.truckWidth(truck)}×{field.truckHeight(truck)}cm</div>
                    </div>
                  </div>

                  {deliveryTeamId && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-sm flex items-center gap-2 text-gray-700"><Users size={16} /> Delivery Team</h3>
                      <div className="bg-white p-3 rounded-md border text-sm">
                        <div><strong>Type:</strong> {field.teamType(deliveryTeam) || 'N/A'}</div>
                        <div><strong>ID:</strong> {field.teamId(deliveryTeam) || 'N/A'}</div>
                        <div><strong>Members:</strong> {deliveryTeamMembers.map(e => field.employeeName(e)).join(', ') || 'None'}</div>
                      </div>
                    </div>
                  )}

                  {warehouseTeamId && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-sm flex items-center gap-2 text-gray-700"><Users size={16} /> Warehouse Team</h3>
                      <div className="bg-white p-3 rounded-md border text-sm">
                        <div><strong>Type:</strong> {field.teamType(warehouseTeam) || 'N/A'}</div>
                        <div><strong>ID:</strong> {field.teamId(warehouseTeam) || 'N/A'}</div>
                        <div><strong>Members:</strong> {warehouseTeamMembers.map(e => field.employeeName(e)).join(', ') || 'None'}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <details className="bg-white rounded-md border text-sm">
                    <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer text-gray-700 font-medium">
                      <Package size={16} />
                      Orders ({slotOrders.length})
                    </summary>
                    <div className="p-3 border-t">
                      {slotOrders.length > 0 ? slotOrders.map((order, orderIdx) => {
                        const orderKey = field.orderId(order) || `${slotId}-order-${orderIdx}`;
                        return (
                          <div key={orderKey} className="mb-2 last:mb-0 pb-2 last:pb-0 border-b last:border-b-0 relative">
                            <button
                              onClick={() => handleEditOrder(order)}
                              className="absolute top-0 right-0 p-1 hover:bg-blue-100 rounded text-blue-600"
                              title="Reassign to different timeslot"
                            >
                              <Edit size={12} />
                            </button>
                            <div className="font-medium text-sm pr-6">{order.CustomerName}</div>
                            <div className="text-xs text-gray-600 flex items-center gap-1">
                              <MapPin size={10} />
                              {order.BuildingAddress || order.BuildingName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatTimeRange(order.scheduled_start_date_time, order.scheduled_end_date_time)}
                            </div>
                            <div className="text-xs text-green-600">{field.orderStatus(order)}</div>
                            {order.InstallerTeamId && (
                              <div className="text-xs text-gray-600">
                                <strong>Installer Team:</strong> {field.teamType(order.InstallerTeam) || 'N/A'} ({(order.InstallerTeamMembers || []).map(e => field.employeeName(e)).join(', ') || 'None'})
                              </div>
                            )}
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
                  </details>
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
            const ordersForDate = getOrdersForDate(date);
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
                {ordersForDate.length > 0 && (
                  <button
                    className="absolute bottom-1 left-1 text-xs text-blue-600 hover:text-blue-800"
                    onClick={e => { e.stopPropagation(); openMonthlyOrders(date); }}
                  >
                    Orders: {ordersForDate.length}
                  </button>
                )}
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
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-4 rounded-md shadow-sm w-full max-w-lg">
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
              <select value={editingTimeSlot.truck_id || ''} onChange={e => handleAssignTruck(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                <option value="">-- Select Truck --</option>
                {trucks.map(truck => <option key={String(field.truckId(truck))} value={field.truckId(truck)}>{field.truckPlate(truck)} ({field.truckTone(truck)}T)</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign Delivery Team</label>
              <select value={editingTimeSlot.delivery_team_id || ''} onChange={e => handleAssignTeam(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                <option value="">-- Select Team --</option>
                {teams.filter(t => field.teamType(t)?.toLowerCase().includes('delivery')).map(team => <option key={String(field.teamId(team))} value={field.teamId(team)}>{field.teamType(team)}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Select delivery team for this time slot</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign Warehouse Team</label>
              <select value={editingTimeSlot.warehouse_team_id || ''} onChange={e => handleAssignWarehouseTeam(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                <option value="">-- Select Team --</option>
                {teams.filter(t => field.teamType(t)?.toLowerCase().includes('warehouse')).map(team => <option key={`w-${String(field.teamId(team))}`} value={field.teamId(team)}>{field.teamType(team)}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Select warehouse team for loading</p>
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

  const renderOrderEditModal = () => {
    if (!editingOrder) return null;
    const buildingRecord = buildings.find(b => String(field.buildingId(b)) === String(field.orderBuildingId(editingOrder)));
    const accessStart = buildingRecord?.access_time_window_start ?? buildingRecord?.AccessTimeWindowStart ?? null;
    const accessEnd = buildingRecord?.access_time_window_end ?? buildingRecord?.AccessTimeWindowEnd ?? null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-4 rounded-md shadow-sm w-full max-w-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Reassign Order to Timeslot</h3>
            <button onClick={() => { setEditingOrder(null); setShowOrderEditModal(false); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          {orderEditError && <div className="text-red-600 text-sm mb-3">{orderEditError}</div>}

          <div className="space-y-3">
            <div className="bg-blue-50 p-3 rounded-md">
              <div className="text-sm font-medium text-gray-700 mb-2">Order Details</div>
              <div className="text-xs space-y-1">
                <div><strong>Order ID:</strong> {editingOrder.OrderID?.substring(0, 12)}...</div>
                <div><strong>Customer:</strong> {editingOrder.CustomerName}</div>
                <div><strong>Building:</strong> {editingOrder.BuildingName}</div>
                <div><strong>Status:</strong> {field.orderStatus(editingOrder)}</div>
                <div><strong>Access window:</strong> {accessStart || 'N/A'} - {accessEnd || 'N/A'}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Timeslot</label>
              <div className="p-2 bg-gray-100 rounded-md text-sm">
                {(() => {
                  const currentSlot = timeSlots.find(ts => field.timeSlotId(ts) === editingOrder.CurrentTimeSlotID);
                  return currentSlot ? `${field.timeSlotDate(currentSlot)} ${field.timeSlotStart(currentSlot)} - ${field.timeSlotEnd(currentSlot)}` : 'Not assigned';
                })()}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reassign to Timeslot</label>
              <select
                value={editingOrder.NewTimeSlotID || ''}
                onChange={e => {
                  const newId = e.target.value;
                  const selectedSlot = timeSlots.find(ts => String(field.timeSlotId(ts)) === String(newId));
                  const slotStart = selectedSlot ? field.timeSlotStart(selectedSlot) : '';
                  const slotEnd = selectedSlot ? field.timeSlotEnd(selectedSlot) : '';
                  setEditingOrder(o => ({
                    ...o,
                    NewTimeSlotID: newId,
                    ScheduledStartTime: o.UseManualTime && !o.ScheduledStartTime ? slotStart : o.ScheduledStartTime,
                    ScheduledEndTime: o.UseManualTime && !o.ScheduledEndTime ? slotEnd : o.ScheduledEndTime
                  }));
                }}
                className="w-full p-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">-- Select Timeslot --</option>
                {timeSlots
                  .filter(slot => {
                    const getRefDate = (d) => {
                       if (d instanceof Date) return d;
                       if (typeof d === 'string') return new Date(d);
                       return new Date();
                    };
                    // Robust date string comparison
                    const slotD = getRefDate(field.timeSlotDate(slot));
                    if (isNaN(slotD.getTime())) return false;
                    
                    // Create local YYYY-MM-DD strings for comparison
                    const toLocalYMD = (date) => {
                       const year = date.getFullYear();
                       const month = String(date.getMonth() + 1).padStart(2, '0');
                       const day = String(date.getDate()).padStart(2, '0');
                       return `${year}-${month}-${day}`;
                    };
                    
                    const now = new Date();
                    const slotDateStr = toLocalYMD(slotD);
                    const todayStr = toLocalYMD(now);
                    
                    if (slotDateStr > todayStr) return true;
                    if (slotDateStr < todayStr) return false;
                    
                    // Same day: check time
                    const currentHHMM = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                    const slotStart = field.timeSlotStart(slot) || "00:00";
                    return slotStart > currentHHMM;
                  })
                  .map(slot => {
                  const slotDate = field.timeSlotDate(slot);
                  const slotStart = field.timeSlotStart(slot);
                  const slotEnd = field.timeSlotEnd(slot);
                  const slotId = field.timeSlotId(slot);
                  const orderCount = orders.filter(o => field.orderTimeSlotId(o) === slotId).length;
                  return (
                    <option key={slotId} value={slotId}>
                      {slotDate} {slotStart}-{slotEnd} ({orderCount} orders)
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-gray-500 mt-1">Select a new timeslot for this order</p>
            </div>

            {/* Time Override Inputs */}
            {editingOrder.NewTimeSlotID && (
              <div className="bg-gray-50 p-2 rounded border border-gray-200 space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!editingOrder.UseManualTime}
                    onChange={(e) => {
                      const useManual = e.target.checked;
                      setEditingOrder(o => ({
                        ...o,
                        UseManualTime: useManual,
                        ScheduledStartTime: useManual ? (o.ScheduledStartTime || o._prefillStartTime || '') : '',
                        ScheduledEndTime: useManual ? (o.ScheduledEndTime || o._prefillEndTime || '') : ''
                      }));
                    }}
                  />
                  Set exact start/end time (saved as is, no buffer)
                </label>

                {editingOrder.UseManualTime && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={editingOrder.ScheduledStartTime || ''}
                        onChange={e => setEditingOrder(o => ({ ...o, ScheduledStartTime: e.target.value }))}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">End Time</label>
                      <input
                        type="time"
                        value={editingOrder.ScheduledEndTime || ''}
                        onChange={e => setEditingOrder(o => ({ ...o, ScheduledEndTime: e.target.value }))}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div className="col-span-2 text-xs text-gray-500">
                      Validates against access window ({accessStart || 'N/A'}-{accessEnd || 'N/A'}) and checks for overlaps within the selected timeslot.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleReassignOrder}
              disabled={orderEditLoading || !editingOrder.NewTimeSlotID}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:bg-gray-400"
            >
              <Save size={14} />
              {orderEditLoading ? 'Reassigning...' : 'Reassign Order'}
            </button>
            <button
              onClick={handleUnassignOrder}
              disabled={orderEditLoading}
              className="flex-1 px-3 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50 text-sm font-medium disabled:text-gray-400"
            >
              Unassign
            </button>
            <button
              onClick={() => { setEditingOrder(null); setShowOrderEditModal(false); }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderMonthlyOrdersModal = () => {
    if (!showMonthlyOrdersModal || !monthlyOrdersDate) return null;
    const dateObj = new Date(monthlyOrdersDate);
    const dayOrders = getOrdersForDate(dateObj).map(order => {
      const customer = customers.find(c => String(field.customerId(c)) === String(field.orderCustomerId(order))) || {};
      const building = buildings.find(b => String(field.buildingId(b)) === String(field.orderBuildingId(order))) || {};
      return {
        ...order,
        CustomerName: field.customerName(customer),
        BuildingName: field.buildingName(building)
      };
    });

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-4 rounded-md shadow-sm w-full max-w-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Orders on {monthlyOrdersDate}</h3>
            <button onClick={() => setShowMonthlyOrdersModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          {dayOrders.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-6">No orders scheduled</div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {dayOrders.map((order, idx) => {
                const orderKey = field.orderId(order) || `monthly-order-${idx}`;
                return (
                  <div key={orderKey} className="border rounded-md p-3 relative">
                    <button
                      onClick={() => { setShowMonthlyOrdersModal(false); handleEditOrder(order); }}
                      className="absolute top-2 right-2 p-1 hover:bg-blue-100 rounded text-blue-600"
                      title="Reassign to different timeslot"
                    >
                      <Edit size={14} />
                    </button>
                    <div className="font-medium text-sm pr-6">{order.CustomerName}</div>
                    <div className="text-xs text-gray-600">{order.BuildingName}</div>
                    <div className="text-xs text-gray-500">{formatTimeRange(order.scheduled_start_date_time, order.scheduled_end_date_time)}</div>
                    <div className="text-xs text-green-600">{field.orderStatus(order)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-full mx-auto bg-white">
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

        {unscheduledOrders.length > 0 && (
          <div className="mb-4 p-4 border border-amber-200 bg-amber-50 rounded-lg">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
              <div className="text-sm font-semibold text-amber-900">Unassigned Orders ({unscheduledOrders.length})</div>
              {/* <div className="text-xs text-amber-700">Assign to a timeslot or edit order details, then rerun the auto-scheduler.</div> */}
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {unscheduledOrders.map(order => {
                const orderId = field.orderId(order);
                const accessStart = order.BuildingAccessStart || 'N/A';
                const accessEnd = order.BuildingAccessEnd || 'N/A';
                const productPreview = (order.products || []).slice(0, 3);
                return (
                  <div key={orderId} className="bg-white border border-amber-100 rounded-md p-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="text-sm space-y-1">
                        <div className="font-medium text-gray-800">{order.CustomerName}</div>
                        <div className="text-xs text-gray-600">{order.BuildingName}</div>
                        <div className="text-xs text-gray-500">Order ID: {String(orderId || '').slice(0, 12)}...</div>
                        <div className="text-xs text-gray-600">Access window: {accessStart} - {accessEnd}</div>
                        <div className="text-xs text-gray-700">
                          Service time: {order.calculatedServiceTime || 0} min
                          <span className="text-gray-500"> (Delivery {order.calculatedDeliveryTime || 0} / Install {order.calculatedInstallationTime || 0})</span>
                          <span className="text-gray-500"> • Installation required: {order.requiresInstallation ? 'Yes' : 'No'}</span>
                        </div>
                        {productPreview.length > 0 && (
                          <div className="text-xs text-gray-600">
                            Products: {productPreview.map(p => p.ProductName || 'Unknown').join(', ')}
                            {order.products?.length > productPreview.length ? ` +${order.products.length - productPreview.length} more` : ''}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditOrder(order)}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium"
                        >
                          Assign to Timeslot
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {['daily','weekly'].map(mode => (
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
        {/* {viewMode === 'monthly' && renderMonthlyView()} */}
      </div>

      {showAddModal && renderTimeSlotModal()}
      {showOrderEditModal && renderOrderEditModal()}
      {showMonthlyOrdersModal && renderMonthlyOrdersModal()}
    </div>
  );
}
