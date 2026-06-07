// client/src/components/driver/OrderTaskCard.js
import { Phone, MessageCircle, RefreshCw, Flag, MapPin, User, Clock, Image, Package } from 'lucide-react';
import { statusBadge, isTerminal, isCompletedEvidenceMode, isScheduledStatus } from '../../utils/driverStatusMap';
import { callCustomer, openWhatsApp } from '../../utils/phoneHelpers';
import { onTheWayTemplate } from '../../utils/templateMessages';

/**
 * @param {{
 *   job: object,
 *   onUpdate: (job: object) => void,
 *   onReport: (job: object) => void,
 *   onViewEvidence: (job: object) => void,
 * }}
 */
export default function OrderTaskCard({ job, onUpdate, onReport, onViewEvidence }) {
  const badge        = statusBadge(job.status);
  const terminal     = isTerminal(job.status);
  const showEvidence = isCompletedEvidenceMode(job.status);
  const isEscalation = job.issue_reason === 'Driver Escalation';
  // Report is always enabled for escalations (driver can add follow-ups).
  // For non-escalation cases, disable once complaint submitted.
  const reportDisabled = job.is_complaint_submitted && !isEscalation;

  // Option A: loading badge — only shown on Scheduled-tab orders
  const showLoadingBadge = isScheduledStatus(job.status) && job.loading_total > 0;
  const loadingReady     = job.all_loaded;

  // const shortId   = job.id?.slice(0, 8).toUpperCase();
  const shortId = job.id?.toUpperCase();
  // const shortId = job.odoo_order_ref?.toUpperCase();
  const timeLabel = job.time
    ? new Date(job.time).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';

  function handleCall() {
    callCustomer(job.customer_phone);
  }

  function handleChat() {
    const msg = onTheWayTemplate(shortId, job.address);
    openWhatsApp(job.customer_phone, msg);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 font-mono truncate">#{shortId}</p>
          {/* TODO: Add a link to the Odoo order */}
          <p className="text-xs text-gray-400 font-mono truncate">Odoo Order ref: {job.odoo_order_ref}</p>
          <p className="font-semibold text-gray-900 truncate">{job.product || 'Unknown Product'}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
            {badge.label}
          </span>
          {showLoadingBadge && (
            loadingReady ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                <Package className="w-3 h-3" />
                Ready
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                <Package className="w-3 h-3" />
                {job.loaded_count}/{job.loading_total} loaded
              </span>
            )
          )}
        </div>
      </div>

      {/* Customer */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <User className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="truncate">{job.customer_name || '—'}</span>
        {timeLabel && (
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-400 shrink-0">
            <Clock className="w-3 h-3" /> {timeLabel}
          </span>
        )}
      </div>

      {/* Address */}
      {job.address && (
        <div className="flex items-start gap-2 text-sm text-gray-500">
          <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <span className="leading-tight line-clamp-2">{job.address}</span>
        </div>
      )}

      {/* Action row */}
      <div className="flex gap-2 pt-1">
        {/* Communication */}
        <button
          onClick={handleCall}
          disabled={!job.customer_phone}
          title="Call customer"
          className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
        >
          <Phone className="w-4 h-4" />
        </button>
        <button
          onClick={handleChat}
          disabled={!job.customer_phone}
          title="WhatsApp customer"
          className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-green-600 hover:bg-green-50 disabled:opacity-30"
        >
          <MessageCircle className="w-4 h-4" />
        </button>

        <div className="flex-1" />

        {/* Report — contact/escalation menu */}
        <button
          onClick={() => onReport(job)}
          disabled={reportDisabled}
          title={reportDisabled ? 'Already escalated to admin' : isEscalation ? 'Contact or add follow-up' : 'Contact or report'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Flag className="w-3.5 h-3.5" />
          {isEscalation ? 'Follow-up' : 'Report'}
        </button>

        {showEvidence ? (
          <button
            onClick={() => onViewEvidence(job)}
            title="View or edit proof of delivery"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Image className="w-3.5 h-3.5" />
            POD
          </button>
        ) : (
          <button
            onClick={() => onUpdate(job)}
            disabled={terminal}
            title={terminal ? 'Order is complete' : 'Update status'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Update
          </button>
        )}
      </div>
    </div>
  );
}
