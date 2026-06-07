import React, { useState, useEffect } from 'react';
import {
  Bell, MessageCircle, Save, CheckCircle,
  AlertCircle, ToggleLeft, ToggleRight, User, Phone
} from 'lucide-react';

import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {checked
        ? <ToggleRight size={36} className="text-green-600" />
        : <ToggleLeft  size={36} className="text-gray-400" />
      }
    </button>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, color = 'text-gray-600' }) {
  return (
    <div className="px-5 py-4 border-b border-gray-100">
      <div className="flex items-center space-x-2">
        <Icon size={16} className={color} />
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

function TemplatePlaceholders({ placeholders }) {
  return (
    <p className="text-xs text-gray-500 mb-2">
      Placeholders:{' '}
      {placeholders.map(p => (
        <code key={p} className="bg-gray-100 px-1 rounded mr-1">{`{${p}}`}</code>
      ))}
    </p>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NotificationSettings() {
  const [settings,           setSettings]           = useState({});
  const [admins,             setAdmins]             = useState([]);
  const [adminWaRecipients,  setAdminWaRecipients]  = useState([]); // IDs
  const [allAdminsEnabled,   setAllAdminsEnabled]   = useState(true);
  const [loading,            setLoading]            = useState(true);
  const [saving,             setSaving]             = useState({});
  const [toast,              setToast]              = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load settings + admin employees ──────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/settings`).then(r => r.json()),
      fetch(`${API_BASE}/api/employees`).then(r => r.json()),
    ]).then(([settingsRes, empRes]) => {
      const map = {};
      (settingsRes.data || settingsRes || []).forEach(s => {
        map[s.key || s.setting_key] = s.value || s.setting_value;
      });
      setSettings(map);

      try {
        const ids = JSON.parse(map['whatsapp_admin_recipients'] || '[]');
        setAdminWaRecipients(ids);
        setAllAdminsEnabled(ids.length === 0);
      } catch { setAllAdminsEnabled(true); }

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

  // ── Save helpers ──────────────────────────────────────────────────────────

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

  const toggleSetting = (key) => {
    const next = settings[key] !== 'true' ? 'true' : 'false';
    saveSetting(key, next);
  };

  // ── Toggle individual admin in WhatsApp recipient list ────────────────────

  const toggleAdminWa = async (adminId) => {
    let next;
    if (allAdminsEnabled) {
      next = admins.map(a => a.id).filter(id => id !== adminId);
      setAllAdminsEnabled(false);
    } else {
      const isOn = adminWaRecipients.includes(adminId);
      next = isOn
        ? adminWaRecipients.filter(id => id !== adminId)
        : [...adminWaRecipients, adminId];
      if (next.length === admins.length) { next = []; setAllAdminsEnabled(true); }
    }
    setAdminWaRecipients(next);
    await saveSetting('whatsapp_admin_recipients', JSON.stringify(next));
  };

  const isAdminWaEnabled = (adminId) =>
    allAdminsEnabled || adminWaRecipients.includes(adminId);

  // ── Derived values ────────────────────────────────────────────────────────

  const adminWaOn       = settings['whatsapp_admin_notification_enabled']       !== 'false';
  const salespersonWaOn = settings['whatsapp_salesperson_notification_enabled']  !== 'false';
  const customerWaOn    = settings['whatsapp_customer_notification_enabled']     !== 'false';

  const customerTemplate    = settings['whatsapp_failure_message_template']       || '';
  const salespersonTemplate = settings['whatsapp_failure_salesperson_template']   || '';
  const adminTemplate       = settings['whatsapp_failure_admin_template']         || '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
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
          <Bell className="w-6 h-6 mr-2 text-green-600" />
          Notification Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure WhatsApp notifications sent on delivery failure.
        </p>
      </div>

      {/* ── Customer WhatsApp ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <SectionHeader
          icon={MessageCircle}
          title="Customer WhatsApp"
          subtitle="Sent to the customer's phone number when a delivery fails."
          color="text-green-600"
        />
        <div className="px-5">
          <SettingRow
            title="Enable customer WhatsApp notification"
            description="Automatically send a WhatsApp message to the customer on delivery failure."
          >
            <Toggle
              checked={customerWaOn}
              onChange={() => toggleSetting('whatsapp_customer_notification_enabled')}
              disabled={saving['whatsapp_customer_notification_enabled']}
            />
          </SettingRow>
          <div className="pb-5">
            <TemplatePlaceholders placeholders={['customerName', 'orderRef', 'reason']} />
            <textarea
              rows={3}
              value={customerTemplate}
              onChange={e => setSettings(prev => ({ ...prev, whatsapp_failure_message_template: e.target.value }))}
              disabled={!customerWaOn}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:opacity-50 disabled:bg-gray-50"
              placeholder="Hi {customerName}, your delivery for order {orderRef} was unsuccessful..."
            />
            <button
              onClick={() => saveSetting('whatsapp_failure_message_template', customerTemplate)}
              disabled={saving['whatsapp_failure_message_template'] || !customerWaOn}
              className="mt-2 flex items-center px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} className="mr-1.5" />
              {saving['whatsapp_failure_message_template'] ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Salesperson WhatsApp ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <SectionHeader
          icon={MessageCircle}
          title="Salesperson WhatsApp"
          subtitle="Sent to the salesperson in charge of the order on delivery failure."
          color="text-blue-600"
        />
        <div className="px-5">
          <SettingRow
            title="Enable salesperson WhatsApp notification"
            description="Salesperson phone is pulled from the Odoo order. Make sure the salesperson_phone field is populated."
          >
            <Toggle
              checked={salespersonWaOn}
              onChange={() => toggleSetting('whatsapp_salesperson_notification_enabled')}
              disabled={saving['whatsapp_salesperson_notification_enabled']}
            />
          </SettingRow>
          <div className="pb-5">
            <TemplatePlaceholders placeholders={['recipientName', 'customerName', 'customerPhone', 'orderRef', 'reason', 'driverName', 'address']} />
            <textarea
              rows={3}
              value={salespersonTemplate}
              onChange={e => setSettings(prev => ({ ...prev, whatsapp_failure_salesperson_template: e.target.value }))}
              disabled={!salespersonWaOn}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50 disabled:bg-gray-50"
              placeholder="Hi {recipientName}, delivery failed for order {orderRef}..."
            />
            <button
              onClick={() => saveSetting('whatsapp_failure_salesperson_template', salespersonTemplate)}
              disabled={saving['whatsapp_failure_salesperson_template'] || !salespersonWaOn}
              className="mt-2 flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} className="mr-1.5" />
              {saving['whatsapp_failure_salesperson_template'] ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Admin WhatsApp ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <SectionHeader
          icon={MessageCircle}
          title="Admin WhatsApp"
          subtitle="Sent to logistics admin employees on delivery failure."
          color="text-orange-600"
        />
        <div className="px-5">
          <SettingRow
            title="Enable admin WhatsApp notification"
            description="Admin must have a contact number set in their employee profile to receive WhatsApp."
          >
            <Toggle
              checked={adminWaOn}
              onChange={() => toggleSetting('whatsapp_admin_notification_enabled')}
              disabled={saving['whatsapp_admin_notification_enabled']}
            />
          </SettingRow>

          {/* Admin recipient list */}
          {admins.length === 0 ? (
            <div className="py-4 text-sm text-gray-400 text-center">
              No admin employees found.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 mb-4">
              {admins.map(admin => (
                <div key={admin.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {admin.name || admin.display_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Phone size={10} />
                        {admin.contact_number
                          ? admin.contact_number
                          : <span className="text-red-400">No contact number — add in Employee profile</span>
                        }
                      </p>
                    </div>
                  </div>
                  <Toggle
                    checked={isAdminWaEnabled(admin.id)}
                    onChange={() => toggleAdminWa(admin.id)}
                    disabled={!adminWaOn || !admin.contact_number}
                  />
                </div>
              ))}
            </div>
          )}

          {!adminWaOn && (
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-4">
              Enable admin WhatsApp above to configure recipients.
            </p>
          )}

          <div className="pb-5">
            <TemplatePlaceholders placeholders={['adminName', 'customerName', 'orderRef', 'reason', 'driverName', 'address', 'salespersonName', 'salespersonPhone']} />
            <textarea
              rows={3}
              value={adminTemplate}
              onChange={e => setSettings(prev => ({ ...prev, whatsapp_failure_admin_template: e.target.value }))}
              disabled={!adminWaOn}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none disabled:opacity-50 disabled:bg-gray-50"
              placeholder="Hi {adminName}, delivery failed — Order {orderRef}..."
            />
            <button
              onClick={() => saveSetting('whatsapp_failure_admin_template', adminTemplate)}
              disabled={saving['whatsapp_failure_admin_template'] || !adminWaOn}
              className="mt-2 flex items-center px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} className="mr-1.5" />
              {saving['whatsapp_failure_admin_template'] ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
