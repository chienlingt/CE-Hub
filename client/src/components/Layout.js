import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Home, Users, FileText, Menu, X, ChevronRight, User, Calendar, LogOut, AlertCircle
} from 'lucide-react';
import {
  // admin pages
  default as Overview,
} from './admin/dashboard/Overview';
import EmployeeInfo from './admin/info/EmployeeInfo';
import BuildingInfo from './admin/info/BuildingInfo';
import ProductInfo from './admin/info/ProductInfo';
import TruckInfo from './admin/info/TruckInfo';
import TruckZoneInfo from './admin/info/TruckZoneInfo';
import TeamInfo from './admin/info/TeamInfo';
import Cases from './admin/Cases';
import ReportIssue from './employee/ReportIssue';
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

  // ==========================
  // Navigation structure
  // ==========================
  const navigationData = {
    dashboard: {
      title: 'Dashboard',
      icon: Home,
      route: '/dashboard',
      topNavItems: [
        { id: 'overview', label: 'Overview', path: 'overview', component: Overview },
        { id: 'employee-performance', label: 'Employee Performance', path: 'employee-performance', component: EmployeePerformance },
        { id: 'orders', label: 'Orders', path: 'order', component: OrderPerformance },
      ],
    },
    schedule: {
      title: 'Schedule',
      icon: Calendar,
      route: '/schedule',
      topNavItems: [
        { id: 'schedule', label: 'Schedule', path: 'schedule', component: Schedule },
        { id: 'auto-scheduler', label: 'Auto Scheduler', path: 'auto-scheduler', component: AutoScheduleReview },
      ],
    },
    info: {
      title: 'Information',
      icon: FileText,
      route: '/info',
      topNavItems: [
        { id: 'employee', label: 'Employee', path: 'employee', component: EmployeeInfo },
        { id: 'team', label: 'Team', path: 'team', component: TeamInfo },
        { id: 'building', label: 'Building', path: 'building', component: BuildingInfo },
        { id: 'product', label: 'Product', path: 'product', component: ProductInfo },
        { id: 'truck', label: 'Truck', path: 'truck', component: TruckInfo },
        { id: 'truckzone', label: 'TruckZone', path: 'truckzone', component: TruckZoneInfo },
      ],
    },
    cases: {
      title: 'Cases',
      icon: Users,
      route: '/cases',
      topNavItems: [
        { id: 'cases', label: 'Cases', path: 'cases', component: Cases },
      ],
    },
    access: {
      title: 'Access Control',
      icon: Users,
      route: '/access',
      topNavItems: [
        { id: 'access', label: 'Access Control', path: 'access', component: RoleAccessControl },
      ],
    },
    delivery: {
      title: 'Delivery Schedule',
      icon: Users,
      route: '/delivery',
      topNavItems: [
        { id: 'delivery', label: 'Delivery Schedule', path: 'delivery', component: DeliverySchedule },
      ],
    },
    installation: {
      title: 'Installation Schedule',
      icon: Users,
      route: '/installation',
      topNavItems: [
        { id: 'installation', label: 'Installation Schedule', path: 'installation', component: InstallationSchedule },
      ],
    },
    warehouse: {
      title: 'Warehouse Schedule',
      icon: Users,
      route: '/warehouse',
      topNavItems: [
        { id: 'warehouse', label: 'Warehouse Schedule', path: 'warehouse', component: WarehouseLoadingSchedule },
      ],
    },
    customer: {
      title: 'Order Management',
      icon: Users,
      route: '/customer',
      topNavItems: [
        { id: 'place-order', label: 'Place Order', path: 'place-order', component: PlaceOrder },
        { id: 'manage-orders', label: 'Manage Orders', path: 'manage-orders', component: ManageOrders },
      ],
    }
  }

  // normalize helper
  const normalize = (s) => (s || '').toString().toLowerCase().trim();

  // Determine effective permissions array from AuthContext
  const effectivePermissions = useMemo(() => Array.isArray(permissions) ? permissions.map(p => normalize(p)) : [], [permissions]);
  // Debug: print current user's permissions once they are loaded
  useEffect(() => {
  }, [permissions, effectivePermissions, employeeData, loadingPermissions]);

  // Filter navigation based on permissions. Admin gets full access.
  const filteredNavigation = useMemo(() => {
    const role = normalize(employeeData?.role || '');
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

    // Allow access to /cases for all users (no permission check)
    if (currentRoot === '/cases') {
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
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed', error);
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-16'} bg-white shadow-lg transition-all duration-300 ease-in-out border-r border-gray-200 flex flex-col`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          {isSidebarOpen && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <span className="text-xl font-bold text-gray-800 truncate">TBMDelivery</span>
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h1 className="text-xl font-bold text-gray-800 truncate">{currentSection?.title || 'TBMDelivery'}</h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/cases')}
                className="flex items-center space-x-2 px-3 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Report Issues"
              >
                <AlertCircle size={20} />
                <span className="hidden md:block font-medium">Report Issue</span>
              </button>
              <div className="flex items-center space-x-2 p-2 text-gray-700 rounded-lg">
                <User size={20} />
                <span className="hidden md:block font-medium">{currentUser?.name || currentUser?.email || 'User'}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 p-2 text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut size={20} />
                <span className="hidden lg:block font-medium">Logout</span>
              </button>
            </div>
          </div>

          {/* Top Tabs */}
          {currentSection?.topNavItems && (
            <div className="max-w-7xl px-4 sm:px-6 lg:px-8 mt-2">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  {currentSection.topNavItems.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setTopNavActive(tab.id);
                        navigate(`${currentSection.route}/${tab.path}`);
                      }}
                      className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${topNavActive === tab.id
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
        <div className="flex-1 overflow-auto p-2">
          <Routes>
            {/* Standalone route for Report Issue (accessible to all employees) */}
            <Route path="/cases" element={<ReportIssue />} />

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
      </div>
    </div>
  );
};

export default Layout;