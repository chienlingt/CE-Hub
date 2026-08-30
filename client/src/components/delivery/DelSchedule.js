import {
  Calendar,
  Check,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  Package,
  Phone,
  Route,
  Star,
  Timer,
  User,
  Users
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSlotStatusStyle, getSlotStatusLabel } from '../../utils/slotStatusHelpers';
import { todayLocalDateKey } from '../../utils/dateKey';
import LoadingChecklist from '../common/LoadingChecklist';
import { ScannerSection } from '../common/ScanStation';
import { useAuth } from '../../contexts/AuthContext';
import { useDeliverySchedule } from '../../hooks/useDeliverySchedule';
import { API_BASE_URL } from '../../utils/apiBaseUrl';

// Compose the display/navigation address for an order: remarks override wins,
// else the customer's address parts (the building name is rendered separately).
function orderAddress(order) {
  if (order.remarks_delivery_address) return order.remarks_delivery_address;
  const c = order.customers;
  if (!c) return order.buildings?.building_name || '';
  return [c.address, c.city, c.state].filter(Boolean).join(', ');
}

function getEstimatedDuration(order) {
  let totalMinutes = 30; // Base delivery time
  (order.order_products || []).forEach(op => {
    const installMin = op.products?.estimated_installation_time_min || 0;
    totalMinutes += installMin * (op.quantity || 1);
  });
  return totalMinutes;
}

function getTotalEstimatedTime(orders) {
  return orders.reduce((total, order) => total + getEstimatedDuration(order), 0);
}

function generateGoogleMapsRoute(orders) {
  if (orders.length === 0) return '#';
  const addresses = orders.map(orderAddress).filter(Boolean);
  if (addresses.length === 0) return '#';
  const waypoints = addresses.map(addr => encodeURIComponent(addr)).join('|');
  const destination = encodeURIComponent(addresses[addresses.length - 1]);
  return `https://www.google.com/maps/dir/Current+Location/${waypoints}/${destination}`;
}

function generateSingleLocationMap(address) {
  return `https://www.google.com/maps/search/${encodeURIComponent(address)}`;
}

function getStatusColor(status) {
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
}

function formatTime(date) {
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
}

export default function DeliverySchedule() {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState(todayLocalDateKey());
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [teamAutoSelectEnabled, setTeamAutoSelectEnabled] = useState(true);
  const [endingTrip, setEndingTrip] = useState(null); // timeSlotId being ended

  const employeeId = currentUser?.employeeId || sessionStorage.getItem('employeeId') || '';

  const { teams, assignedTeamIds, slots, setSlots, loading, refresh } = useDeliverySchedule({
    date: selectedDate,
    teamId: selectedTeam,
    employeeId,
  });

  // Default the team filter to the user's assigned delivery team once known.
  // Users without an assignment get the explicit unassigned state below —
  // never another team's schedule.
  useEffect(() => {
    if (!teamAutoSelectEnabled) return;
    if (selectedTeam !== 'all') return;
    if (assignedTeamIds.length === 0) return;
    setSelectedTeam(assignedTeamIds[0]);
  }, [assignedTeamIds, selectedTeam, teamAutoSelectEnabled]);

  const isAssigned = assignedTeamIds.length > 0;
  // Unassigned + no manual team pick yet → show the unassigned card instead of a schedule.
  const showUnassigned = !loading && !isAssigned && teamAutoSelectEnabled;

  // ScannerSection persists the item server-side, then we merge it into the
  // nested slots state so the row updates before the next 30s poll.
  const mergeOrderProduct = (orderId, updatedItem) => {
    setSlots(prev => prev.map(slot =>
      slot.orders.some(o => o.id === orderId)
        ? {
            ...slot,
            orders: slot.orders.map(o => o.id !== orderId ? o : {
              ...o,
              order_products: o.order_products.map(op =>
                op.id === updatedItem.id ? { ...op, ...updatedItem } : op
              ),
            }),
          }
        : slot
    ));
  };

  // A.3.6a: End Trip — calls POST /api/time-slots/:id/end-trip
  const endTrip = async (timeSlotId, slotOrders) => {
    const nonTerminal = slotOrders.filter(o => !['Delivered', 'Cancelled', 'Failed'].includes(o.order_status));
    if (nonTerminal.length > 0) {
      alert(`Cannot end trip — ${nonTerminal.length} order(s) are still in progress.`);
      return;
    }
    if (!window.confirm('Confirm truck has returned and all orders are done?')) return;
    setEndingTrip(timeSlotId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/time-slots/${timeSlotId}/end-trip`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ employee_id: employeeId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      console.error('[DelSchedule] End trip failed:', err.message);
      alert(`Failed to end trip: ${err.message}`);
    } finally {
      setEndingTrip(null);
    }
  };

  if (loading && slots.length === 0 && !showUnassigned) {
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
                {teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.team_type}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Unassigned state — no random team is ever auto-selected */}
        {showUnassigned ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">You're not assigned to a delivery team</h3>
            <p className="text-gray-600">
              Ask an administrator to add you to a team to see your schedule.
              You can still browse a team's schedule with the filter above.
            </p>
          </div>
        ) : (
        /* Time Slot Schedule */
        <div className="space-y-6">
          {slots.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No deliveries scheduled</h3>
              <p className="text-gray-600">There are no deliveries scheduled for the selected date.</p>
            </div>
          ) : (
            slots.map((slot) => {
              const slotOrders = slot.orders;
              const totalTime = getTotalEstimatedTime(slotOrders);
              const completedOrders = slotOrders.filter(o => o.order_status === 'Delivered').length;
              const slotStatus = slot.slot_status || 'scheduled';
              const isActive = slotStatus === 'out_for_delivery';

              return (
                <div key={slot.id} className={`bg-white rounded-xl shadow-sm overflow-hidden ${isActive ? 'border-2 border-orange-400' : 'border border-gray-100'}`}>
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
                            {slot.time_window_start} - {slot.time_window_end}
                          </h3>
                          <p className="text-sm text-gray-600">{slot.date}</p>
                          {/* Team, Truck and Slot Status */}
                          <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                            {/* A.3.6a: slot status badge */}
                            <span className={`px-2 py-1 rounded font-medium ${getSlotStatusStyle(slotStatus)}`}>
                              {getSlotStatusLabel(slotStatus)}
                            </span>
                            {slot.departed_at && (
                              <span className="text-gray-500">
                                Departed: {new Date(slot.departed_at).toLocaleTimeString()}
                              </span>
                            )}
                            {slot.delivery_team && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                                Delivery: {slot.delivery_team.team_type}
                              </span>
                            )}
                            {slot.warehouse_team && (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
                                Warehouse: {slot.warehouse_team.team_type}
                              </span>
                            )}
                            {slot.truck && (
                              <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">
                                Truck: {slot.truck.plate_no}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-blue-600">{slotOrders.length}</p>
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
                          href={generateGoogleMapsRoute(slotOrders)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Route className="h-4 w-4 mr-2" />
                          Optimal Route
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                        {/* A.3.6a: End Trip button — visible when slot is active and the user is on a team */}
                        {isActive && isAssigned && (
                          <button
                            onClick={() => endTrip(slot.id, slotOrders)}
                            disabled={endingTrip === slot.id}
                            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            <Check className="h-4 w-4 mr-2" />
                            {endingTrip === slot.id ? 'Ending…' : 'End Trip'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Orders List */}
                  <div className="p-6">
                    <div className="space-y-4">
                      {slotOrders.map((order, index) => {
                        const customer = order.customers;
                        const orderProductNames = (order.order_products || []).map(op => {
                          const name = op.products?.product_name || op.odoo_product_name;
                          return name ? `${op.quantity || 1}x ${name}` : '';
                        }).filter(Boolean);

                        const loadingSeq = order.truck_loading_sequence;
                        const status = order.order_status || 'Pending';

                        return (
                          <div key={order.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
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
                                  <h4 className="font-semibold text-gray-900">{order.id}</h4>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                                    {status}
                                  </span>
                                </div>
                                <div className="space-y-1 text-sm text-gray-600">
                                  {customer && (
                                    <>
                                      <div className="flex items-center gap-1">
                                        <User className="h-3 w-3 flex-shrink-0" />
                                        <span>{customer.full_name}</span>
                                      </div>
                                      {/* Customer phone*/}
                                      <div className="flex items-center gap-1">
                                        <Phone className="h-3 w-3 flex-shrink-0" />
                                        <span>{customer.phone || 'N/A'}</span>
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
                                        <p className="text-sm text-gray-900 font-medium">{order.buildings?.building_name || 'No building'}</p>
                                        <p className="text-xs text-gray-600">{orderAddress(order)}</p>
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
                                  {order.delivery_start_date_time && (
                                    <div className="text-blue-600">
                                      Delivery Start: {formatTime(order.delivery_start_date_time)}
                                    </div>
                                  )}
                                  {order.delivery_end_date_time && (
                                    <div className="text-green-600">
                                      Delivery End: {formatTime(order.delivery_end_date_time)}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Actions — only navigation button remains */}
                              <div className="lg:col-span-2 flex items-center space-x-2">
                                <a
                                  href={generateSingleLocationMap(orderAddress(order))}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                                >
                                  <Navigation className="h-4 w-4 mr-1" />
                                  Navigate
                                </a>
                              </div>
                            </div>

                            {/* A2 — Loading Checklist (read-only progress) + Unloading Checklist (at customer).
                                Execution actions require a team assignment. */}
                            {isAssigned && !['Delivered'].includes(status) && (
                              <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                                {/* Loading stage — read-only; departure via DriverDashboard Leave warehouse */}
                                {!['Delivering', 'Delivered'].includes(status) && (
                                  <>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                      Loading Checklist
                                    </p>
                                    <LoadingChecklist
                                      orderId={order.id}
                                      orderRef={order.odoo_order_ref || 'Not Synced'}
                                      customerName={customer?.full_name || ''}
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
                                        items={order.order_products || []}
                                        onItemUpdated={(updatedItem) => mergeOrderProduct(order.id, updatedItem)}
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
                                      orderId={order.id}
                                      orderRef={order.odoo_order_ref || 'Not Synced'}
                                      customerName={customer?.full_name || ''}
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
                                        items={order.order_products || []}
                                        onItemUpdated={(updatedItem) => mergeOrderProduct(order.id, updatedItem)}
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Additional Info for Completed Orders */}
                            {status === 'Delivered' && order.customer_rating && (
                              <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center">
                                    <Star className="h-4 w-4 text-yellow-400 mr-1 fill-current" />
                                    <span className="text-sm font-medium">{order.customer_rating}/5</span>
                                    {order.customer_feedback && (
                                      <span className="text-sm text-gray-600 ml-3">"{order.customer_feedback}"</span>
                                    )}
                                  </div>
                                  {order.proof_of_delivery_url && (
                                    <a
                                      href={order.proof_of_delivery_url}
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
        )}
      </div>
    </div>
  );
}
