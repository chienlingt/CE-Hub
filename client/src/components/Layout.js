import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Home, Users, FileText, Menu, X, ChevronRight, User, Calendar, LogOut, AlertCircle, Truck, Scan,
  Shield
} from 'lucide-react';
import ProfileModal from './common/ProfileModal';
import NotificationBell from './common/NotificationBell';
import BottomNav from './layout/BottomNav';
import MobileNavDrawer from './layout/MobileNavDrawer';
import useIsMobile from '../hooks/useIsMobile';
import { isFieldMobileUser, partitionNavItems } from '../utils/navigationMode';
import FailureNotificationLog from './admin/FailureNotificationLog';
import NotificationSettings from './admin/NotificationSettings';
import DoAssignment from './admin/DoAssignment';
import SyncMonitor from './admin/SyncMonitor';
import ScanStation from './common/ScanStation';
import {
  // admin pages
  default as Overview,
} from './admin/dashboard/Overview';
import LiveDeliveries from './admin/liveOps/LiveDeliveries';
import EmployeeInfo from './admin/info/EmployeeInfo';
import BuildingInfo from './admin/info/BuildingInfo';
import ProductInfo from './admin/info/ProductInfo';
import TruckInfo from './admin/info/TruckInfo';
import TruckZoneInfo from './admin/info/TruckZoneInfo';
import TeamInfo from './admin/info/TeamInfo';
import Cases from './admin/Cases';
import OrderIssues from './admin/OrderIssues';
import ReportIssue from './employee/ReportIssue';
import IssueManagement from './admin/IssueManagement';
import ComplaintManagement from './admin/ComplaintManagement';
import Schedule from './admin/schedule/Schedule';
import EmployeePerformance from './admin/dashboard/EmployeePerformance';
import OrderPerformance from './admin/dashboard/OrderPerformance';
import RoleAccessControl from './admin/access/accessControl';
import AutoScheduleReview from './admin/schedule/AutoScheduleReview';
import DeliverySchedule from './delivery/DelSchedule';
import InstallationSchedule from './installer/InsSchedule';
import WarehouseLoadingSchedule from './warehouse/truckSchedule';
import PlaceOrder from './order/PlaceOrder';
import ManageOrders from './order/ManageOrders';
import DriverDashboard from './driver/DriverDashboard';
import DriverRoute from './driver/DriverRoute';
import CompletedDeliveries from './admin/CompletedDeliveries';
import DeliveryIssues from './admin/DeliveryIssues';

// Scan Station wrappers — stage locked by tab selection
const ScanStationLoading   = () => <ScanStation forcedStage="driver" />;
const ScanStationUnloading = () => <ScanStation forcedStage="unloading" />;
const ScanStationAudit     = () => <ScanStation forcedStage="audit" />;

/**
 * Layout
 * - Uses permissions from useAuth() to determine which side-nav sections to show
 * - If user lands on root ("/") or on a route the user is not allowed to view,
 *   redirect to the first allowed section and its first top tab.
 *
 * Key behaviors implemented to resolve "empty Layout" issue:
 * - Waits for permissions to finish loading (loadingPermissions from AuthContext).
 * - Computes filteredNavigation from navigationData and permissions.
 * - If user navigates to "/" or to a route not allowed, automatically navigates to the first allowed route/topTab.
 * - If user has no allowed sections, shows a clear "No access" message instead of empty UI.
 */

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout, permissions, employeeData, loadingPermissions, loading } = useAuth();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState('');
  const [topNavActive, setTopNavActive] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  const isMobile = useIsMobile();

  // ==========================
  // Navigation structure
  // ==========================
  const navigationData = {
    dashboard: {
      title: 'Dashboard',
      icon: Home,
      route: '/dashboard',
      topNavItems: [
        { id: 'overview',              label: 'Overview',            path: '',                    component: Overview          },
        { id: 'live-ops',              label: 'Live Deliveries',     path: 'live-ops',            component: LiveDeliveries    },
        { id: 'employee-performance',  label: 'Employee Performance', path: 'employee-performance', component: EmployeePerformance },
        { id: 'orders',                label: 'Orders',              path: 'order',               component: OrderPerformance  },
      ],
    },
    driver: {
      title: 'Driver Dashboard',
      icon: Truck,
      route: '/driver',
      topNavItems: [
        { id: 'driver', label: 'My Jobs', path: '', component: DriverDashboard },
        { id: 'route',  label: 'Route',   path: 'route', component: DriverRoute },
      ],
    },
    schedule: {
      title: 'Schedule',
      icon: Calendar,
      route: '/schedule',
      topNavItems: [
        { id: 'schedule', label: 'Schedule', path: '', component: Schedule },
        { id: 'auto-scheduler', label: 'Auto Scheduler', path: 'auto-scheduler', component: AutoScheduleReview },
      ],
    },
    info: {
      title: 'Information',
      icon: FileText,
      route: '/info',
      topNavItems: [
        { id: 'employee', label: 'Employee', path: '', component: EmployeeInfo },
        { id: 'team', label: 'Team', path: 'team', component: TeamInfo },
        { id: 'building', label: 'Building', path: 'building', component: BuildingInfo },
        // { id: 'product', label: 'Product', path: 'product', component: ProductInfo }, // removed — products are not stored in CE Hub
        { id: 'truck', label: 'Truck', path: 'truck', component: TruckInfo },
        // { id: 'truckzone', label: 'TruckZone', path: 'truckzone', component: TruckZoneInfo },
      ],
    },
    cases: {
      title: 'Cases',
      icon: AlertCircle,
      route: '/cases',
      topNavItems: [
        { id: 'reports',              label: 'Reports',               path: '',                    component: Cases               },
        { id: 'order-issues',         label: 'Order Issues',          path: 'order-issues',        component: IssueManagement     },
        { id: 'delivery-issues',      label: 'Delivery Issues',       path: 'delivery-issues',     component: DeliveryIssues      },
        { id: 'sync-monitor',         label: 'Sync Monitor',          path: 'sync-monitor',        component: SyncMonitor         },
        { id: 'completed-deliveries', label: 'Completed Deliveries',  path: 'completed-deliveries', component: CompletedDeliveries },
      ],
    },
    access: {
      title: 'Access Control',
      icon: Shield,
      route: '/access',
      topNavItems: [
        { id: 'access', label: 'Access Control', path: '', component: RoleAccessControl },
      ],
    },
    delivery: {
      title: 'Delivery Schedule',
      icon: Users,
      route: '/delivery',
      topNavItems: [
        { id: 'delivery', label: 'Delivery Schedule', path: '', component: DeliverySchedule },
      ],
    },
    // Hidden from sidebar — kept for easy re-enable.
    // installation: {
    //   title: 'Installation Schedule',
    //   icon: Users,
    //   route: '/installation',
    //   topNavItems: [
    //     { id: 'installation', label: 'Installation Schedule', path: '', component: InstallationSchedule },
    //   ],
    // },
    // warehouse: {
    //   title: 'Warehouse Schedule',
    //   icon: Users,
    //   route: '/warehouse',
    //   topNavItems: [
    //     { id: 'warehouse', label: 'Warehouse Schedule', path: '', component: WarehouseLoadingSchedule },
    //   ],
    // },
    customer: {
      title: 'Order Management',
      icon: Users,
      route: '/customer',
      topNavItems: [
        { id: 'place-order',   label: 'Place Order',    path: '',               component: PlaceOrder },
        { id: 'manage-orders', label: 'Manage Orders',  path: 'manage-orders',  component: ManageOrders },
      ],
    },
    scanning: {
      title: 'Scan Station',
      icon: Scan,
      route: '/scanning',
      topNavItems: [
        { id: 'loading',   label: 'Loading',   path: 'loading',   component: ScanStationLoading,   allowedRoles: ['admin', 'delivery', 'driver', 'warehouse', 'storekeeper'] },
        { id: 'unloading', label: 'Unloading', path: 'unloading', component: ScanStationUnloading, allowedRoles: ['admin', 'delivery', 'driver', 'warehouse', 'storekeeper'] },
        { id: 'audit',     label: 'Audit',     path: 'audit',     component: ScanStationAudit,     allowedRoles: ['admin'] },
      ],
    },
    settings: {
      title: 'Settings',
      icon: AlertCircle,
      route: '/settings',
      topNavItems: [
        { id: 'notifications', label: 'Notifications', path: '', component: NotificationSettings },
      ],
    },
  }

  // normalize helper
  const normalize = (s) => (s || '').toString().toLowerCase().trim();

  // Determine effective permissions array from AuthContext
  const effectivePermissions = useMemo(() => Array.isArray(permissions) ? permissions.map(p => normalize(p)) : [], [permissions]);
  // Debug: print current user's permissions once they are loaded
  useEffect(() => {
  }, [permissions, effectivePermissions, employeeData, loadingPermissions]);

  useEffect(() => {
    setDisplayName(currentUser?.name || currentUser?.email || 'User');
  }, [currentUser]);

  // Filter navigation based on permissions. Admin gets full access.
  const filteredNavigation = useMemo(() => {
    // role can be a string or an object { name, id, permissions }
    const rawRole = typeof employeeData?.role === 'object'
      ? employeeData?.role?.name || ''
      : employeeData?.role || '';
    const role = normalize(rawRole);
    if (role === 'admin' || effectivePermissions.includes('admin')) {
      return Object.entries(navigationData);
    }
    if (loadingPermissions) return [];
    if (effectivePermissions.length === 0) return [];
    // include entry if its key is in permissions (permission keys must match nav keys)
    return Object.entries(navigationData).filter(([key]) => effectivePermissions.includes(key));
  }, [employeeData, effectivePermissions, loadingPermissions]);

  // Make a quick list of allowed routes (e.g., ['/dashboard', '/info', ...]) for routing checks
  const allowedRoutes = useMemo(() => filteredNavigation.map(([, item]) => item.route), [filteredNavigation]);

  const useBottomNav = isMobile && isFieldMobileUser(effectivePermissions);
  const useDrawer = isMobile && !useBottomNav;
  const { primary: primaryNavItems, overflow: overflowNavItems } = useMemo(
    () => partitionNavItems(filteredNavigation),
    [filteredNavigation]
  );
  const overflowActive = overflowNavItems.some(([key]) => key === activeSection);

  // Helper: get route root from a pathname, e.g. '/dashboard/overview' -> '/dashboard'
  const getPathRoot = (pathname) => {
    if (!pathname) return '/';
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return '/';
    return `/${parts[0]}`;
  };

  // When permissions finish loading or location changes, ensure we navigate to a permitted section:
  useEffect(() => {
    // don't act until auth restore finished (AuthProvider ensures children render after restore),
    // and wait for permissions to be loaded.
    if (loadingPermissions) return;

    // If user has no permitted navigation, do nothing (we'll show a no-access message)
    if (!filteredNavigation || filteredNavigation.length === 0) {
      setActiveSection('');
      setTopNavActive('');
      return;
    }

    const currentRoot = getPathRoot(location.pathname);

    // Allow access to /reports for all users (no permission check)
    if (currentRoot === '/reports') {
      setActiveSection('');
      setTopNavActive('');
      return;
    }

    // If user is at root path "/", navigate to first allowed section's first top tab
    if (currentRoot === '/' || currentRoot === '') {
      const [firstKey, firstSection] = filteredNavigation[0];
      setActiveSection(firstKey);
      const firstTop = firstSection.topNavItems?.[0];
      setTopNavActive(firstTop?.id || '');
      // navigate to the section's first top route
      const targetPath = firstTop ? `${firstSection.route}/${firstTop.path}` : firstSection.route;
      navigate(targetPath, { replace: true });
      return;
    }

    // If current root isn't in allowedRoutes, redirect to first allowed
    if (!allowedRoutes.includes(currentRoot)) {
      const [firstKey, firstSection] = filteredNavigation[0];
      setActiveSection(firstKey);
      const firstTop = firstSection.topNavItems?.[0];
      setTopNavActive(firstTop?.id || '');
      const targetPath = firstTop ? `${firstSection.route}/${firstTop.path}` : firstSection.route;
      navigate(targetPath, { replace: true });
      return;
    }

    // Otherwise set activeSection based on current root
    const matched = filteredNavigation.find(([key, item]) => item.route === currentRoot);
    if (matched) {
      setActiveSection(matched[0]);
      // attempt to infer topNavActive from pathname
      const pathParts = location.pathname.split('/').filter(Boolean);
      const last = pathParts[pathParts.length - 1] || '';
      const topItem = matched[1].topNavItems?.find(t => t.path === last || t.id === last);
      setTopNavActive(topItem?.id || matched[1].topNavItems?.[0]?.id || '');
    }
  }, [loadingPermissions, filteredNavigation, location.pathname, navigate, allowedRoutes]);

  const handleSideNavClick = (sectionKey) => {
    const section = navigationData[sectionKey];
    if (!section) return;
    setActiveSection(sectionKey);
    const firstItem = section.topNavItems?.[0];
    setTopNavActive(firstItem?.id || '');
    const target = firstItem ? `${section.route}/${firstItem.path}` : section.route;
    navigate(target);
    setMobileDrawerOpen(false);
    setMoreDrawerOpen(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const openProfileModal = () => setShowProfileModal(true);

  const handleProfileSaved = (payload) => {
    setDisplayName(payload.name || payload.email || 'User');
    const stored = sessionStorage.getItem('employeeData');
    if (stored) {
      const parsed = JSON.parse(stored);
      sessionStorage.setItem('employeeData', JSON.stringify({ ...parsed, ...payload }));
      sessionStorage.setItem('employeeName', payload.name || parsed.name || '');
      sessionStorage.setItem('employeeEmail', payload.email || parsed.email || '');
    }
  };

  // Loading and no access states
  if (loading || loadingPermissions) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!filteredNavigation || filteredNavigation.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="max-w-lg text-center p-6 bg-white rounded shadow">
          <h2 className="text-lg font-semibold mb-2">No access</h2>
          <p className="text-sm text-gray-600 mb-4">You don't have access to any sections. Contact an administrator to grant access.</p>
          <button onClick={handleLogout} className="px-4 py-2 bg-blue-600 text-white rounded">Logout</button>
        </div>
      </div>
    );
  }

  const currentSection = navigationData[activeSection] || filteredNavigation[0][1];
  const showTopTabs = currentSection?.topNavItems && (
    !useBottomNav || currentSection.topNavItems.length > 1
  );

  const headerActions = (
    <>
      <button
        onClick={() => navigate('/reports')}
        className="flex items-center space-x-2 p-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="Report Issues"
      >
        <AlertCircle size={20} />
        {!useBottomNav && <span className="hidden md:block font-medium">Report Issue</span>}
      </button>
      <NotificationBell userId={employeeData?.id} />
      <button
        type="button"
        onClick={openProfileModal}
        className="flex items-center space-x-2 p-2 text-gray-700 rounded-lg hover:text-blue-600 hover:bg-blue-50"
        title="View profile"
      >
        <User size={20} />
        {!useBottomNav && <span className="hidden md:block font-medium">{displayName}</span>}
      </button>
      <button
        onClick={handleLogout}
        className="flex items-center space-x-2 p-2 text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        title="Logout"
      >
        <LogOut size={20} />
        {!useBottomNav && <span className="hidden lg:block font-medium">Logout</span>}
      </button>
    </>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <div className={`hidden sm:flex ${isSidebarOpen ? 'w-64' : 'w-16'} bg-white shadow-lg transition-all duration-300 ease-in-out border-r border-gray-200 flex-col`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          {isSidebarOpen && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">CE</span>
              </div>
              <span className="text-xl font-bold text-gray-800 truncate">CE Hub</span>
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(prev => !prev)} className="p-2 rounded-lg hover:bg-gray-100">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-6">
          <div className="space-y-2">
            {filteredNavigation.map(([key, item]) => {
              const IconComponent = item.icon;
              const isActive = activeSection === key;
              return (
                <button
                  key={key}
                  onClick={() => handleSideNavClick(key)}
                  className={`w-full flex items-center px-3 py-3 rounded-lg transition-all duration-200 group ${isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                >
                  <IconComponent size={20} className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-blue-600'}`} />
                  {isSidebarOpen && (
                    <>
                      <span className="ml-3 font-medium truncate">{item.title}</span>
                      <ChevronRight
                        size={16}
                        className={`ml-auto flex-shrink-0 transition-transform ${isActive ? 'rotate-90 text-white' : 'text-gray-400 group-hover:text-blue-600'}`}
                      />
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          {useBottomNav ? (
            <div className="flex items-center justify-end px-4 py-3 border-b border-gray-100">
              <div className="flex items-center space-x-2">{headerActions}</div>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                {useDrawer && (
                  <button
                    type="button"
                    onClick={() => setMobileDrawerOpen(true)}
                    className="p-2 rounded-lg hover:bg-gray-100 flex-shrink-0"
                    aria-label="Open menu"
                  >
                    <Menu size={20} />
                  </button>
                )}
                <h1 className="text-lg sm:text-xl font-bold text-gray-800 truncate">
                  {currentSection?.title || 'TBMDelivery'}
                </h1>
              </div>
              <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">{headerActions}</div>
            </div>
          )}

          {/* Top Tabs */}
          {showTopTabs && (
            <div className="max-w-7xl px-4 sm:px-6 lg:px-8 mt-2">
              <div className="border-b border-gray-200 overflow-x-auto scrollbar-hide">
                <nav className="-mb-px flex space-x-8 min-w-max">
                  {currentSection.topNavItems.filter(tab => {
                    if (!tab.allowedRoles) return true;
                    const rawRole = typeof employeeData?.role === 'object'
                      ? employeeData?.role?.name || '' : employeeData?.role || '';
                    const role = (rawRole || '').toString().toLowerCase();
                    return tab.allowedRoles.some(r => role.includes(r)) || role.includes('admin');
                  }).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setTopNavActive(tab.id);
                        navigate(`${currentSection.route}/${tab.path}`);
                      }}
                      className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 whitespace-nowrap ${topNavActive === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-auto p-2 ${useBottomNav ? 'pb-[calc(4rem+env(safe-area-inset-bottom))]' : ''}`}>
          <Routes>
            {/* Standalone route for Report Issue (accessible to all employees) */}
            <Route path="/reports" element={<ReportIssue />} />

            {/*
              Add redirect routes for each section's base path to its first top child path, plus all top child routes
            */}
            {Object.entries(navigationData).map(([sectionKey, section]) => {
              const firstTop = section.topNavItems && section.topNavItems[0];
              const target = firstTop ? `${section.route}/${firstTop.path}` : section.route;
              return (
                <Route
                  key={`redirect-${section.route}`}
                  path={section.route}
                  element={<Navigate to={target} replace />}
                />
              );
            })}

            {Object.entries(navigationData).flatMap(([sectionKey, section]) =>
              section.topNavItems.map((item) =>
                item.component ? (
                  <Route
                    key={`${section.route}/${item.path}`}
                    path={`${section.route}/${item.path}`}
                    element={<item.component />}
                  />
                ) : null
              )
            )}

            {/* default route: if user navigates to root, the useEffect above will redirect, but keep a fallback */}
            <Route path="/" element={<Navigate to={filteredNavigation[0][1].route + '/' + (filteredNavigation[0][1].topNavItems?.[0]?.path || '')} replace />} />
          </Routes>
        </div>

        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          employeeData={employeeData}
          currentUser={currentUser}
          onProfileSaved={handleProfileSaved}
        />
      </div>

      {useBottomNav && (
        <BottomNav
          primaryItems={primaryNavItems}
          activeSection={activeSection}
          overflowActive={overflowActive}
          hasOverflow={overflowNavItems.length > 0}
          onNavClick={handleSideNavClick}
          onMoreClick={() => setMoreDrawerOpen(true)}
        />
      )}

      <MobileNavDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        items={filteredNavigation}
        activeSection={activeSection}
        onSelect={handleSideNavClick}
        title="Menu"
      />

      <MobileNavDrawer
        isOpen={moreDrawerOpen}
        onClose={() => setMoreDrawerOpen(false)}
        items={overflowNavItems}
        activeSection={activeSection}
        onSelect={handleSideNavClick}
        title="More"
      />
    </div>
  );
};

export default Layout;
