import React, { useState, useEffect } from 'react';
import {
  Bell, MessageCircle, Mail, Save, CheckCircle,
  AlertCircle, ToggleLeft, ToggleRight, User
} from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_BASE_URL || window.location.origin.replace(/:\d+$/, ':4000');

// ── Helpers ──────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {checked
        ? <ToggleRight size={36} className="text-blue-600" />
        : <ToggleLeft  size={36} className="text-gray-400" />
      }
    </button>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="px-5 py-4 border-b border-gray-100">
      <div className="flex items-center space-x-2">
        <Icon size={16} className="text-gray-600" />
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5 ml-6">{subtitle}</p>}
    </div>
  );
}

function SettingRow({ title, description, children }) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-gray-100 last:border-0">
      <div className="flex-1 pr-6">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NotificationSettings() {
  const [settings,   setSettings]   = useState({});
  const [admins,     setAdmins]     = useState([]);
  const [enabledIds, setEnabledIds] = useState([]); // admin IDs enabled for email
  const [allEnabled, setAllEnabled] = useState(true); // true = all admins get email
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState({});
  const [toast,      setToast]      = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load settings + admin employees
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/settings`).then(r => r.json()),
      fetch(`${API_BASE}/api/employees`).then(r => r.json()),
    ]).then(([settingsRes, empRes]) => {
      const map = {};
      (settingsRes.data || []).forEach(s => { map[s.key] = s.value; });
      setSettings(map);

      // Parse enabled admin IDs
      try {
        const ids = JSON.parse(map['admin_email_recipients'] || '[]');
        setEnabledIds(ids);
        setAllEnabled(ids.length === 0);
      } catch { setAllEnabled(true); }

      // Filter admin employees
      const adminEmps = Array.isArray(empRes)
        ? empRes.filter(e =>
            e.active_flag !== false &&
            e.role?.name?.toLowerCase().includes('admin')
          )
        : [];
      setAdmins(adminEmps);
    }).catch(() => showToast('Failed to load settings', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const saveSetting = async (key, value) => {
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/settings/${key}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ value: String(value) }),
      });
      if (!res.ok) throw new Error('Failed');
      setSettings(prev => ({ ...prev, [key]: String(value) }));
      showToast('Saved');
    } catch {
      showToast('Failed to save', 'error');
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  // Toggle a global boolean setting
  const toggleSetting = (key, currentValue) => {
    const next = currentValue !== 'true' ? 'true' : 'false';
    saveSetting(key, next);
  };

  // Toggle individual admin in recipient list
  const toggleAdmin = async (adminId) => {
    let next;
    if (allEnabled) {
      // Currently all enabled → switch to specific list excluding this admin
      next = admins.map(a => a.id).filter(id => id !== adminId);
      setAllEnabled(false);
    } else {
      const isEnabled = enabledIds.includes(adminId);
      next = isEnabled
        ? enabledIds.filter(id => id !== adminId)
        : [...enabledIds, adminId];
      // If all admins re-enabled, revert to "all" mode
      if (next.length === admins.length) {
        next = [];
        setAllEnabled(true);
      }
    }
    setEnabledIds(next);
    await saveSetting('admin_email_recipients', JSON.stringify(next));
  };

  const isAdminEnabled = (adminId) =>
    allEnabled || enabledIds.includes(adminId);

  const internalOn  = settings['internal_email_notification_enabled'] !== 'false';
  const customerOn  = settings['customer_email_notification_enabled']  !== 'false';
  const waTemplate  = settings['whatsapp_failure_message_template'] || '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'error'
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {toast.type === 'error'
            ? <AlertCircle size={16} className="mr-2" />
            : <CheckCircle size={16} className="mr-2" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Bell className="w-6 h-6 mr-2 text-blue-600" />
          Notification Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure how CE Hub notifies staff and customers on delivery failures.
        </p>
      </div>

      {/* ── Email Notifications ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <SectionHeader
          icon={Mail}
          title="Email Notifications"
          subtitle="Triggered automatically when a driver reports a delivery failure."
        />
        <div className="px-5">

          {/* Internal email toggle */}
          <SettingRow
            title="Internal failure email to admins"
            description="Send a structured failure report to admin employees when a delivery fails."
          >
            <Toggle
              checked={internalOn}
              onChange={() => toggleSetting('internal_email_notification_enabled', settings['internal_email_notification_enabled'])}
              disabled={saving['internal_email_notification_enabled']}
            />
          </SettingRow>

          {/* Customer email toggle */}
          <SettingRow
            title="Customer failure email"
            description="Send a customer-facing email explaining the failure and next steps."
          >
            <Toggle
              checked={customerOn}
              onChange={() => toggleSetting('customer_email_notification_enabled', settings['customer_email_notification_enabled'])}
              disabled={saving['customer_email_notification_enabled']}
            />
          </SettingRow>
        </div>
      </div>

      {/* ── Admin Email Recipients ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <SectionHeader
          icon={User}
          title="Admin Email Recipients"
          subtitle="Choose which admin accounts receive failure email notifications."
        />
        <div className="px-5">
          {admins.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">
              No admin employees found in the system.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {admins.map(admin => (
                <div key={admin.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {admin.name || admin.display_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500">{admin.email || 'No email'}</p>
                    </div>
                  </div>
                  <Toggle
                    checked={isAdminEnabled(admin.id)}
                    onChange={() => toggleAdmin(admin.id)}
                    disabled={!internalOn || !admin.email}
                  />
                </div>
              ))}
            </div>
          )}
          {!internalOn && (
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-4">
              Enable "Internal failure email to admins" above to configure recipients.
            </p>
          )}
        </div>
      </div>

      {/* ── WhatsApp Notifications ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <SectionHeader
          icon={MessageCircle}
          title="WhatsApp Notifications (Green API)"
          subtitle="Automatically sent to the customer's phone number on delivery failure."
        />
        <div className="px-5 pb-5">
          <p className="text-xs text-gray-500 mb-3 mt-2">
            Available placeholders:{' '}
            <code className="bg-gray-100 px-1 rounded">{'{customerName}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{orderRef}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{reason}'}</code>
          </p>
          <textarea
            rows={4}
            value={waTemplate}
            onChange={e => setSettings(prev => ({ ...prev, whatsapp_failure_message_template: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder="Hi {customerName}, your delivery for order {orderRef} was unsuccessful..."
          />
          <button
            onClick={() => saveSetting('whatsapp_failure_message_template', waTemplate)}
            disabled={saving['whatsapp_failure_message_template']}
            className="mt-2 flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={14} className="mr-1.5" />
            {saving['whatsapp_failure_message_template'] ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>

    </div>
  );
}
