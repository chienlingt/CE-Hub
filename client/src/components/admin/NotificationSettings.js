import React, { useState, useEffect } from 'react';
import {
  Bell, MessageCircle, Save, CheckCircle,
  AlertCircle, ToggleLeft, ToggleRight, User, Phone
} from 'lucide-react';

import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

const PROACTIVE_DEFAULTS = {
  notification_from_name: 'TBM Delivery',
  template_on_the_way:
    'Dear {customerName}, this is {brandName} regarding your delivery for order {orderRef}. Your order is on its way and scheduled for {slotDate} between {timeWindow} at {address}. Our team will be with you shortly.',
  subject_on_the_way: 'Your delivery is on its way - Order {orderRef}',
  template_d1_reminder:
    'Dear {customerName}, this is {brandName} with a reminder that your delivery for order {orderRef} is scheduled for tomorrow ({slotDate}) between {timeWindow} at {address}. Please ensure someone is available to receive it.',
  subject_d1_reminder: 'Delivery reminder - Order {orderRef} on {slotDate}',
  customer_on_the_way_notification_enabled: 'true',
  customer_d1_reminder_notification_enabled: 'true',
};

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
  const [settings, setSettings] = useState({});
  const [admins, setAdmins] = useState([]);
  const [adminWaRecipients, setAdminWaRecipients] = useState([]); // IDs
  const [allAdminsEnabled, setAllAdminsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('updates');

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
      setSettings({ ...PROACTIVE_DEFAULTS, ...map });

      try {
        const ids = JSON.parse(map.whatsapp_admin_recipients || '[]');
        setAdminWaRecipients(ids);
        setAllAdminsEnabled(ids.length === 0);
      } catch {
        setAllAdminsEnabled(true);
      }

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

  const adminWaOn = settings.whatsapp_admin_notification_enabled !== 'false';
  const salespersonWaOn = settings.whatsapp_salesperson_notification_enabled !== 'false';
  const customerWaOn = settings.whatsapp_customer_notification_enabled !== 'false';
  const onTheWayEnabled = settings.customer_on_the_way_notification_enabled !== 'false';
  const d1ReminderEnabled = settings.customer_d1_reminder_notification_enabled !== 'false';

  const customerTemplate = settings.whatsapp_failure_message_template || '';
  const salespersonTemplate = settings.whatsapp_failure_salesperson_template || '';
  const adminTemplate = settings.whatsapp_failure_admin_template || '';

  const fromName = settings.notification_from_name ?? PROACTIVE_DEFAULTS.notification_from_name;
  const onTheWayTemplate = settings.template_on_the_way ?? PROACTIVE_DEFAULTS.template_on_the_way;
  const onTheWaySubject = settings.subject_on_the_way ?? PROACTIVE_DEFAULTS.subject_on_the_way;
  const d1Template = settings.template_d1_reminder ?? PROACTIVE_DEFAULTS.template_d1_reminder;
  const d1Subject = settings.subject_d1_reminder ?? PROACTIVE_DEFAULTS.subject_d1_reminder;

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
        <p className="mt-1 text-sm text-gray-500">Configure delivery update and failure notifications.</p>
      </div>

      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('updates')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
              activeTab === 'updates'
                ? 'bg-white border-gray-200 text-gray-900'
                : 'bg-gray-100 border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Delivery updates
          </button>
          <button
            onClick={() => setActiveTab('failures')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
              activeTab === 'failures'
                ? 'bg-white border-gray-200 text-gray-900'
                : 'bg-gray-100 border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Delivery failures
          </button>
        </div>
      </div>

      {activeTab === 'updates' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
            <SectionHeader
              icon={Bell}
              title="Sender identity"
              subtitle="Used as the email sender display name and as {brandName} in proactive templates."
              color="text-gray-700"
            />
            <div className="px-5 pb-5">
              <p className="text-xs text-gray-500 mb-2 mt-4">Sender display name</p>
              <input
                type="text"
                value={fromName}
                onChange={e => setSettings(prev => ({ ...prev, notification_from_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                placeholder="TBM Delivery"
              />
              <button
                onClick={() => saveSetting('notification_from_name', fromName)}
                disabled={saving.notification_from_name}
                className="mt-2 flex items-center px-4 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                <Save size={14} className="mr-1.5" />
                {saving.notification_from_name ? 'Saving...' : 'Save Sender Name'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
            <SectionHeader
              icon={MessageCircle}
              title="On-the-way customer notification"
              subtitle="WhatsApp/email body and email subject when a slot departs."
              color="text-green-600"
            />
            <div className="px-5">
              <SettingRow
                title="Enable on-the-way notification"
                description="When disabled, queued on-the-way jobs are marked processed without sending."
              >
                <Toggle
                  checked={onTheWayEnabled}
                  onChange={() => toggleSetting('customer_on_the_way_notification_enabled')}
                  disabled={saving.customer_on_the_way_notification_enabled}
                />
              </SettingRow>

              <div className="pb-5">
                <p className="text-xs font-medium text-gray-700 mb-2 mt-2">Message body template</p>
                <TemplatePlaceholders placeholders={['customerName', 'orderRef', 'slotDate', 'timeWindow', 'address', 'brandName']} />
                <textarea
                  rows={4}
                  value={onTheWayTemplate}
                  onChange={e => setSettings(prev => ({ ...prev, template_on_the_way: e.target.value }))}
                  disabled={!onTheWayEnabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:opacity-50 disabled:bg-gray-50"
                  placeholder="Dear {customerName}, this is {brandName} regarding your delivery for order {orderRef}..."
                />
                <button
                  onClick={() => saveSetting('template_on_the_way', onTheWayTemplate)}
                  disabled={saving.template_on_the_way || !onTheWayEnabled}
                  className="mt-2 flex items-center px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} className="mr-1.5" />
                  {saving.template_on_the_way ? 'Saving...' : 'Save Template'}
                </button>

                <p className="text-xs font-medium text-gray-700 mb-2 mt-4">Email subject template</p>
                <TemplatePlaceholders placeholders={['customerName', 'orderRef', 'slotDate', 'timeWindow', 'address', 'brandName']} />
                <input
                  type="text"
                  value={onTheWaySubject}
                  onChange={e => setSettings(prev => ({ ...prev, subject_on_the_way: e.target.value }))}
                  disabled={!onTheWayEnabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
                  placeholder={PROACTIVE_DEFAULTS.subject_on_the_way}
                />
                <button
                  onClick={() => saveSetting('subject_on_the_way', onTheWaySubject)}
                  disabled={saving.subject_on_the_way || !onTheWayEnabled}
                  className="mt-2 flex items-center px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} className="mr-1.5" />
                  {saving.subject_on_the_way ? 'Saving...' : 'Save Subject'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
            <SectionHeader
              icon={MessageCircle}
              title="D-1 customer reminder"
              subtitle="WhatsApp/email body and email subject for tomorrow's scheduled orders."
              color="text-blue-600"
            />
            <div className="px-5">
              <SettingRow
                title="Enable D-1 reminder"
                description="When disabled, queued D-1 jobs are marked processed without sending."
              >
                <Toggle
                  checked={d1ReminderEnabled}
                  onChange={() => toggleSetting('customer_d1_reminder_notification_enabled')}
                  disabled={saving.customer_d1_reminder_notification_enabled}
                />
              </SettingRow>

              <div className="pb-5">
                <p className="text-xs font-medium text-gray-700 mb-2 mt-2">Message body template</p>
                <TemplatePlaceholders placeholders={['customerName', 'orderRef', 'slotDate', 'timeWindow', 'address', 'brandName']} />
                <textarea
                  rows={4}
                  value={d1Template}
                  onChange={e => setSettings(prev => ({ ...prev, template_d1_reminder: e.target.value }))}
                  disabled={!d1ReminderEnabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50 disabled:bg-gray-50"
                  placeholder="Dear {customerName}, this is {brandName} with a reminder for order {orderRef}..."
                />
                <button
                  onClick={() => saveSetting('template_d1_reminder', d1Template)}
                  disabled={saving.template_d1_reminder || !d1ReminderEnabled}
                  className="mt-2 flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} className="mr-1.5" />
                  {saving.template_d1_reminder ? 'Saving...' : 'Save Template'}
                </button>

                <p className="text-xs font-medium text-gray-700 mb-2 mt-4">Email subject template</p>
                <TemplatePlaceholders placeholders={['customerName', 'orderRef', 'slotDate', 'timeWindow', 'address', 'brandName']} />
                <input
                  type="text"
                  value={d1Subject}
                  onChange={e => setSettings(prev => ({ ...prev, subject_d1_reminder: e.target.value }))}
                  disabled={!d1ReminderEnabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
                  placeholder={PROACTIVE_DEFAULTS.subject_d1_reminder}
                />
                <button
                  onClick={() => saveSetting('subject_d1_reminder', d1Subject)}
                  disabled={saving.subject_d1_reminder || !d1ReminderEnabled}
                  className="mt-2 flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} className="mr-1.5" />
                  {saving.subject_d1_reminder ? 'Saving...' : 'Save Subject'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'failures' && (
        <>
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
                  disabled={saving.whatsapp_customer_notification_enabled}
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
                  disabled={saving.whatsapp_failure_message_template || !customerWaOn}
                  className="mt-2 flex items-center px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} className="mr-1.5" />
                  {saving.whatsapp_failure_message_template ? 'Saving...' : 'Save Template'}
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
                  disabled={saving.whatsapp_salesperson_notification_enabled}
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
                  disabled={saving.whatsapp_failure_salesperson_template || !salespersonWaOn}
                  className="mt-2 flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} className="mr-1.5" />
                  {saving.whatsapp_failure_salesperson_template ? 'Saving...' : 'Save Template'}
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
                  disabled={saving.whatsapp_admin_notification_enabled}
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
                              : <span className="text-red-400">No contact number - add in Employee profile</span>
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
                  placeholder="Hi {adminName}, delivery failed - Order {orderRef}..."
                />
                <button
                  onClick={() => saveSetting('whatsapp_failure_admin_template', adminTemplate)}
                  disabled={saving.whatsapp_failure_admin_template || !adminWaOn}
                  className="mt-2 flex items-center px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} className="mr-1.5" />
                  {saving.whatsapp_failure_admin_template ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
