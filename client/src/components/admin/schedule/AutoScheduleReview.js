import React, { useState, useEffect } from "react";
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
  Warehouse
} from "lucide-react";

const REACT_APP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

export default function AutoScheduleReview() {
  // Generate mock data for initial display
  const generateMockScheduleData = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString();

    return {
      scheduled: [
        {
          id: 'ORD_MOCK_SCHED_001',
          customer_id: 'CUST_001',
          customers: { full_name: 'Ahmad Hassan', phone: '012-3456789', postcode: '50100' },
          buildings: { building_name: 'Menara KLCC', postal_code: '50088', access_time_window_start: '08:00', access_time_window_end: '22:00' },
          scheduled_start_date_time: `${tomorrowDate.split('T')[0]}T09:00:00`,
          scheduled_end_date_time: `${tomorrowDate.split('T')[0]}T10:30:00`,
          truck_loading_sequence: 2,
          time_slot_id: 'TS_001',
          time_slots: {
            time_window_start: '08:00',
            time_window_end: '12:00',
            delivery_team: { team_type: 'Delivery Team A' },
            warehouse_team: { team_type: 'Warehouse Team A' },
            truck: { plate_no: 'WXY1234' }
          },
          order_products: [
            { products: { product_name: 'Samsung Smart TV 55"' }, quantity: 1 }
          ]
        },
        {
          id: 'ORD_MOCK_SCHED_002',
          customer_id: 'CUST_002',
          customers: { full_name: 'Siti Aminah', phone: '013-9876543', postcode: '50450' },
          buildings: { building_name: 'Pavilion Residences', postal_code: '55100', access_time_window_start: '09:00', access_time_window_end: '18:00' },
          scheduled_start_date_time: `${tomorrowDate.split('T')[0]}T10:00:00`,
          scheduled_end_date_time: `${tomorrowDate.split('T')[0]}T11:30:00`,
          truck_loading_sequence: 1,
          time_slot_id: 'TS_001',
          time_slots: {
            time_window_start: '08:00',
            time_window_end: '12:00',
            delivery_team: { team_type: 'Delivery Team A' },
            warehouse_team: { team_type: 'Warehouse Team A' },
            truck: { plate_no: 'WXY1234' }
          },
          order_products: [
            { products: { product_name: 'LG Washing Machine' }, quantity: 1 },
            { products: { product_name: 'Panasonic Dryer' }, quantity: 1 }
          ]
        }
      ],
      unscheduled: [
        {
          id: 'ORD_MOCK_UNSCHED_001',
          customer_id: 'CUST_003',
          customers: { full_name: 'David Tan', phone: '016-2345678', postcode: '47400' },
          buildings: { building_name: 'Sunway Pyramid Tower', postal_code: '47500' },
          reason: 'Outside building access time window (available 10:00-16:00, needed 08:00-12:00)',
          order_products: [
            { products: { product_name: 'Daikin Air Conditioner' }, quantity: 2 }
          ]
        }
      ],
      stats: {
        scheduled: 2,
        unscheduled: 1,
        installationSchedulesCreated: 2,
        timeslotsCreated: 1,
        postalCodeGroups: 2,
        apiRequestCount: 0,
        warnings: ['Mock data - run scheduler to see real results']
      },
      installations: [
        {
          id: 'INST_MOCK_001',
          order_id: 'ORD_MOCK_SCHED_001',
          installation_team_id: 'TEAM_INST_001',
          estimated_arrival_time: `${tomorrowDate.split('T')[0]}T09:30:00`,
          status: 'Scheduled',
          orders: {
            id: 'ORD_MOCK_SCHED_001',
            customers: { full_name: 'Ahmad Hassan' },
            buildings: { building_name: 'Menara KLCC' }
          },
          team: { team_type: 'Installation Team A' }
        },
        {
          id: 'INST_MOCK_002',
          order_id: 'ORD_MOCK_SCHED_002',
          installation_team_id: 'TEAM_INST_002',
          estimated_arrival_time: `${tomorrowDate.split('T')[0]}T10:30:00`,
          status: 'Scheduled',
          orders: {
            id: 'ORD_MOCK_SCHED_002',
            customers: { full_name: 'Siti Aminah' },
            buildings: { building_name: 'Pavilion Residences' }
          },
          team: { team_type: 'Installation Team B' }
        }
      ]
    };
  };

  const mockData = generateMockScheduleData();

  const [schedule, setSchedule] = useState(mockData.scheduled);
  const [unscheduled, setUnscheduled] = useState(mockData.unscheduled);
  const [installationSchedules, setInstallationSchedules] = useState(mockData.installations);
  const [loading, setLoading] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(new Date(Date.now() - 30 * 60 * 1000)); // 30 minutes ago for mock
  const [stats, setStats] = useState(mockData.stats);

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
    console.log('[AutoScheduleReview] ===== COMPONENT MOUNTED =====');
    console.log('[AutoScheduleReview] Initial mock data loaded:');
    console.log('[AutoScheduleReview] - Scheduled orders:', schedule.length);
    console.log('[AutoScheduleReview] - Unscheduled orders:', unscheduled.length);
    console.log('[AutoScheduleReview] - Installation schedules:', installationSchedules.length);
    console.log('[AutoScheduleReview] - Stats:', stats);
    console.log('[AutoScheduleReview] Sample scheduled order:', schedule[0]);

    loadConfiguration();
    loadInstallationSchedules();
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

  const loadInstallationSchedules = async () => {
    try {
      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/scheduler/installation-schedules`);
      const data = await response.json();

      if (data.success) {
        setInstallationSchedules(data.schedules || []);
      }
    } catch (error) {
      console.error('Error loading installation schedules:', error);
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

      if (data.success) {
        setSchedule(data.details.scheduledOrders || []);
        setUnscheduled(data.details.unscheduledOrders || []);
        setStats(data.results);

        // Reload installation schedules
        await loadInstallationSchedules();
      } else {
        alert(`Scheduler failed: ${data.error}`);
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <CheckCircle size={20} />
                <span className="text-sm font-medium">Scheduled</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.scheduled}</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <AlertCircle size={20} />
                <span className="text-sm font-medium">Unscheduled</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.unscheduled}</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <Package size={20} />
                <span className="text-sm font-medium">Installations</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.installationSchedulesCreated}</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-purple-600 mb-1">
                <MapPin size={20} />
                <span className="text-sm font-medium">API Requests</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.apiRequestCount}</p>
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

            <div className="space-y-3">
              {schedule.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-4 border-l-4 border-green-500 hover:shadow-md transition-shadow"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="font-semibold text-gray-700">Order ID:</span>
                      <p className="text-gray-900">{item.orderId}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Start Time:</span>
                      <p className="text-gray-900">{formatTime(item.startTime)}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">End Time:</span>
                      <p className="text-gray-900">{formatTime(item.endTime)}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Loading Sequence:</span>
                      <p className="text-blue-600 font-bold">#{item.loadingSequence}</p>
                      <p className="text-xs text-gray-500">
                        {item.loadingSequence === 1 ? 'First to load, last to deliver' : 'Later loading position'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
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
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">Order ID: {item.orderId}</p>
                      <p className="text-sm text-gray-600 mt-1">Reason: {item.reason}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Installation Schedules */}
        {installationSchedules.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Users size={24} className="text-blue-600" />
              Installation Schedules ({installationSchedules.length})
            </h2>

            <div className="space-y-3">
              {installationSchedules.map((schedule, idx) => (
                <div
                  key={idx}
                  className="bg-blue-50 rounded-xl p-4 border-l-4 border-blue-500"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="font-semibold text-gray-700">Order ID:</span>
                      <p className="text-gray-900">{schedule.order_id}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Estimated Arrival:</span>
                      <p className="text-gray-900">{formatTime(schedule.estimated_arrival_time)}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Status:</span>
                      <p className={`font-medium ${
                        schedule.status === 'Scheduled' ? 'text-blue-600' :
                        schedule.status === 'Completed' ? 'text-green-600' :
                        'text-gray-600'
                      }`}>
                        {schedule.status}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && schedule.length === 0 && unscheduled.length === 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={40} className="text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Schedule Generated</h3>
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
