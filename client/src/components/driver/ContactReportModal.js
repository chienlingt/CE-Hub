// client/src/components/driver/ContactReportModal.js
// Driver contact / escalation menu: call or WhatsApp salesperson/warehouse,
// or send a report escalation to admin with a mandatory reason + note.
import { useState } from 'react';
import { X, Phone, MessageCircle, AlertTriangle, ChevronRight, CheckCircle } from 'lucide-react';
import { callCustomer, openWhatsApp } from '../../utils/phoneHelpers';
import { salespersonIssueTemplate, warehouseIssueTemplate } from '../../utils/templateMessages';
import { ESCALATION_REASONS, ESCALATION_REASON_STYLES } from '../../utils/escalationReasons';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

function apiUrl(path) {
  return `${API_BASE.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`;
}

/**
 * @param {{
 *   job: object,
 *   employeeId: string,
 *   onClose: () => void,
 *   onSuccess: () => void,
 * }}
 */
export default function ContactReportModal({ job, employeeId, onClose, onSuccess }) {
  // 'menu' | 'admin'
  const [view, setView] = useState('menu');
  const [adminReason, setAdminReason] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  // Follow-up if this order already has a report submitted (any reason)
  const isFollowUp = !!job.is_complaint_submitted;

  const shortId = job.odoo_order_ref?.toUpperCase() || 'Not Synced';

  const hasSalesperson = !!job.salesperson_phone;
  const hasWarehouse   = !!job.warehouse_contact_phone;

  function handleCallSalesperson() {
    callCustomer(job.salesperson_phone);
  }

  function handleWhatsAppSalesperson() {
    const msg = salespersonIssueTemplate(shortId, job.customer_name, job.address, job.status);
    openWhatsApp(job.salesperson_phone, msg);
  }

  function handleCallWarehouse() {
    callCustomer(job.warehouse_contact_phone);
  }

  function handleWhatsAppWarehouse() {
    const msg = warehouseIssueTemplate(shortId, job.product, job.address);
    openWhatsApp(job.warehouse_contact_phone, msg);
  }

  async function handleAdminEscalate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`driver/jobs/${job.id}/admin-escalation`), {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1',
        },
        body: JSON.stringify({
          issue_reason: adminReason,
          message:      adminMessage.trim(),
          employee_id:  employeeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDone(true);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <ModalShell onClose={onClose} title="Admin Notified">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500" />
          <p className="text-lg font-semibold text-gray-800">Admin has been notified</p>
          <p className="text-sm text-gray-500">The operations team will follow up shortly.</p>
          <button onClick={onClose} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  if (view === 'admin') {
    const canSend = adminMessage.trim().length >= 1 && (isFollowUp || !!adminReason);
    return (
      <ModalShell onClose={onClose} title={isFollowUp ? 'Add Follow-up Note' : 'Report to Admin'}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            {isFollowUp
              ? <>Add a follow-up note for order <span className="font-mono font-semibold">#{shortId}</span>. Admin will be re-notified.</>
              : <>Report an issue for order <span className="font-mono font-semibold">#{shortId}</span> to the operations team.</>
            }
          </p>

          {isFollowUp && job.issue_desc && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 whitespace-pre-wrap max-h-28 overflow-y-auto">
              <p className="font-semibold text-gray-500 mb-1">Previous notes</p>
              {job.issue_desc}
            </div>
          )}

          {/* Reason picker — required for first report; hidden on follow-ups */}
          {!isFollowUp && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">
                Reason <span className="text-red-500">*</span>
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {ESCALATION_REASONS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAdminReason(r)}
                    className={`text-xs font-medium px-2.5 py-2 rounded-lg border text-left transition-all ${
                      adminReason === r
                        ? (ESCALATION_REASON_STYLES[r] || 'bg-blue-100 text-blue-800') + ' ring-1 ring-current'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isFollowUp ? 'Follow-up note' : 'Details'} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={adminMessage}
              onChange={e => setAdminMessage(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={isFollowUp ? 'Describe the update or latest situation…' : 'Describe the issue to the operations team…'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-400 text-right">{adminMessage.length}/500</p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setView('menu')}
              className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={submitting || !canSend}
              onClick={handleAdminEscalate}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending…' : isFollowUp ? 'Send Follow-up' : 'Notify Admin'}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  // ── Main menu ───────────────────────────────────────────────────────────────
  return (
    <ModalShell onClose={onClose} title="Contact / Report">
      <div className="flex flex-col divide-y divide-gray-100">

        {/* Contact Salesperson */}
        <div className="py-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-gray-800">Contact Salesperson</p>
              {job.salesperson_name && (
                <p className="text-xs text-gray-500">{job.salesperson_name}</p>
              )}
              {!hasSalesperson && (
                <p className="text-xs text-gray-400 italic">No contact available</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!hasSalesperson}
              onClick={handleCallSalesperson}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Phone className="w-4 h-4" /> Call
            </button>
            <button
              type="button"
              disabled={!hasSalesperson}
              onClick={handleWhatsAppSalesperson}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-green-700 hover:bg-green-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </button>
          </div>
        </div>

        {/* Contact Warehouse */}
        <div className="py-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-gray-800">Contact Warehouse</p>
              {job.warehouse_contact_name && (
                <p className="text-xs text-gray-500">{job.warehouse_contact_name}</p>
              )}
              {!hasWarehouse && (
                <p className="text-xs text-gray-400 italic">No contact available</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!hasWarehouse}
              onClick={handleCallWarehouse}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Phone className="w-4 h-4" /> Call
            </button>
            <button
              type="button"
              disabled={!hasWarehouse}
              onClick={handleWhatsAppWarehouse}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-green-700 hover:bg-green-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </button>
          </div>
        </div>

        {/* Report to Admin / Follow-up */}
        <div className="pt-3">
          <button
            type="button"
            onClick={() => setView('admin')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
          >
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" />
              <div className="text-left">
                <p className="text-sm font-semibold">
                  {isFollowUp ? 'Add Follow-up Note' : 'Report to Admin'}
                </p>
                <p className="text-xs text-red-600">
                  {isFollowUp ? 'Send another update to the admin team' : 'Notify the operations team with a reason'}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
