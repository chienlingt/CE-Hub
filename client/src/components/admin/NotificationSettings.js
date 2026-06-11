import {
  AlertCircle,
  Bell,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Phone,
  Save,
  Search,
  ToggleLeft, ToggleRight,
  Users
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

const PROACTIVE_PLACEHOLDERS = ['customerName', 'orderRef', 'slotDate', 'timeWindow', 'address', 'brandName'];

// ── Primitives ────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`transition-colors ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {checked
        ? <ToggleRight size={32} className="text-green-500" />
        : <ToggleLeft  size={32} className="text-gray-300" />}
    </button>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium border ${
      toast.type === 'error'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-green-50 text-green-700 border-green-200'
    }`}>
      {toast.type === 'error'
        ? <AlertCircle size={15} />
        : <CheckCircle size={15} />}
      {toast.msg}
    </div>
  );
}

// ── Searchable Admin Dropdown ─────────────────────────────────────────────────

function AdminDropdown({ admins, isEnabled, onToggle, masterOn }) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const ref                 = useRef(null);

  const selectedCount = admins.filter(a => isEnabled(a.id)).length;
  const filtered      = admins.filter(a =>
    (a.name || a.display_name || '').toLowerCase().includes(query.toLowerCase()) ||
    (a.contact_number || '').includes(query)
  );

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => masterOn && setOpen(v => !v)}
        disabled={!masterOn}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors w-full
          ${masterOn
            ? 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer'
            : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'}`}
      >
        <Users size={14} className="text-gray-400 flex-shrink-0" />
        <span className="flex-1 text-left">
          {selectedCount === 0
            ? 'No recipients'
            : selectedCount === admins.length
            ? 'All admins'
            : `${selectedCount} of ${admins.length} admins`}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-30 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search admins…"
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No results</p>
            ) : filtered.map(admin => {
              const on      = isEnabled(admin.id);
              const hasPhone = !!admin.contact_number;
              return (
                <div
                  key={admin.id}
                  onClick={() => hasPhone && onToggle(admin.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 transition-colors
                    ${hasPhone ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                    ${on ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {(admin.name || admin.display_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {admin.name || admin.display_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                      {hasPhone
                        ? <><Phone size={9} />{admin.contact_number}</>
                        : <span className="text-red-400">No phone</span>}
                    </p>
                  </div>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0
                    ${on ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                    {on && <CheckCircle size={10} className="text-white" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Collapsible Template Editor ───────────────────────────────────────────────

function TemplateEditor({
  value,
  onChange,
  onSave,
  saving,
  disabled,
  color,
  placeholders,
  label = 'Message template',
  multiline = true,
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-xs text-gray-500 font-medium"
      >
        <span>{label}</span>
        <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="p-3 space-y-2">
          <div className="flex flex-wrap gap-1">
            {placeholders.map(p => (
              <code key={p} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{`{${p}}`}</code>
            ))}
          </div>
          {multiline ? (
            <textarea
              rows={3}
              value={value}
              onChange={e => onChange(e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 resize-none disabled:opacity-40 disabled:bg-gray-50"
              style={{ '--tw-ring-color': color }}
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={e => onChange(e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:opacity-40 disabled:bg-gray-50"
              style={{ '--tw-ring-color': color }}
            />
          )}
          <button
            onClick={onSave}
            disabled={saving || disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors"
            style={{ backgroundColor: disabled ? '#9ca3af' : color }}
          >
            <Save size={12} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Notification Card ─────────────────────────────────────────────────────────

function NotifCard({ icon: Icon, label, color, accentBg, checked, onToggle, disabled: masterDisabled, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className={`flex items-center justify-between px-4 py-3 ${accentBg} rounded-t-2xl`}>
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color }} />
          <span className="text-sm font-semibold text-gray-800">{label}</span>
        </div>
        {onToggle != null && (
          <Toggle checked={checked} onChange={onToggle} disabled={masterDisabled} />
        )}
      </div>
      <div className="p-4 space-y-3 relative overflow-visible">
        {children}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NotificationSettings() {
  const [settings,          setSettings]          = useState({});
  const [admins,            setAdmins]            = useState([]);
  const [adminWaRecipients, setAdminWaRecipients] = useState([]);
  const [allAdminsEnabled,  setAllAdminsEnabled]  = useState(true);
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState({});
  const [toast,             setToast]             = useState(null);
  const [activeTab,         setActiveTab]         = useState('updates');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

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

  const adminWaOn         = settings.whatsapp_admin_notification_enabled !== 'false';
  const salespersonWaOn = settings.whatsapp_salesperson_notification_enabled !== 'false';
  const customerWaOn      = settings.whatsapp_customer_notification_enabled !== 'false';
  const onTheWayEnabled   = settings.customer_on_the_way_notification_enabled !== 'false';
  const d1ReminderEnabled = settings.customer_d1_reminder_notification_enabled !== 'false';

  const customerTemplate    = settings.whatsapp_failure_message_template || '';
  const salespersonTemplate = settings.whatsapp_failure_salesperson_template || '';
  const adminTemplate       = settings.whatsapp_failure_admin_template || '';

  const fromName        = settings.notification_from_name ?? PROACTIVE_DEFAULTS.notification_from_name;
  const onTheWayTemplate = settings.template_on_the_way ?? PROACTIVE_DEFAULTS.template_on_the_way;
  const onTheWaySubject  = settings.subject_on_the_way ?? PROACTIVE_DEFAULTS.subject_on_the_way;
  const d1Template       = settings.template_d1_reminder ?? PROACTIVE_DEFAULTS.template_d1_reminder;
  const d1Subject          = settings.subject_d1_reminder ?? PROACTIVE_DEFAULTS.subject_d1_reminder;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-green-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <Toast toast={toast} />

      <div className="flex items-center gap-2 mb-4">
        <Bell size={20} className="text-gray-500" />
        <div>
          <h1 className="text-lg font-bold text-gray-800">Notification Settings</h1>
          <p className="text-xs text-gray-500">Configure delivery update and failure notifications.</p>
        </div>
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
        <div className="space-y-4">
          <NotifCard
            icon={Bell}
            label="Sender identity"
            color="#374151"
            accentBg="bg-gray-50"
            checked
            onToggle={null}
          >
            <p className="text-xs text-gray-500">
              Used as the email sender display name and as {'{brandName}'} in proactive templates.
            </p>
            <input
              type="text"
              value={fromName}
              onChange={e => setSettings(p => ({ ...p, notification_from_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              placeholder="TBM Delivery"
            />
            <button
              onClick={() => saveSetting('notification_from_name', fromName)}
              disabled={saving.notification_from_name}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-white text-xs font-semibold rounded-lg disabled:opacity-40"
            >
              <Save size={12} />
              {saving.notification_from_name ? 'Saving…' : 'Save sender name'}
            </button>
          </NotifCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NotifCard
              icon={MessageCircle}
              label="On-the-way"
              color="#16a34a"
              accentBg="bg-green-50"
              checked={onTheWayEnabled}
              onToggle={() => toggleSetting('customer_on_the_way_notification_enabled')}
            >
              <p className="text-xs text-gray-500">Sent when a slot departs (WhatsApp + email).</p>
              <TemplateEditor
                value={onTheWayTemplate}
                onChange={v => setSettings(p => ({ ...p, template_on_the_way: v }))}
                onSave={() => saveSetting('template_on_the_way', onTheWayTemplate)}
                saving={saving.template_on_the_way}
                disabled={!onTheWayEnabled}
                color="#16a34a"
                placeholders={PROACTIVE_PLACEHOLDERS}
                label="Message template"
              />
              <TemplateEditor
                value={onTheWaySubject}
                onChange={v => setSettings(p => ({ ...p, subject_on_the_way: v }))}
                onSave={() => saveSetting('subject_on_the_way', onTheWaySubject)}
                saving={saving.subject_on_the_way}
                disabled={!onTheWayEnabled}
                color="#16a34a"
                placeholders={PROACTIVE_PLACEHOLDERS}
                label="Email subject"
                multiline={false}
              />
            </NotifCard>

            <NotifCard
              icon={MessageCircle}
              label="D-1 reminder"
              color="#2563eb"
              accentBg="bg-blue-50"
              checked={d1ReminderEnabled}
              onToggle={() => toggleSetting('customer_d1_reminder_notification_enabled')}
            >
              <p className="text-xs text-gray-500">Sent for tomorrow&apos;s scheduled orders (WhatsApp + email).</p>
              <TemplateEditor
                value={d1Template}
                onChange={v => setSettings(p => ({ ...p, template_d1_reminder: v }))}
                onSave={() => saveSetting('template_d1_reminder', d1Template)}
                saving={saving.template_d1_reminder}
                disabled={!d1ReminderEnabled}
                color="#2563eb"
                placeholders={PROACTIVE_PLACEHOLDERS}
                label="Message template"
              />
              <TemplateEditor
                value={d1Subject}
                onChange={v => setSettings(p => ({ ...p, subject_d1_reminder: v }))}
                onSave={() => saveSetting('subject_d1_reminder', d1Subject)}
                saving={saving.subject_d1_reminder}
                disabled={!d1ReminderEnabled}
                color="#2563eb"
                placeholders={PROACTIVE_PLACEHOLDERS}
                label="Email subject"
                multiline={false}
              />
            </NotifCard>
          </div>
        </div>
      )}

      {activeTab === 'failures' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NotifCard
            icon={MessageCircle}
            label="Customer"
            color="#16a34a"
            accentBg="bg-green-50"
            checked={customerWaOn}
            onToggle={() => toggleSetting('whatsapp_customer_notification_enabled')}
          >
            <TemplateEditor
              value={customerTemplate}
              onChange={v => setSettings(p => ({ ...p, whatsapp_failure_message_template: v }))}
              onSave={() => saveSetting('whatsapp_failure_message_template', customerTemplate)}
              saving={saving.whatsapp_failure_message_template}
              disabled={!customerWaOn}
              color="#16a34a"
              placeholders={['customerName', 'orderRef', 'reason']}
            />
          </NotifCard>

          <NotifCard
            icon={MessageCircle}
            label="Salesperson"
            color="#2563eb"
            accentBg="bg-blue-50"
            checked={salespersonWaOn}
            onToggle={() => toggleSetting('whatsapp_salesperson_notification_enabled')}
          >
            <TemplateEditor
              value={salespersonTemplate}
              onChange={v => setSettings(p => ({ ...p, whatsapp_failure_salesperson_template: v }))}
              onSave={() => saveSetting('whatsapp_failure_salesperson_template', salespersonTemplate)}
              saving={saving.whatsapp_failure_salesperson_template}
              disabled={!salespersonWaOn}
              color="#2563eb"
              placeholders={['recipientName', 'customerName', 'customerPhone', 'orderRef', 'reason', 'driverName', 'address']}
            />
          </NotifCard>

          <NotifCard
            icon={MessageCircle}
            label="Admin"
            color="#ea580c"
            accentBg="bg-orange-50"
            checked={adminWaOn}
            onToggle={() => toggleSetting('whatsapp_admin_notification_enabled')}
          >
            <AdminDropdown
              admins={admins}
              isEnabled={isAdminWaEnabled}
              onToggle={toggleAdminWa}
              masterOn={adminWaOn}
            />
            <TemplateEditor
              value={adminTemplate}
              onChange={v => setSettings(p => ({ ...p, whatsapp_failure_admin_template: v }))}
              onSave={() => saveSetting('whatsapp_failure_admin_template', adminTemplate)}
              saving={saving.whatsapp_failure_admin_template}
              disabled={!adminWaOn}
              color="#ea580c"
              placeholders={['adminName', 'customerName', 'orderRef', 'reason', 'driverName', 'address', 'salespersonName', 'salespersonPhone']}
            />
          </NotifCard>
        </div>
      )}
    </div>
  );
}
