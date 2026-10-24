import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, X, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';
import { desktopNotificationStatus, showDesktopNotification } from '../../utils/desktopNotifications';
const POLL_INTERVAL = 5000; // 5 seconds — near real-time

const TYPE_CONFIG = {
  error:   { icon: AlertTriangle, bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',   badge: 'bg-red-500'    },
  warning: { icon: AlertTriangle, bg: 'bg-yellow-50', border: 'border-yellow-200',text: 'text-yellow-700',badge: 'bg-yellow-500' },
  info:    { icon: Info,          bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',  badge: 'bg-blue-500'   },
  success: { icon: CheckCircle,   bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-500'  },
};

function formatTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now  = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

function NotificationContent({ notification }) {
  const raw = notification.message || '';
  const legacy = raw.match(/^(Delivery failed)[^|]*\|\s*Customer:\s*([^|]+?)\s*\|\s*Reason:\s*(.+)$/i);
  const parts = (legacy ? `${legacy[1]} · ${legacy[2]} · ${legacy[3]}` : raw).split(' · ');
  const failure = /^delivery failed$/i.test(parts[0]) && parts.length >= 3;
  const reference = failure && parts[parts.length - 1].startsWith('#') ? parts[parts.length - 1].slice(1) : '';
  const details = reference ? parts.slice(1, -1) : parts.slice(1);
  return (
    <>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`text-sm font-semibold ${notification.is_read ? 'text-gray-600' : 'text-gray-900'}`}>{failure ? 'Delivery failed' : parts[0]}</span>
        {reference && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 break-all">{reference}</span>}
      </span>
      {failure ? (
        <>
          <span className="mt-1 block text-sm font-medium text-gray-700 break-words">{details[0]}</span>
          <span className="mt-0.5 block text-xs font-medium text-red-600 break-words">{details[details.length - 1]}</span>
          {details.length > 2 && <span className="mt-1 block text-xs leading-relaxed text-gray-500 break-words">{details.slice(1, -1).join(' · ')}</span>}
        </>
      ) : details.length > 0 && <span className="mt-1 block text-sm leading-relaxed text-gray-600 break-words">{details.join(' · ')}</span>}
    </>
  );
}

function NotificationToast({ notification, onDismiss, onOpen }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notification.id), 6000);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info;
  const Icon = config.icon;
  return (
    <div className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 shadow-xl ${config.border}`}>
      <span className={`rounded-lg p-2 ${config.bg}`}><Icon size={20} className={config.text} /></span>
      <button type="button" onClick={() => onOpen(notification)} className="min-w-0 flex-1 text-left rounded focus-visible:outline-blue-600">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">CE Hub</span>
        <NotificationContent notification={notification} />
      </button>
      <button type="button" onClick={() => onDismiss(notification.id)} aria-label="Close notification" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={18} /></button>
    </div>
  );
}

export default function NotificationBell({ userId, enableToasts = false }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [isOpen,        setIsOpen]        = useState(false);
  const dropdownRef = useRef(null);
  const [toasts, setToasts] = useState([]);
  const seenRef = useRef(null);
  const openNotificationRef = useRef(null);
  const desktopPopupsRef = useRef(new Set());
  const [desktopStatus, setDesktopStatus] = useState(desktopNotificationStatus);
  const [permissionError, setPermissionError] = useState('');
  const dismissToast = useCallback((id) => setToasts(previous => previous.filter(n => n.id !== id)), []);

  const enableDesktopNotifications = async () => {
    setPermissionError('');
    try {
      // Permission must be requested directly from a user gesture.
      await window.Notification.requestPermission();
      setDesktopStatus(desktopNotificationStatus());
    } catch {
      setPermissionError('Desktop notifications are unavailable in this browser.');
    }
  };

  useEffect(() => {
    const refresh = () => setDesktopStatus(desktopNotificationStatus());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const fetchNotifications = useCallback(async (signal) => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE}/api/notifications?user_id=${encodeURIComponent(userId)}&limit=15`, { signal });
      if (!res.ok) return;
      const data = await res.json();
      if (signal?.aborted) return;
      if (!Array.isArray(data)) return;
      if (seenRef.current && enableToasts) {
        const incoming = data.filter(n => !n.is_read && !seenRef.current.has(n.id));
        incoming.forEach(n => {
          const dispose = showDesktopNotification(n, notification => openNotificationRef.current?.(notification));
          if (dispose) {
            desktopPopupsRef.current.add(dispose);
            setTimeout(() => desktopPopupsRef.current.delete(dispose), 6500);
          }
        });
        if (incoming.length) setToasts(previous => [...incoming.reverse(), ...previous].slice(0, 3));
      }
      if (!seenRef.current) seenRef.current = new Set();
      data.forEach(n => seenRef.current.add(n.id));
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.is_read).length);
    } catch (err) {
      // fail silently — bell is non-critical
    }
  }, [userId, enableToasts]);

  // Initial fetch + polling
  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    seenRef.current = null;
    setToasts([]);
    setNotifications([]);
    setUnreadCount(0);
    const poll = async () => {
      if (fetching) return;
      fetching = true;
      try { await fetchNotifications(controller.signal); }
      finally { fetching = false; }
    };
    poll();
    const timer = setInterval(poll, POLL_INTERVAL);
    const popups = desktopPopupsRef.current;
    return () => {
      controller.abort(); clearInterval(timer);
      popups.forEach(dispose => dispose());
      popups.clear();
    };
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    const handleEscape = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const markAsRead = async (id) => {
    try {
      await fetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) { /* fail silently */ }
  };

  const deleteNotification = async (e, id) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/notifications/${id}`, { method: 'DELETE' });
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => Math.max(0, prev - (notifications.find(n => n.id === id)?.is_read ? 0 : 1)));
    } catch (err) { /* fail silently */ }
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    try {
      await fetch(`${API_BASE}/api/notifications/read-all?user_id=${userId}`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) { /* fail silently */ }
  };

  const handleOpen = () => setIsOpen(prev => !prev);

  const isDriverOrderReport = (order) =>
    order?.issue_reason === 'Driver Escalation'
    || order?.is_complaint_submitted === true;

  const handleNotificationClick = async (n) => {
    dismissToast(n.id);
    if (!n.is_read) await markAsRead(n.id);
    setIsOpen(false);

    if (!n.order_id) {
      navigate('/exceptions/failed-deliveries');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/orders/${n.order_id}`);
      if (res.ok) {
        const order = await res.json();
        if (isDriverOrderReport(order)) {
          navigate(`/exceptions/driver-escalations?orderId=${n.order_id}`);
          return;
        }
      }
    } catch { /* fallback below */ }

    navigate(`/exceptions/failed-deliveries?orderId=${n.order_id}`);
  };
  openNotificationRef.current = handleNotificationClick;

  return (
    <div className="relative" ref={dropdownRef}>
      {enableToasts && createPortal(
        <div role="region" aria-label="New notifications" aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed right-3 top-3 z-[10000] flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-3 sm:right-5 sm:top-5">
          {toasts.map(notification => <NotificationToast key={notification.id} notification={notification} onDismiss={dismissToast} onOpen={handleNotificationClick} />)}
        </div>, document.body
      )}
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative flex items-center p-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-controls="notification-panel"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div id="notification-panel" aria-label="Notifications" className="fixed left-3 right-3 top-20 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center space-x-2">
              <Bell size={16} className="text-gray-600" />
              <span className="text-sm font-semibold text-gray-800">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button onClick={() => setIsOpen(false)} aria-label="Close notifications" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          </div>

          {enableToasts && desktopStatus !== 'granted' && (
            <div className="border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 text-xs leading-relaxed text-gray-500">
              {desktopStatus === 'default' && <button type="button" onClick={enableDesktopNotifications} className="font-semibold text-blue-600 hover:underline">Enable desktop notifications</button>}
              {desktopStatus === 'granted' && 'Desktop notifications enabled'}
              {desktopStatus === 'denied' && 'Notifications blocked. Allow them in your browser’s site settings.'}
              {desktopStatus === 'insecure' && 'Desktop notifications need HTTPS or localhost.'}
              {desktopStatus === 'unsupported' && 'This browser supports in-app alerts only.'}
              {permissionError && <p className="mt-1 text-red-600">{permissionError}</p>}
            </div>
          )}
          {/* List */}
          <div className="max-h-[min(28rem,55dvh)] overflow-y-auto overscroll-contain divide-y divide-gray-100">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No notifications</p>
              </div>
            ) : (
              notifications.map((n) => {
                const cfg       = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
                const IconComp  = cfg.icon;
                return (
                  <div
                    key={n.id}
                    className={`px-4 py-4 hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`mt-0.5 p-1 rounded-full ${cfg.bg}`}>
                        <IconComp size={14} className={cfg.text} />
                      </div>
                      <button type="button" onClick={() => handleNotificationClick(n)} className="flex-1 min-w-0 text-left rounded focus-visible:outline-blue-600">
                        <NotificationContent notification={n} />
                        <span className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">{!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-label="Unread" />}{formatTime(n.created_at)}</span>
                      </button>
                      <button
                        onClick={(e) => deleteNotification(e, n.id)}
                        className="flex-shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        aria-label="Delete notification"
                        title="Dismiss"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
