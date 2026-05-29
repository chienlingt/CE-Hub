import React, { useState, useEffect } from 'react';
import { Bell, MessageCircle, Mail, Save, CheckCircle, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

function SettingRow({ icon: Icon, title, description, children }) {
  return (
    <div className="flex items-start justify-between py-5 border-b border-gray-100 last:border-0">
      <div className="flex items-start space-x-3 flex-1 pr-6">
        <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0">
          <Icon size={16} className="text-gray-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

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

export default function NotificationSettings() {
  const [settings,  setSettings]  = useState({});
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState({});
  const [toast,     setToast]     = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/settings`)
      .then(r => r.json())
      .then(res => {
        const map = {};
        (res.data || []).forEach(s => { map[s.key] = s.value; });
        setSettings(map);
      })
      .catch(() => showToast('Failed to load settings', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const updateSetting = async (key, value) => {
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/settings/${key}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ value: String(value) }),
      });
      if (!res.ok) throw new Error('Failed');
      setSettings(prev => ({ ...prev, [key]: String(value) }));
      showToast('Setting saved');
    } catch {
      showToast('Failed to save setting', 'error');
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const whatsappEnabled = settings['whatsapp_customer_notification_enabled'] === 'true';
  const template        = settings['whatsapp_failure_message_template'] || '';
  const adminEmail      = settings['admin_notification_email'] || '';

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
            : <CheckCircle size={16} className="mr-2" />
          }
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
          Configure how CE Hub notifies admins and customers on delivery failures.
        </p>
      </div>

      {/* Email section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <Mail size={16} className="text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-800">Email Notifications</h2>
          </div>
        </div>
        <div className="px-5">
          <SettingRow
            icon={Mail}
            title="Internal failure email to admin"
            description="Sends a structured failure report to all admin accounts when a delivery fails."
          >
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">Always On</span>
          </SettingRow>
          <SettingRow
            icon={Mail}
            title="Customer failure email"
            description="Sends a customer-facing email explaining the failure and next steps."
          >
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">Always On</span>
          </SettingRow>

          {/* Admin notification email */}
          <div className="pb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Always-notify admin email
            </label>
            <p className="text-xs text-gray-500 mb-2">
              This email always receives failure notifications regardless of DB admin accounts.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={adminEmail}
                onChange={e => setSettings(prev => ({ ...prev, admin_notification_email: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="admin@example.com"
              />
              <button
                onClick={() => updateSetting('admin_notification_email', adminEmail)}
                disabled={saving['admin_notification_email']}
                className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save size={14} className="mr-1.5" />
                {saving['admin_notification_email'] ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <div className="py-3 bg-yellow-50 rounded-lg px-4 mb-4 text-xs text-yellow-700">
            Email uses Gmail SMTP configured in server <code className="font-mono">.env</code> — update
            <strong> EMAIL_USER</strong> and <strong>EMAIL_PASSWORD</strong> (App Password) if emails are not sending.
          </div>
        </div>
      </div>

      {/* WhatsApp section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <MessageCircle size={16} className="text-green-600" />
            <h2 className="text-sm font-semibold text-gray-800">WhatsApp Notifications</h2>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Optional</span>
          </div>
        </div>

        <div className="px-5">
          <SettingRow
            icon={MessageCircle}
            title="Send WhatsApp to customer on failure"
            description="Sends a WhatsApp message to the customer's phone number when delivery fails. Requires Twilio credentials in .env."
          >
            <Toggle
              checked={whatsappEnabled}
              onChange={v => updateSetting('whatsapp_customer_notification_enabled', v)}
              disabled={saving['whatsapp_customer_notification_enabled']}
            />
          </SettingRow>

          {/* Message template */}
          <div className="pb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message Template
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Available placeholders: <code className="font-mono bg-gray-100 px-1 rounded">{'{customerName}'}</code>{' '}
              <code className="font-mono bg-gray-100 px-1 rounded">{'{orderRef}'}</code>{' '}
              <code className="font-mono bg-gray-100 px-1 rounded">{'{reason}'}</code>
            </p>
            <textarea
              rows={4}
              value={template}
              onChange={e => setSettings(prev => ({ ...prev, whatsapp_failure_message_template: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Hi {customerName}, your delivery for order {orderRef} was unsuccessful..."
            />
            <button
              onClick={() => updateSetting('whatsapp_failure_message_template', template)}
              disabled={saving['whatsapp_failure_message_template']}
              className="mt-2 flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} className="mr-1.5" />
              {saving['whatsapp_failure_message_template'] ? 'Saving...' : 'Save Template'}
            </button>
          </div>

          {/* Twilio setup guide */}
          <div className="mb-5 bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-1 border border-gray-200">
            <p className="font-semibold text-gray-700 mb-2">Twilio Setup (one-time)</p>
            <p>1. Sign up at <strong>twilio.com</strong> → get Account SID and Auth Token</p>
            <p>2. Enable WhatsApp Sandbox in Twilio Console → Messaging → Try it out → Send a WhatsApp</p>
            <p>3. Add to <code className="font-mono bg-white px-1 rounded border">server/.env</code>:</p>
            <pre className="bg-white border rounded p-2 mt-1 font-mono text-xs">
{`TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`}
            </pre>
            <p>4. Customer must first message the Twilio sandbox number to opt in (sandbox limitation)</p>
          </div>
        </div>
      </div>

    </div>
  );
}
