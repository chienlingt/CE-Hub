// informationService.js
// Replaced Firestore client access with REST API calls to the Express + Prisma backend.
// - Keeps the same exported function names as before so frontend components can be updated gradually.
// - Uses fetch; optional bearer token read from localStorage 'token' (adjust as needed).
// - If your backend uses different endpoints or requires different field names, adjust the `endpointMap` below.
//
// Usage:
//  - Set REACT_APP_API_BASE_URL in your environment (e.g. http://localhost:4000)
//  - Drop this file in client/src/services and import functions as before.

const API_BASE = process.env.REACT_APP_API_BASE_URL || '';

// Map Firestore collection names (original) to REST endpoints provided by the server
const endpointMap = {
  Employee: 'employees',
  Truck: 'trucks',
  Zone: 'zones',
  TruckZone: 'truck-zones',
  Building: 'buildings',
  Product: 'products',
  Team: 'teams',
  EmployeeTeamAssignment: 'assignments',
  Report: 'reports',
  Customer: 'customers',
  Order: 'orders',
  OrderProduct: 'order-products',
  TimeSlot: 'time-slots',
  LorryTrip: 'lorry-trips',
  Roles: 'roles',
  TruckZoneList: 'truck-zones',
  Installer: 'installers',
  Outlet: 'outlets'
};

// Generic fetch wrapper that attaches auth token if present.
async function apiFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`;
  const headers = options.headers || {};
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  headers['ngrok-skip-browser-warning'] = '1'; // skip ngrok interstitial for API calls
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { credentials: 'same-origin', ...options, headers };
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    let err;
    try {
        const errorBody = await res.json();
        err = new Error(errorBody.error || `API Error: ${res.status}`);
    } catch (e) {
        const text = await res.text().catch(() => `Status ${res.status}`);
        err = new Error(`API request failed: ${text}`);
    }
    err.status = res.status;
    throw err;
  }
  // try to return json, otherwise raw text
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
}

// ========== GENERIC HELPERS ==========

async function getAllDocs(collectionName, options = {}) {
  const endpoint = endpointMap[collectionName] || collectionName.toLowerCase();
  const { sortBy, sortOrder } = options;
  let url = `${endpoint}`;
  if (sortBy && sortOrder) {
    url += `?sortBy=${encodeURIComponent(sortBy)}&sortOrder=${encodeURIComponent(sortOrder)}`;
  }
  const result = await apiFetch(url);
  // assume server returns { meta, data } or an array
  if (Array.isArray(result)) return result;
  return result.data || result;
}

async function getDocById(collectionName, id) {
  const endpoint = endpointMap[collectionName] || collectionName.toLowerCase();
  const result = await apiFetch(`${endpoint}/${encodeURIComponent(id)}`);
  return result;
}

async function addDocGeneric(collectionName, data, custom) {
  console.log(`[informationService] addDocGeneric to ${collectionName}`, data, custom);
  // custom ID generation handled by server; keep API simple: POST /api/{resource}
  const endpoint = endpointMap[collectionName] || collectionName.toLowerCase();
  const res = await apiFetch(`${endpoint}`, { method: 'POST', body: data });
  return res;
}

async function updateDocGeneric(collectionName, id, data) {
  const endpoint = endpointMap[collectionName] || collectionName.toLowerCase();
  const res = await apiFetch(`${endpoint}/${encodeURIComponent(id)}`, { method: 'PUT', body: data });
  return res;
}

async function deleteDocGeneric(collectionName, id) {
  const endpoint = endpointMap[collectionName] || collectionName.toLowerCase();
  const res = await apiFetch(`${endpoint}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res;
}

// ========== COLLECTION-SPECIFIC EXPORTS ==========

// -- Employee --
export const getAllEmployees = (options) => getAllDocs("Employee", options);
export const getEmployeeById = (id) => getDocById("Employee", id);
export const addEmployee = (data) => addDocGeneric("Employee", data);
export const updateEmployee = (id, data) => updateDocGeneric("Employee", id, data);
export const deleteEmployee = (id) => deleteDocGeneric("Employee", id);
export const getEmployeeDeletability = (id) => apiFetch(`employees/${encodeURIComponent(id)}/deletability`);

// -- Truck --
export const getAllTrucks = (options) => getAllDocs("Truck", options);
export const getTruckById = (id) => getDocById("Truck", id);
export const addTruck = (data) => addDocGeneric("Truck", data);
export const updateTruck = (id, data) => updateDocGeneric("Truck", id, data);
export const deleteTruck = (id) => deleteDocGeneric("Truck", id);
export const checkTruckAssociations = (id) => apiFetch(`trucks/${encodeURIComponent(id)}/associations`);

// -- Zone --
export const getAllZones = (options) => getAllDocs("Zone", options);
export const getZoneById = (id) => getDocById("Zone", id);
export const addZone = (data) => addDocGeneric("Zone", data);
export const updateZone = (id, data) => updateDocGeneric("Zone", id, data);
export const deleteZone = (id) => deleteDocGeneric("Zone", id);

// -- TruckZone --
export const getAllTruckZone = (options) => getAllDocs("TruckZone", options);
export const addTruckZone = (data) => addDocGeneric("TruckZone", data);
export const updateTruckZone = (id, data) => updateDocGeneric("TruckZone", id, data);
export const deleteTruckZone = (id) => deleteDocGeneric("TruckZone", id);

// -- Building --
export const getAllBuildings = (options) => getAllDocs("Building", options);
export const getBuilding = (id) => getDocById("Building", id);
export const addBuilding = (data) => addDocGeneric("Building", data);
export const updateBuilding = (id, data) => updateDocGeneric("Building", id, data);
export const deleteBuilding = (id) => deleteDocGeneric("Building", id);
export const getOrdersByBuildingId = (id) => apiFetch(`buildings/${encodeURIComponent(id)}/orders`);
export const reassignOrdersAndDeleteBuilding = (oldBuildingId, newBuildingId) => {
    return apiFetch('buildings/reassign-and-delete', {
        method: 'POST',
        body: { oldBuildingId, newBuildingId }
    });
};

// -- Product --
export const getAllProducts = (options) => getAllDocs("Product", options);
export const getProduct = (id) => getDocById("Product", id);
export const addProduct = (data) => addDocGeneric("Product", data);
export const updateProduct = (id, data) => updateDocGeneric("Product", id, data);
export const deleteProduct = (id) => deleteDocGeneric("Product", id);
export const checkProductAssociations = (id) => apiFetch(`products/${encodeURIComponent(id)}/associations`);

// -- Team --
export const getAllTeams = (options) => getAllDocs("Team", options);
export const getTeam = (id) => getDocById("Team", id);
export const addTeam = (data) => addDocGeneric("Team", data);
export const updateTeam = (id, data) => updateDocGeneric("Team", id, data);
export const deleteTeam = (id) => deleteDocGeneric("Team", id);
export const getTeamDeletability = (id) => apiFetch(`teams/${encodeURIComponent(id)}/deletability`);

// -- EmployeeTeamAssignment --
export const getAllEmployeeTeamAssignments = (options) => getAllDocs("EmployeeTeamAssignment", options);
export const getEmployeeTeamAssignment = (id) => getDocById("EmployeeTeamAssignment", id);
export const deleteEmployeeTeamAssignment = (id) => deleteDocGeneric("EmployeeTeamAssignment", id);

// assignOrUpdateEmployeeTeam: tries to find existing assignment and update, otherwise create
export async function assignOrUpdateEmployeeTeam(employeeId, teamId) {
  // fetch assignments and find one for the employee
  const list = await getAllEmployeeTeamAssignments();
  // assignments returned include employee (may be nested)
  const found = list.data ? list.data.find(a => {
    const emp = a.employee || a.employeeId || a.employeeIdStr || a.EmployeeID;
    // compare with legacy id or employeeIdStr
    return emp === employeeId || (a.employee && (a.employee.legacyId === employeeId || a.employee.employeeIdStr === employeeId));
  }) : list.find(a => (a.employeeId === employeeId || a.employeeIdStr === employeeId || (a.employee && (a.employee.legacyId === employeeId || a.employee.employeeIdStr === employeeId))));
  if (found) {
    // update assignment - set teamId (API expects UUID or legacy depending on backend)
    return updateDocGeneric("EmployeeTeamAssignment", found.id || found.legacyId, { teamId: teamId });
  } else {
    // create new assignment - backend should accept employee reference as legacyId or uuid
    return addDocGeneric("EmployeeTeamAssignment", { EmployeeID: employeeId, TeamID: teamId });
  }
}

// -- Order / OrderProduct --
export const getAllOrders = (options) => getAllDocs("Order", options);
export const getOrdersWithIssues = () => apiFetch('orders?issues_only=true');
export const resolveOrderIssue = (id, data) => apiFetch(`orders/${encodeURIComponent(id)}/issue`, { method: 'PATCH', body: data });
export const getAllOrdersSummary = () => apiFetch('orders?include_products=false');
export const getOrder = (id) => getDocById("Order", id);
export const addOrder = (data) => addDocGeneric("Order", data, { idField: "OrderID", prefix: "ORD_" });
export const updateOrder = (id, data) => updateDocGeneric("Order", id, data);
export const updateOrderStatus = (id, order_status) => apiFetch(`orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { order_status } });
export const deleteOrder = (id) => deleteDocGeneric("Order", id);

export const getAllOrderProducts = (options) => getAllDocs("OrderProduct", options);
export const addOrderProduct = (data) => addDocGeneric("OrderProduct", data);
export const updateOrderProduct = (id, data) => updateDocGeneric("OrderProduct", id, data);
export const deleteOrderProduct = (id) => deleteDocGeneric("OrderProduct", id);

export async function getOrderProductsByOrderId(orderId) {
  // GET all order-products then filter client-side by orderId (backend can be enhanced to support filter)
  const res = await getAllOrderProducts();
  const items = res.data || res;
  return items.filter(op => (op.OrderID === orderId || op.orderIdStr === orderId || op.orderId === orderId));
}

// -- Product helpers
export async function getProductById(productId) {
  // try server endpoint first
  try {
    const p = await getProduct(productId);
    return p;
  } catch {
    // fallback to fetching all and matching by productId field
    const list = await getAllProducts();
    const items = list.data || list;
    return items.find(i => i.ProductID === productId || i.productIdStr === productId || i.legacyId === productId) || null;
  }
}

// -- Building helper
export async function getBuildingById(buildingId) {
  try {
    const b = await getBuilding(buildingId);
    return b;
  } catch {
    const list = await getAllBuildings();
    const items = list.data || list;
    return items.find(i => i.BuildingID === buildingId || i.buildingIdStr === buildingId || i.legacyId === buildingId) || null;
  }
}

// -- Cases --
export const getAllCases = (options) => getAllDocs("Report", options);
export const addCases = (data) => addDocGeneric("Report", data);
export const updateCases = (id, data) => updateDocGeneric("Report", id, data);
export const deleteCases = (id) => deleteDocGeneric("Report", id);

// -- Customer --
export const getAllCustomers = (options) => getAllDocs("Customer", options);
export const getCustomer = (id) => getDocById("Customer", id);
export const addCustomer = (data) => addDocGeneric("Customer", data, { idField: "CustomerID", prefix: "CUS_" });
export const updateCustomer = (id, data) => updateDocGeneric("Customer", id, data);
export const deleteCustomer = (id) => deleteDocGeneric("Customer", id);

// -- TimeSlot --
export const getAllTimeSlots = (options) => getAllDocs("TimeSlot", options);
export const addTimeSlot = (data) => addDocGeneric("TimeSlot", data, { idField: "TimeSlotID", prefix: "TSL_" });
export const updateTimeSlot = (id, data) => updateDocGeneric("TimeSlot", id, data);
export const deleteTimeSlot = (id) => deleteDocGeneric("TimeSlot", id);

// -- LorryTrip --
export const getAllLorryTrips = (options) => getAllDocs("LorryTrip", options);
export const addLorryTrip = (data) => addDocGeneric("LorryTrip", data, { idField: "LorryTripID", prefix: "TRP_" });
export const updateLorryTrip = (id, data) => updateDocGeneric("LorryTrip", id, data);
export const deleteLorryTrip = (id) => deleteDocGeneric("LorryTrip", id);

// -- Outlets --
export const getAllOutlets = (options) => getAllDocs("Outlet", options);

// -- Installer --
export const getInstallerByEmployeeId = (id) => apiFetch(`installers/employee/${id}`);
export const addInstaller = (data) => addDocGeneric("Installer", data);
export const updateInstaller = (id, data) => updateDocGeneric("Installer", id, data);

// -- Roles
export const getRoles = (options) => getAllDocs("Roles", options);

// ========== COMMON HELPERS ==========

// Get employee objects for a team (by TeamID)
export async function getEmployeesForTeam(teamId) {
  // fetch assignments, filter by TeamID, then fetch employees and filter by legacyId/employeeIdStr
  const assignmentsRes = await getAllEmployeeTeamAssignments();
  const assignments = assignmentsRes.data || assignmentsRes;
  const matched = assignments.filter(a => a.TeamID === teamId || a.teamIdStr === teamId || a.teamId === teamId);
  const employeeIds = matched.map(a => a.EmployeeID || (a.employee && (a.employee.legacyId || a.employee.employeeIdStr || a.employee.id))).filter(Boolean);
  if (employeeIds.length === 0) return [];
  const employeesRes = await getAllEmployees();
  const employees = employeesRes.data || employeesRes;
  return employees.filter(emp => employeeIds.includes(emp.EmployeeID) || employeeIds.includes(emp.legacyId) || employeeIds.includes(emp.employeeIdStr));
}
