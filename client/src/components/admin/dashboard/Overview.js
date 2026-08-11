import React, { useEffect, useState, useRef } from 'react';
import ScopeMonthSelector from '../../common/ScopeMonthSelector';
import ActiveTripsPanel from './ActiveTripsPanel';
import {
  getAllEmployees, getAllOrdersSummary, getAllCases
} from '../../../services/informationService';
import {
  Users, Star, CheckCircle, AlertCircle, TrendingUp, TrendingDown,
  Activity, Clock, Package, Calendar, BarChart3, PieChart, Download
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

// Stat card for main metrics
const StatCard = ({ title, value, icon: Icon, color = 'blue', subtitle, trend, trendValue }) => (
  <div
    className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all`}
  >
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className={`text-3xl font-bold text-${color}-600 mt-2`}>{value}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        {trend && (
          <div className="flex items-center mt-2">
            {trendValue >= 0 ? (
              <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
            )}
            <span className={`text-xs font-medium ${trendValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend}
            </span>
          </div>
        )}
      </div>
      <div className={`p-3 bg-${color}-50 rounded-lg`}>
        <Icon className={`h-8 w-8 text-${color}-600`} />
      </div>
    </div>
  </div>
);

// Activity feed item
const ActivityItem = ({ icon: Icon, title, description, time, status, deliveredDate, priority = 'normal' }) => (
  <div className="flex items-start space-x-3 p-4 hover:bg-gray-50 rounded-lg transition-colors">
    <div className={`p-2 rounded-lg ${
      priority === 'high' ? 'bg-red-50' : priority === 'medium' ? 'bg-yellow-50' : 'bg-blue-50'
    }`}>
      <Icon className={`h-4 w-4 ${
        priority === 'high' ? 'text-red-600' : priority === 'medium' ? 'text-yellow-600' : 'text-blue-600'
      }`} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900 text-sm">{title}</p>
      <p className="text-gray-600 text-xs mt-1 truncate">{description}</p>
      <div className="flex items-center justify-between mt-2">
        {deliveredDate &&
          <p className="text-xs text-gray-500">
            Delivered: {deliveredDate}
          </p>
        }
        {status && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            status === 'resolved' || status === 'Completed' || status === 'Delivered'
              ? 'bg-green-100 text-green-800'
              : status === 'pending' || status === 'Pending'
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {status}
          </span>
        )}
      </div>
    </div>
  </div>
);

// Chart wrapper component
const ChartCard = ({ title, children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${className}`}>
    <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
    <div className="h-80">
      {children}
    </div>
  </div>
);

export default function Overview() {
  const [employees, setEmployees] = useState([]);
  const [orders, setOrders] = useState([]);
  const [reports, setReports] = useState([]);
  const [scope, setScope] = useState('month');

  // selected month state (focus month). Defaults to current month.
  const [selectedMonthDate, setSelectedMonthDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const containerRef = useRef(null);

  useEffect(() => {
    getAllEmployees().then(data => {
      // console.log('[Dashboard] Employees fetched:', data);
      setEmployees(data);
    }).catch(err => console.warn('[Dashboard] Error fetching employees:', err));

    getAllOrdersSummary().then(data => {
      // console.log('[Dashboard] Orders fetched:', data);
      // console.log('[Dashboard] First order sample:', data[0]);
      setOrders(data);
    }).catch(err => console.warn('[Dashboard] Error fetching orders:', err));

    getAllCases().then(data => {
      // console.log('[Dashboard] Reports fetched:', data);
      setReports(data);
    }).catch(err => console.warn('[Dashboard] Error fetching reports:', err));
  }, []);

  const getOrderId = (order) => order.id;
  const getOrderRating = (order) => {
    const r = order.customer_rating ?? null;
    return (r === '' || r === null || typeof r === 'undefined') ? null : Number(r);
  };
  const getOrderFeedback = (order) => order.customer_feedback ?? '';
  const getOrderStatus = (order) => order.order_status ?? ''; 
  const getReportId = (r) => r.id;
  const getReportContent = (r) => r.content ?? '';
  const getReportStatus = (r) => r.status ?? '';

  const normalizeStatus = (status) => String(status || '').trim().toLowerCase();
  const isCompletedStatus = (status) => ['completed', 'delivered'].includes(normalizeStatus(status));
  const isPendingStatus = (status) => ['pending'].includes(normalizeStatus(status));

  // Order created date from schema field
  const getOrderCreatedDate = (order) => {
    if (!order) return null;
    const v = order.created_at;
    if (!v) return null;
    if (typeof v?.toDate === 'function') {
      const d = v.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    }
    if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) {
      const d = v instanceof Date ? v : new Date(v);
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    }
    return null;
  };

  const getOrderCompletionDate = (order) => {
    if (!order) return null;
    const candidate =
      order.install_end_date_time ||
      order.InstallEndDateTime ||
      order.delivery_end_date_time ||
      order.DeliveryEndDateTime ||
      order.actual_arrival_date_time;
    if (!candidate) return null;
    if (typeof candidate?.toDate === 'function') {
      const d = candidate.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    }
    if (typeof candidate === 'string' || typeof candidate === 'number' || candidate instanceof Date) {
      const d = candidate instanceof Date ? candidate : new Date(candidate);
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    }
    return null;
  };

  // Report created date from schema field
  const getReportDate = (r) => {
    if (!r) return null;
    const v = r.created_at;
    if (!v) return null;
    if (typeof v?.toDate === 'function') {
      const d = v.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    }
    if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) {
      const d = v instanceof Date ? v : new Date(v);
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    }
    return null;
  };

  const getOrderDeliveredDate = (order) => {
    const date = getOrderCompletionDate(order) || getOrderCreatedDate(order);
    return date ? formatDateDisplay(date) : '';
  };

  // Defensive date formatter
  function formatDateDisplay(dateInput) {
    if (!dateInput) return '';
    if (typeof dateInput?.toDate === "function") {
      const d = dateInput.toDate();
      return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    if (typeof dateInput === 'number' || (typeof dateInput === 'string' && /^\d+$/.test(dateInput))) {
      const d = new Date(Number(dateInput));
      return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    if (typeof dateInput === 'string') {
      const d = new Date(dateInput);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
      return dateInput;
    }
    if (dateInput instanceof Date) {
      return dateInput.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return String(dateInput);
  }

  // Helper to format selected month for header and file name
  function formatMonthYear(date) {
    if (!date) return '';
    try {
      return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return String(date);
    }
  }

  // === Month-scoped data: everything below is computed for the selected month ===

  // Selected month/year
  const now = selectedMonthDate;
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const scopeLabel = scope === 'all' ? 'All time' : 'Selected month';

  // Helper to filter orders by month/year safely (based on created date)
  const ordersInMonth = (month, year) => orders.filter(order => {
    const d = getOrderCreatedDate(order);
    if (!d) return false;
    return d.getMonth() === month && d.getFullYear() === year;
  });

  // Orders for selected month and previous month
  const currentMonthOrders = ordersInMonth(currentMonth, currentYear);
  const lastMonthOrders = ordersInMonth(lastMonth, lastMonthYear);

  const scopedOrders = scope === 'all' ? orders : currentMonthOrders;

  // Ratings and averages for the selected scope
  const scopedRatings = scopedOrders.map(o => getOrderRating(o)).filter(r => typeof r === 'number' && !isNaN(r));
  const avgRating = scopedRatings.length > 0
    ? (scopedRatings.reduce((s, r) => s + r, 0) / scopedRatings.length)
    : 0;

  // Completed / pending counts
  const currentMonthCompleted = currentMonthOrders.filter(order => isCompletedStatus(getOrderStatus(order))).length;
  const currentMonthPending = currentMonthOrders.filter(order => isPendingStatus(getOrderStatus(order))).length;
  const scopedCompleted = scope === 'all'
    ? orders.filter(order => isCompletedStatus(getOrderStatus(order))).length
    : currentMonthCompleted;
  const scopedPending = scope === 'all'
    ? orders.filter(order => isPendingStatus(getOrderStatus(order))).length
    : currentMonthPending;

  // Helper to get employee ID from order
  const getEmployeeId = (order) => order.employee_id;

  // Reports filtered by selected month
  const reportsInMonth = reports.filter(r => {
    const d = getReportDate(r);
    if (!d) return false;
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const scopedReports = scope === 'all' ? reports : reportsInMonth;
  const pendingReports = scopedReports.filter(r => normalizeStatus(getReportStatus(r)) === 'pending').length;

  // Trends comparing this month vs last month
  const currentMonthCompletedForTrend = currentMonthCompleted;
  const lastMonthCompletedForTrend = lastMonthOrders.filter(order => isCompletedStatus(getOrderStatus(order))).length;

  const currentMonthAvgRating = avgRating;
  const lastMonthRatings = lastMonthOrders.map(o => getOrderRating(o)).filter(r => typeof r === 'number' && !isNaN(r));
  const lastMonthAvgRating = lastMonthRatings.length > 0
    ? (lastMonthRatings.reduce((s, r) => s + r, 0) / lastMonthRatings.length)
    : 0;

  const ordersTrend = scope === 'all'
    ? null
    : (lastMonthCompletedForTrend > 0
      ? ((currentMonthCompletedForTrend - lastMonthCompletedForTrend) / lastMonthCompletedForTrend * 100)
      : (currentMonthCompletedForTrend > 0 ? 100 : 0));

  const ratingTrend = scope === 'all'
    ? null
    : (lastMonthAvgRating > 0
      ? ((currentMonthAvgRating - lastMonthAvgRating) / lastMonthAvgRating * 100)
      : (currentMonthAvgRating > 0 ? 100 : 0));

  const employeesTrend = scope === 'all' ? null : 0; // could be computed from hires in month if you have hire dates
  const reportsTrend = scope === 'all' ? null : 0; // optional

  // Prepare chart data (12 months ending at selected month)
  const monthLabels = [];
  const totalOrdersData = [];
  const completedOrdersData = [];
  const pendingOrdersData = [];

  for (let i = 11; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - i, 1);
    const month = date.getMonth();
    const year = date.getFullYear();
    const monthOrders = ordersInMonth(month, year);

    const completed = monthOrders.filter(order => isCompletedStatus(getOrderStatus(order))).length;
    const pending = monthOrders.filter(order => isPendingStatus(getOrderStatus(order))).length;

    monthLabels.push(date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
    totalOrdersData.push(monthOrders.length);
    completedOrdersData.push(completed);
    pendingOrdersData.push(pending);
  }

  // Order status distribution for selected month
  const statusData = {
    labels: ['Delivered', 'Pending', 'Other'],
    datasets: [{
      data: [
        scopedCompleted,
        scopedPending,
        Math.max(0, scopedOrders.length - scopedCompleted - scopedPending)
      ],
      backgroundColor: [
        '#10B981',
        '#F59E0B',
        '#6B7280'
      ],
      borderWidth: 0,
    }]
  };

  // Rating distribution for selected month
  const ratingLabels = ['1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'];
  const ratingCounts = [1, 2, 3, 4, 5].map(rating =>
    scopedOrders.filter(order => {
      const val = getOrderRating(order);
      return val !== null && Math.floor(Number(val)) === rating;
    }).length
  );

  const ratingData = {
    labels: ratingLabels,
    datasets: [{
      label: 'Number of Orders',
      data: ratingCounts,
      backgroundColor: '#F59E0B',
      borderColor: '#D97706',
      borderWidth: 1,
      borderRadius: 4,
    }]
  };

  // Monthly orders trend data (12 months)
  const monthlyOrdersTrendData = {
    labels: monthLabels,
    datasets: [
      {
        label: 'Delivered',
        data: completedOrdersData,
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderColor: '#10B981',
        borderWidth: 1,
      },
      {
        label: 'Pending',
        data: pendingOrdersData,
        backgroundColor: 'rgba(245, 158, 11, 0.8)',
        borderColor: '#F59E0B',
        borderWidth: 1,
      }
    ]
  };

  // Chart options (remain unchanged)
  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: { display: true, grid: { display: false } },
      y: { display: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.1)' } },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    scales: {
      x: { display: true, grid: { display: false } },
      y: { display: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.1)' } },
    },
  };

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: function (context) {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total === 0 ? 0 : ((context.parsed * 100) / total).toFixed(1);
            return `${context.label}: ${context.parsed} (${percentage}%)`;
          }
        }
      }
    },
  };

  // Recent completed orders and reports: restricted to the selected month
  const recentCompletedOrders = scopedOrders
    .filter(order => isCompletedStatus(getOrderStatus(order)))
    .sort((a, b) => {
      const da = getOrderCompletionDate(a) ? getOrderCompletionDate(a).getTime() : 0;
      const db = getOrderCompletionDate(b) ? getOrderCompletionDate(b).getTime() : 0;
      return db - da;
    })
    .slice(0, 5);

  const recentReports = scopedReports
    .slice()
    .sort((a, b) => {
      const da = getReportDate(a) ? getReportDate(a).getTime() : 0;
      const db = getReportDate(b) ? getReportDate(b).getTime() : 0;
      return db - da;
    })
    .slice(0, 5);

  // Month navigation handlers
  const prevMonth = () => setSelectedMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setSelectedMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  // Export to PDF handler (unchanged)
  const exportToPdf = async () => {
    if (!containerRef.current) return;
    try {
      const element = containerRef.current;
      const originalBackground = element.style.backgroundColor;
      element.style.backgroundColor = '#ffffff';

      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      if (pdfHeight <= pdf.internal.pageSize.getHeight()) {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      } else {
        const pageHeight = pdf.internal.pageSize.getHeight();
        const totalPages = Math.ceil(pdfHeight / pageHeight);
        for (let i = 0; i < totalPages; i++) {
          const y = -(i * pageHeight * (imgProps.width / pdfWidth));
          if (i > 0) pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, y, pdfWidth, pdfHeight);
        }
      }

      const fileName = `dashboard-${formatMonthYear(selectedMonthDate).replace(/\s+/g, '_')}.pdf`;
      pdf.save(fileName);

      element.style.backgroundColor = originalBackground;
    } catch (err) {
      console.error('Export to PDF failed', err);
    }
  };

  return (
    <div>
      {/* Header with month navigation and export button */}
      <div className="flex items-center justify-between mb-6">
        <ScopeMonthSelector
          scope={scope}
          onScopeChange={setScope}
          selectedMonthDate={selectedMonthDate}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          formatMonthYear={formatMonthYear}
        />

        <div className="flex items-center space-x-3">
          <button
            onClick={exportToPdf}
            className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-md shadow hover:bg-emerald-700"
            title="Export dashboard as PDF"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Dashboard content wrapped in ref to capture for PDF */}
      <div className="space-y-6" ref={containerRef}>
        {/* A.3.7a: Live active trips panel */}
        <ActiveTripsPanel />

        {/* Key Metrics (all based on selected month) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <StatCard
            title="Completed Orders"
            value={scopedCompleted}
            icon={CheckCircle}
            color="green"
            subtitle={`${scopedPending} pending (${scopeLabel.toLowerCase()})`}
            trend={ordersTrend !== null ? `${ordersTrend >= 0 ? '+' : ''}${ordersTrend.toFixed(1)}%` : null}
            trendValue={ordersTrend ?? 0}
          />
          <StatCard
            title="Average Rating"
            value={avgRating > 0 ? avgRating.toFixed(1) : 'N/A'}
            icon={Star}
            color="yellow"
            subtitle={`${scopeLabel} customer ratings`}
            trend={ratingTrend !== null ? `${ratingTrend >= 0 ? '+' : ''}${ratingTrend.toFixed(1)}%` : null}
            trendValue={ratingTrend ?? 0}
          />
          <StatCard
            title="Pending Reports"
            value={pendingReports}
            icon={AlertCircle}
            color="red"
            subtitle="Requires attention"
            trend={reportsTrend !== null ? `${reportsTrend >= 0 ? '+' : ''}${reportsTrend}%` : null}
            trendValue={reportsTrend ?? 0}
          />
          <StatCard
            title="Total Orders"
            value={scopedOrders.length}
            icon={Package}
            color="purple"
            subtitle={scopeLabel}
          />
          <StatCard
            title="Delivery Success Rate"
            value={`${scopedOrders.length > 0 ? Math.round((scopedCompleted / scopedOrders.length) * 100) : 0}%`}
            icon={TrendingUp}
            color="emerald"
            subtitle={`Successful deliveries (${scopeLabel.toLowerCase()})`}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Orders Trend (12 months ending at selected month) */}
          <ChartCard title="Monthly Orders Trend">
            <Bar data={monthlyOrdersTrendData} options={barChartOptions} />
          </ChartCard>

          {/* Order Status Distribution (selected scope) */}
          <ChartCard title={`Order Status Distribution (${scopeLabel.toLowerCase()})`}>
            <Doughnut data={statusData} options={pieChartOptions} />
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Customer Rating Distribution (selected scope) */}
          <ChartCard title={`Customer Rating Distribution (${scopeLabel.toLowerCase()})`}>
            <Bar data={ratingData} options={barChartOptions} />
          </ChartCard>

          {/* placeholder - can show another month-scoped chart */}
          <ChartCard title="Activity Overview (last 6 months)">
            <Line data={{
              labels: monthLabels.slice().reverse().slice(0, 6).reverse(), // small spark for last 6 months
              datasets: [{
                label: 'Completed (last 6 months)',
                data: completedOrdersData.slice(-6),
                borderColor: '#10B981',
                backgroundColor: 'rgba(16,185,129,0.08)',
                tension: 0.3
              }]
            }} options={lineChartOptions} />
          </ChartCard>
        </div>

        {/* Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Recent Completed Orders ({scopeLabel.toLowerCase()})</h3>
              <div className="flex items-center text-sm text-gray-500">
                <Clock className="h-4 w-4 mr-1" />
                Last 5 delivered
              </div>
            </div>

            <div className="space-y-2">
              {recentCompletedOrders.length > 0 ? recentCompletedOrders.map((order) => (
                <ActivityItem
                  key={getOrderId(order)}
                  icon={Package}
                  title={`Order ${order.odoo_order_ref || 'Not Synced'}`}
                  description={getOrderFeedback(order) || 'No feedback provided'}
                  status={getOrderStatus(order)}
                  deliveredDate={getOrderDeliveredDate(order)}
                  priority="normal"
                />
              )) : (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No completed orders</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Reports ({scopeLabel.toLowerCase()})</h3>
              <div className="flex items-center text-sm text-gray-500">
                <AlertCircle className="h-4 w-4 mr-1" />
                {pendingReports} pending
              </div>
            </div>

            <div className="space-y-2">
              {recentReports.length > 0 ? recentReports.map((r) => (
                <ActivityItem
                  key={getReportId(r)}
                  icon={AlertCircle}
                  title={`Report ${getReportId(r)}`}
                  description={getReportContent(r) || 'System report'}
                  status={getReportStatus(r)}
                  priority={normalizeStatus(getReportStatus(r)) === 'pending' ? 'high' : 'normal'}
                />
              )) : (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No reports</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
