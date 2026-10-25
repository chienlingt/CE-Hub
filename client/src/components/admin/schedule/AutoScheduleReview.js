import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  Clock,
  Package,
  MapPin,
  Truck,
  PlayCircle,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Settings,
  Save,
  Users,
  Warehouse,
  ChevronDown,
  ChevronUp,
  User
} from "lucide-react";

import { API_BASE_URL as REACT_APP_API_BASE_URL } from '../../../utils/apiBaseUrl';

export default function AutoScheduleReview() {
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(null);
  const [stats, setStats] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  // Configuration state
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState({
    warehouse_address: 'University of Malaya, Kuala Lumpur',
    warehouse_postal: '50603',
    cron_expression: '0 0 * * *',
    enabled: true
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  // Load configuration on mount
  useEffect(() => {
    console.log('[AutoScheduleReview] Component mounted');
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      setConfigLoading(true);
      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/scheduler/config`);
      const data = await response.json();

      if (data.success && data.config) {
        setConfig({
          warehouse_address: data.config.warehouse_address || '',
          warehouse_postal: data.config.warehouse_postal || '',
          cron_expression: data.config.cron_expression || '0 0 * * *',
          enabled: data.config.enabled !== undefined ? data.config.enabled : true
        });
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
    } finally {
      setConfigLoading(false);
    }
  };

  const saveConfiguration = async () => {
    try {
      setConfigSaving(true);
      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/scheduler/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (data.success) {
        alert('Configuration saved successfully! The cron schedule has been updated.');
      } else {
        alert(`Failed to save configuration: ${data.error}`);
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      alert('Failed to save configuration. Please try again.');
    } finally {
      setConfigSaving(false);
    }
  };

  const handleSchedule = async () => {
    setLoading(true);
    setScheduledAt(new Date());
    setSchedule([]);
    setUnscheduled([]);
    setStats(null);

    try {
      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/scheduler/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      console.log('Scheduler response:', data);

      if (data.success) {
        setSchedule(data.details.scheduledOrders || []);
        setUnscheduled(data.details.unscheduledOrders || []);
        setStats(data.results);
      } else {
        alert(`Scheduler failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Scheduling error:', error);
      alert('Failed to run scheduler. Please check the console for details.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getTotalProductCount = (orderProducts) => {
    if (!orderProducts || !Array.isArray(orderProducts)) return 0;
    return orderProducts.reduce((sum, op) => sum + (op.quantity || 0), 0);
  };

  const getServiceTypeLabel = (serviceType) => {
    const types = {
      delivery: 'Delivery Only',
      delivery_installation: 'Delivery + Installation',
      stock_transfer: 'Stock Transfer'
    };
    return types[serviceType] || serviceType || 'N/A';
  };

  const formatMinutes = (value) => {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return '0 min';
    return `${minutes} min`;
  };

  const handleToggleExpand = (orderId) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600 rounded-xl">
                <Calendar className="text-white" size={28} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Auto Scheduler</h1>
                <p className="text-gray-600">Optimize and schedule pending orders automatically</p>
              </div>
            </div>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Settings size={20} />
              {showConfig ? 'Hide' : 'Show'} Configuration
            </button>
          </div>
        </div>

        {/* Configuration Panel */}
        {showConfig && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Settings size={20} />
              Scheduler Configuration
            </h2>

            {configLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-2" />
                <p className="text-gray-600">Loading configuration...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Warehouse Address
                  </label>
                  <input
                    type="text"
                    value={config.warehouse_address}
                    onChange={(e) => setConfig({ ...config, warehouse_address: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., University of Malaya, Kuala Lumpur"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Warehouse Postal Code
                  </label>
                  <input
                    type="text"
                    value={config.warehouse_postal}
                    onChange={(e) => setConfig({ ...config, warehouse_postal: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 50603"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cron Schedule Expression
                  </label>
                  <input
                    type="text"
                    value={config.cron_expression}
                    onChange={(e) => setConfig({ ...config, cron_expression: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    placeholder="0 0 * * *"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Examples: "0 0 * * *" (daily at midnight), "0 0 */2 * *" (every 2 days at midnight)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enabled"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
                    Enable automatic scheduling
                  </label>
                </div>

                <button
                  onClick={saveConfiguration}
                  disabled={configSaving}
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {configSaving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Configuration
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Control Panel */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex-1 text-center md:text-left">
              <p className="text-sm text-gray-600 mb-1">Click the button to run the scheduler now</p>
              <p className="text-xs text-gray-500">
                The scheduler will process all pending orders and assign them to optimal timeslots
              </p>
            </div>

            <button
              onClick={handleSchedule}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <RefreshCw size={20} className="animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <PlayCircle size={20} />
                  Run Scheduler Now
                </>
              )}
            </button>
          </div>

          {scheduledAt && (
            <div className="mt-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-2 rounded-lg">
              <CheckCircle size={16} />
              Last run: {scheduledAt.toLocaleString()}
            </div>
          )}
        </div>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 text-green-600 mb-2">
                <CheckCircle size={24} />
                <span className="text-base font-semibold">Successfully Scheduled</span>
              </div>
              <p className="text-4xl font-bold text-gray-900">{stats.scheduled}</p>
              <p className="text-sm text-gray-600 mt-1">orders assigned to timeslots</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 text-orange-600 mb-2">
                <AlertCircle size={24} />
                <span className="text-base font-semibold">Unscheduled</span>
              </div>
              <p className="text-4xl font-bold text-gray-900">{stats.unscheduled}</p>
              <p className="text-sm text-gray-600 mt-1">orders could not be scheduled</p>
            </div>
          </div>
        )}


        {/* Scheduled Orders */}
        {schedule.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle size={24} className="text-green-600" />
              Scheduled Orders ({schedule.length})
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order Ref
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Products
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Scheduled Time
                    </th>
                    {/* <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Loading Seq
                    </th> */}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {schedule.map((order) => (
                    <ScheduledOrderRow
                      key={order.id}
                      order={order}
                      isExpanded={expandedOrderId === order.id}
                      onToggleExpand={handleToggleExpand}
                      getTotalProductCount={getTotalProductCount}
                      getServiceTypeLabel={getServiceTypeLabel}
                      formatTime={formatTime}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Unscheduled Orders */}
        {unscheduled.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle size={24} className="text-red-600" />
              Unscheduled Orders ({unscheduled.length})
            </h2>

            <div className="space-y-3">
              {unscheduled.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-red-50 rounded-xl p-4 border-l-4 border-red-500"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">Order Ref: {item.odoo_order_ref || 'Not Synced'}</p>
                      <p className="text-sm text-gray-600 mt-1">Reason: {item.unscheduled_reason || 'No suitable timeslot found'}</p>
                      <div className="mt-2 text-sm text-gray-700 space-y-1">
                        <p><span className="font-medium">Customer:</span> {item.customers?.full_name || 'N/A'}</p>
                        <p><span className="font-medium">Building:</span> {item.buildings?.building_name || 'N/A'}</p>
                        <p><span className="font-medium">Products:</span> {getTotalProductCount(item.order_products)} item(s)</p>
                        <p>
                          <span className="font-medium">Service Time:</span>{' '}
                          {formatMinutes(item.calculatedServiceTime)}
                          <span className="text-xs text-gray-500">
                            {' '}({formatMinutes(item.calculatedDeliveryTime)} delivery, {formatMinutes(item.calculatedInstallationTime)} install)
                          </span>
                        </p>
                        <p><span className="font-medium">Installation Required:</span> {item.requiresInstallation ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate('/schedule')}
                        className="px-3 py-1.5 bg-white border border-red-200 text-red-700 rounded-md hover:bg-red-100 text-sm font-medium"
                      >
                        Assign in Schedule
                      </button>
                      <button
                        onClick={() => navigate('/customer/manage-orders')}
                        className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-100 text-sm font-medium"
                      >
                        Edit Order
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Empty State */}
        {!loading && !stats && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={40} className="text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Schedule Generated Yet</h3>
              <p className="text-gray-600 mb-4">
                Click "Run Scheduler Now" to process pending orders and create an optimized schedule
              </p>
              <p className="text-sm text-gray-500">
                The scheduler will group orders by postal code, optimize routes, and assign them to timeslots with proper truck loading sequence
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Scheduled Order Row Component with expandable details
function ScheduledOrderRow({ order, isExpanded, onToggleExpand, getTotalProductCount, getServiceTypeLabel, formatTime }) {
  const productCount = getTotalProductCount(order.order_products);

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {order.odoo_order_ref || 'Not Synced'}
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <div className="text-sm font-medium text-gray-900">
            {order.customers?.full_name || 'N/A'}
          </div>
          <div className="text-sm text-gray-500">{order.customers?.phone || ''}</div>
        </td>
        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
          {productCount} {productCount === 1 ? 'item' : 'items'}
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          <div className="text-sm text-gray-900">
            {formatTime(order.scheduled_start_date_time)}
          </div>
          <div className="text-xs text-gray-500">
            to {formatTime(order.scheduled_end_date_time)}
          </div>
        </td>
        {/* <td className="px-4 py-4 whitespace-nowrap">
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
            #{order.truck_loading_sequence || 'N/A'}
          </span>
        </td> */}
        <td className="px-4 py-4 whitespace-nowrap text-center text-sm">
          <button
            onClick={() => onToggleExpand(order.id)}
            className="text-blue-600 hover:text-blue-900"
            title="View Details"
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 inline" />
            ) : (
              <ChevronDown className="w-5 h-5 inline" />
            )}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan="6" className="px-4 py-4 bg-gradient-to-r from-green-50 to-blue-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Info */}
              <div>
                <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Customer Information
                </h4>
                <div className="space-y-1 text-sm">
                  <p><span className="font-medium">Name:</span> {order.customers?.full_name || 'N/A'}</p>
                  <p><span className="font-medium">Email:</span> {order.customers?.email || 'N/A'}</p>
                  <p><span className="font-medium">Phone:</span> {order.customers?.phone || 'N/A'}</p>
                  <p><span className="font-medium">Address:</span> {order.customers?.address || 'N/A'}</p>
                  <p><span className="font-medium">Postcode:</span> {order.customers?.postcode || 'N/A'}</p>
                </div>
              </div>

              {/* Building Info */}
              <div>
                <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Building Information
                </h4>
                <div className="space-y-1 text-sm">
                  <p><span className="font-medium">Building:</span> {order.buildings?.building_name || 'N/A'}</p>
                  <p><span className="font-medium">Type:</span> {order.buildings?.housing_type || 'N/A'}</p>
                  <p><span className="font-medium">Postal Code:</span> {order.buildings?.postal_code || 'N/A'}</p>
                  <p><span className="font-medium">Access Time:</span> {order.buildings?.access_time_window_start || 'N/A'} - {order.buildings?.access_time_window_end || 'N/A'}</p>
                </div>
              </div>

              {/* Timeslot Info */}
              {order.time_slots && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Timeslot Assignment
                  </h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="font-medium">Date:</span> {order.time_slots.date || 'N/A'}</p>
                    <p><span className="font-medium">Time Window:</span> {order.time_slots.time_window_start || 'N/A'} - {order.time_slots.time_window_end || 'N/A'}</p>
                    {order.time_slots.truck && (
                      <p><span className="font-medium">Truck:</span> {order.time_slots.truck.plate_no || 'N/A'}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Work & Travel Metrics */}
              {(order.workMinutes || order.travelMinutes || order.travelDistanceKm) && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Logistics Metrics
                  </h4>
                  <div className="space-y-1 text-sm">
                    {order.workMinutes && <p><span className="font-medium">Work Time:</span> {order.workMinutes} min</p>}
                    {order.travelMinutes && <p><span className="font-medium">Travel Time:</span> {order.travelMinutes} min (OSRM)</p>}
                    {order.travelDistanceKm && <p><span className="font-medium">Travel Distance:</span> {order.travelDistanceKm} km</p>}
                    <p><span className="font-medium">Loading Sequence:</span> #{order.truck_loading_sequence || 'N/A'}</p>
                  </div>
                </div>
              )}

              {/* Products */}
              <div className="md:col-span-2">
                <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Products ({order.order_products?.length || 0})
                </h4>
                <div className="space-y-2">
                  {order.order_products?.map((op, idx) => (
                    <div key={idx} className="bg-white p-3 rounded border border-gray-200 text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium">{op.products?.product_name || op.odoo_product_name || 'Unknown Product'}</span>
                        <span className="text-gray-600">Qty: {op.quantity}</span>
                      </div>
                      <div className="mt-1 text-gray-600">
                        <span className="mr-4">Service: {getServiceTypeLabel(op.service_type)}</span>
                        {op.dismantle_required && <span className="text-orange-600">Dismantle Required</span>}
                      </div>
                      {(op.custom_installation_time_min || op.custom_installation_time_max) && (
                        <div className="mt-1 text-gray-600">
                          Installation Time: {op.custom_installation_time_min || 0}-{op.custom_installation_time_max || 0} min
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Special Equipment */}
              {order.special_equipment_needed && (
                <div className="md:col-span-2">
                  <h4 className="font-semibold text-gray-700 mb-2">Special Equipment</h4>
                  <p className="text-sm text-gray-600 bg-yellow-50 p-2 rounded border border-yellow-200">
                    {order.special_equipment_needed}
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
