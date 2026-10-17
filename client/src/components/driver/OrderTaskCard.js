// client/src/components/driver/OrderTaskCard.js
import { Phone, MessageCircle, Flag, MapPin, User, Clock, Package, Navigation } from 'lucide-react';
import { statusBadge, isTerminal, isCompletedEvidenceMode, isScheduledStatus, DELIVERING_STATUSES } from '../../utils/driverStatusMap';
import { callCustomer, openWhatsApp } from '../../utils/phoneHelpers';
import { onTheWayTemplate } from '../../utils/templateMessages';
import IconActionButton from './IconActionButton';

/**
 * @param {{
 *   job: object,
 *   onUpdate: (job: object) => void,
 *   onReport: (job: object) => void,
 *   onViewEvidence: (job: object) => void,
 *   onFail: (job: object) => void,
 * }}
 */
export default function OrderTaskCard({ job, onUpdate, onReport, onViewEvidence, onFail, summary = false, onNavigate, children }) {
  const badge        = statusBadge(job.status);
  const terminal     = isTerminal(job.status);
  const showEvidence = isCompletedEvidenceMode(job.status);
  const isScheduled  = isScheduledStatus(job.status);
  // Report button is always enabled — first report or follow-up via ContactReportModal
  // Show "Mark as Failed" only when the driver is actively delivering this order
  const canFail = DELIVERING_STATUSES.includes(job.status);
  // Hide Update button on Scheduled/Loaded; Update only useful while Delivering/In Progress
  const showUpdate = !isScheduled && !terminal && !showEvidence;

  // Option A: loading badge — only shown on Scheduled-tab orders
  const showLoadingBadge = isScheduledStatus(job.status) && job.loading_total > 0;
  const loadingReady     = job.all_loaded;

  const shortId = job.odoo_order_ref?.toUpperCase() || 'Not Synced';
  const timeLabel = job.time
    ? new Date(job.time).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';

  const productItems = Array.isArray(job.products) && job.products.length
    ? job.products
    : (job.product || 'Unknown Product').split(',').map((name) => name.trim()).filter(Boolean);

  function handleCall() {
    callCustomer(job.customer_phone);
  }

  function handleChat() {
    const orderRef = job.odoo_order_ref || 'Not Synced';
    const msg = onTheWayTemplate({
      customerName: job.customer_name,
      orderRef,
      slotDate: job.slot_date || job.assigned_date,
      timeWindow: job.appointment_window,
      address: job.address,
    });
    openWhatsApp(job.customer_phone, msg);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {summary && <p className="mb-1 text-base font-semibold text-gray-900">{job.customer_name || 'Customer'}</p>}
          <p className="text-xs text-gray-400 font-mono truncate">{shortId}</p>
          {job.appointment_window && (
            <p className="text-xs text-indigo-600 font-medium flex items-center gap-1 mt-0.5 truncate">
              <Clock className="w-3 h-3 shrink-0" />
              {job.appointment_window}
            </p>
          )}
          {!summary && <ul className="mt-0.5 space-y-0.5 text-sm font-semibold text-gray-900 list-disc list-inside">
            {productItems.map((name, index) => (
              <li key={index} className="leading-snug">{name}</li>
            ))}
          </ul>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
            {job.status === 'Failed' ? 'Failed' : badge.label}
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
      {!summary && <div className="flex items-center gap-2 text-sm text-gray-600">
        <User className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="truncate">{job.customer_name || '—'}</span>
        {timeLabel && (
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-400 shrink-0">
            <Clock className="w-3 h-3" /> {timeLabel}
          </span>
        )}
      </div>}

      {/* Address */}
      {(job.address || onNavigate) && (
        <div className="flex items-start gap-2 text-sm text-gray-500">
          <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <span className={`min-w-0 flex-1 leading-5 ${summary ? '' : 'line-clamp-2'}`}>{job.address || 'Address unavailable'}</span>
        </div>
      )}

      {children}

      <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
        <div className="grid grid-flow-col auto-cols-fr gap-2 [&>span]:min-w-0 [&>span>button]:w-full">
          <IconActionButton label="Call customer" onClick={handleCall} disabled={!job.customer_phone} color="bg-sky-50 text-sky-700 hover:bg-sky-100">
            <Phone className="h-4 w-4" />
          </IconActionButton>
          <IconActionButton label="WhatsApp customer" onClick={handleChat} disabled={!job.customer_phone} color="bg-green-50 text-green-700 hover:bg-green-100">
            <MessageCircle className="h-4 w-4" />
          </IconActionButton>
          <IconActionButton label={job.is_complaint_submitted ? 'Follow-up' : 'Report'} onClick={() => onReport(job)} color="bg-amber-50 text-amber-700 hover:bg-amber-100">
            <Flag className="h-4 w-4" />
          </IconActionButton>
          {onNavigate && <IconActionButton label="Navigate" onClick={onNavigate} color="bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
            <Navigation className="h-4 w-4" />
          </IconActionButton>}
        </div>
        <div className="grid grid-flow-col auto-cols-fr gap-2 empty:hidden">
          {canFail && <button type="button" onClick={() => onFail(job)} title="Mark as failed delivery" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100">Failed</button>}
          {showEvidence
            ? <button type="button" onClick={() => onViewEvidence(job)} title="View or edit proof of delivery" className="min-h-9 rounded-lg bg-green-600 px-2 text-[11px] font-semibold text-white hover:bg-green-700 sm:px-3 sm:text-xs">POD</button>
            : showUpdate ? <button type="button" onClick={() => onUpdate(job)} title="Update status" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">Update</button> : null}
        </div>
      </div>
    </div>
  );
}
