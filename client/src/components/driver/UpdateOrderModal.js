// client/src/components/driver/UpdateOrderModal.js
// A.4.1 / FR-04-001: Driver status update + POD gate for completion.
// When Issue is selected: full issue form. Orders already in Issue open edit-only mode.
import { useState } from 'react';
import { X, Camera, PenLine, CheckCircle, AlertTriangle } from 'lucide-react';
import SignaturePad from './SignaturePad';
import PhotoPicker from './PhotoPicker';
import { allowedTransitions, isTerminal, isIssueEditMode, isScheduledStatus } from '../../utils/driverStatusMap';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

function apiUrl(path) {
  return `${API_BASE.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`;
}

function evidenceUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

const ISSUE_REASONS = [
  'Customer Absent',
  'Installer Absent',
  'Wrong Address',
  'Access Denied',
  'Customer Refused Delivery',
  'Damaged Item',
  'Incorrect Item',
  'Traffic Delay',
  'Vehicle Breakdown',
  'Other',
];

const PRIORITY_LEVELS = [
  { value: 'low',    label: 'Low',    color: 'bg-green-100 text-green-700 border-green-300'    },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'high',   label: 'High',   color: 'bg-red-100 text-red-700 border-red-300'          },
];

/**
 * @param {{
 *   order: object,
 *   employeeId: string,
 *   onClose: () => void,
 *   onSuccess: (result: object) => void,
 * }}
 */
export default function UpdateOrderModal({ order, employeeId, onClose, onSuccess }) {
  const editingIssue  = isIssueEditMode(order.status);
  const transitions   = allowedTransitions(order.status);
  const [selectedStatus, setSelectedStatus] = useState(
    editingIssue ? 'Issue' : (transitions[0] || null)
  );

  // POD state
  const [notes, setNotes]                       = useState('');
  const [photoFiles, setPhotoFiles]             = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [podMode, setPodMode]                   = useState('photo');

  // Issue state — pre-fill when editing an existing issue
  const [issuePriority,   setIssuePriority]   = useState(order.issue_priority_level || 'medium');
  const [issueReason,     setIssueReason]     = useState(order.issue_reason || '');
  const [issueDesc,       setIssueDesc]       = useState(order.issue_desc || '');
  const [issuePhotoFiles, setIssuePhotoFiles] = useState([]);
  const [issuePhotoUrls,  setIssuePhotoUrls]  = useState([]);

  const [submitting,    setSubmitting]    = useState(false);
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const [error,         setError]         = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  const isCompletion = selectedStatus === 'Completed';
  const isIssue        = selectedStatus === 'Issue' || editingIssue;
  const noUpdates      = !editingIssue && transitions.length === 0;

  const podOk = !isCompletion || (
    podMode === 'photo' ? photoFiles.length > 0 : signatureDataUrl !== null
  );

  const issueOk = !isIssue || (
    issueReason &&
    issueDesc.trim().length >= 1 &&
    (editingIssue || issuePhotoFiles.length > 0)
  );

  const canSubmit = !noUpdates && (editingIssue || selectedStatus) && podOk && issueOk && !submitting;

  // ── Photo handlers ──────────────────────────────────────────────────────────
  function addPodPhotos(files) {
    setPhotoFiles(prev => [...prev, ...files]);
    setPhotoPreviewUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  }

  function removePhoto(idx) {
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreviewUrls(prev => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function addIssuePhotos(files) {
    setIssuePhotoFiles(prev => [...prev, ...files]);
    setIssuePhotoUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  }

  function removeIssuePhoto(idx) {
    setIssuePhotoFiles(prev => prev.filter((_, i) => i !== idx));
    setIssuePhotoUrls(prev => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      if (isCompletion) {
        const form = new FormData();
        form.append('employee_id', employeeId || '');
        if (notes) form.append('delivery_notes', notes);
        for (const f of photoFiles) form.append('photos', f);
        if (podMode === 'signature' && signatureDataUrl) {
          form.append('signature_data_url', signatureDataUrl);
        }

        const res = await fetch(apiUrl(`orders/${order.id}/deliver`), {
          method: 'POST',
          headers: { 'ngrok-skip-browser-warning': '1' },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setSuccessResult(data);
        onSuccess(data);

      } else if (isIssue) {
        const form = new FormData();
        form.append('employee_id',          employeeId || '');
        form.append('status',                 'Issue');
        form.append('issue_priority_level',   issuePriority);
        form.append('issue_reason',           issueReason);
        form.append('issue_desc',             issueDesc);
        for (const f of issuePhotoFiles) form.append('files', f);

        const res = await fetch(apiUrl(`driver/jobs/${order.id}/status`), {
          method: 'PUT',
          headers: { 'ngrok-skip-browser-warning': '1' },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setSuccessResult({ issueReported: !editingIssue, issueEdited: editingIssue });
        onSuccess(data);

      } else {
        const form = new FormData();
        form.append('employee_id', employeeId || '');
        form.append('status', selectedStatus);
        if (notes) form.append('delivery_notes', notes);

        const res = await fetch(apiUrl(`driver/jobs/${order.id}/status`), {
          method: 'PUT',
          headers: { 'ngrok-skip-browser-warning': '1' },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setSuccessResult(data);
        onSuccess(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Guard states ────────────────────────────────────────────────────────────
  if (isTerminal(order.status)) {
    return (
      <ModalShell onClose={onClose} title="Order Status">
        <p className="text-center text-gray-500 py-6">This order is complete and cannot be updated.</p>
      </ModalShell>
    );
  }

  if (successResult) {
    const isComp        = !!successResult.final_status;
    const isIssueResult = !!successResult.issueReported;
    const isIssueEdited = !!successResult.issueEdited;
    return (
      <ModalShell onClose={onClose} title={isIssueEdited ? 'Issue Updated' : isIssueResult ? 'Issue Reported' : 'Updated'}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          {isIssueResult || isIssueEdited
            ? <AlertTriangle className="w-12 h-12 text-amber-500" />
            : <CheckCircle className="w-12 h-12 text-green-500" />
          }
          <p className="text-lg font-semibold text-gray-800">
            {isIssueEdited
              ? 'Issue details saved'
              : isIssueResult
                ? 'Issue flagged for review'
                : isComp
                  ? `Order marked as ${successResult.final_status}`
                  : `Status updated to ${selectedStatus}`}
          </p>
          {isComp && (
            <div className="text-sm text-gray-500 space-y-1">
              {successResult.slot_auto_closed && <p>Trip auto-closed ✓</p>}
              {successResult.odoo_enqueued    && <p>Odoo sync queued ✓</p>}
            </div>
          )}
          <button
            onClick={onClose}
            className="mt-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  const savedEvidence = order.issue_evidence || [];

  return (
    <ModalShell onClose={onClose} title={editingIssue ? 'Edit Issue' : 'Update Order'}>
      <div className="flex flex-col gap-4">

        {noUpdates && (
          <p className="text-center text-gray-500 py-4">No updates available for this order.</p>
        )}

        {/* Scheduled orders: departure is via Leave warehouse, not per-order status */}
        {!editingIssue && isScheduledStatus(order.status) && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            {order.all_loaded ? (
              <>
                All items are loaded. Tap <strong>Leave warehouse</strong> at the top of the dashboard to start this trip.
              </>
            ) : order.time_slot_id ? (
              <>
                Waiting for warehouse to load items ({order.loaded_count}/{order.loading_total}).
                Once ready, use <strong>Leave warehouse</strong> to start deliveries.
              </>
            ) : (
              <>
                This order is not on a delivery slot yet. Contact dispatch if you need to start the trip.
              </>
            )}
          </div>
        )}

        {/* Issue edit banner */}
        {editingIssue && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            Current status: <strong>Issue</strong> — update details below.
          </div>
        )}

        {/* Status chips — hidden in issue edit mode */}
        {!editingIssue && !noUpdates && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Select new status</p>
            <div className="flex gap-2 flex-wrap">
              {transitions.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedStatus(s)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors
                    ${selectedStatus === s
                      ? s === 'Issue'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}
                >
                  {s === 'Completed' ? 'Mark as Completed' : s}
                </button>
              ))}
            </div>
          </div>
        )}

        {isCompletion && order.requires_installer && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            This order requires installation. Delivery will be marked <strong>Delivered</strong>; the installation team will follow up.
          </div>
        )}

        {/* ── ISSUE FORM ─────────────────────────────────────────────────── */}
        {isIssue && (
          <div className="border border-red-200 rounded-xl p-4 bg-red-50 space-y-4">
            <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Issue Details
            </p>

            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Priority</p>
              <div className="flex gap-2">
                {PRIORITY_LEVELS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setIssuePriority(p.value)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors
                      ${issuePriority === p.value ? p.color : 'bg-white text-gray-600 border-gray-200'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">
                Reason <span className="text-red-500">*</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ISSUE_REASONS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setIssueReason(r)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors
                      ${issueReason === r
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-red-400'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={issueDesc}
                onChange={e => setIssueDesc(e.target.value)}
                rows={3}
                placeholder="Describe the issue in detail…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-1 focus:ring-red-400 focus:border-red-400 bg-white"
              />
              <p className="text-xs text-gray-400 text-right">{issueDesc.length}/500</p>
            </div>

            {savedEvidence.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Saved photos</p>
                <div className="flex gap-2 flex-wrap">
                  {savedEvidence.map((url, i) => (
                    <img
                      key={i}
                      src={evidenceUrl(url)}
                      alt={`saved-${i}`}
                      className="w-14 h-14 object-cover rounded-md border"
                    />
                  ))}
                </div>
              </div>
            )}

            <PhotoPicker
              label={editingIssue ? 'Add more photos (optional)' : 'Evidence Photos'}
              variant="issue"
              photosRequired={!editingIssue}
              onFilesSelected={addIssuePhotos}
            />
            {issuePhotoUrls.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {issuePhotoUrls.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt={`ev-${i}`} className="w-14 h-14 object-cover rounded-md border" />
                    <button
                      type="button"
                      onClick={() => removeIssuePhoto(i)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── POD section — only for Completed ───────────────────────────── */}
        {isCompletion && (
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">
              Proof of Delivery <span className="text-red-500">*</span>
            </p>
            <p className="text-xs text-gray-500">A photo or customer signature is required.</p>

            <div className="flex rounded-lg overflow-hidden border border-gray-200 w-fit">
              <button
                type="button"
                onClick={() => setPodMode('photo')}
                className={`px-4 py-2 text-sm flex items-center gap-1.5 ${podMode === 'photo' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <Camera className="w-4 h-4" /> Photo
              </button>
              <button
                type="button"
                onClick={() => setPodMode('signature')}
                className={`px-4 py-2 text-sm flex items-center gap-1.5 ${podMode === 'signature' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <PenLine className="w-4 h-4" /> Signature
              </button>
            </div>

            {podMode === 'photo' && (
              <div className="space-y-2">
                <PhotoPicker onFilesSelected={addPodPhotos} label="" photosRequired />
                {photoPreviewUrls.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {photoPreviewUrls.map((url, i) => (
                      <div key={i} className="relative">
                        <img src={url} alt={`proof-${i}`} className="w-16 h-16 object-cover rounded-md border" />
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {podMode === 'signature' && (
              <SignaturePad onCapture={setSignatureDataUrl} />
            )}
          </div>
        )}

        {!isIssue && !noUpdates && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="Add delivery notes…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-400 text-right">{notes.length}/200</p>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
        )}

        {!noUpdates && (
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => setConfirmOpen(true)}
            className={`w-full py-3 font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed ${
              isIssue
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {submitting
              ? 'Saving…'
              : editingIssue
                ? 'Save issue details'
                : isIssue
                  ? 'Report Issue'
                  : isCompletion
                    ? 'Mark as Completed'
                    : `Update to ${selectedStatus}`}
          </button>
        )}
      </div>

      {confirmOpen && (
        <div className="absolute inset-0 bg-black/40 flex items-end justify-center pb-4 px-4 z-10">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <p className="font-semibold text-gray-800 text-center">
              {editingIssue ? 'Save issue details?' : isIssue ? 'Report this issue?' : 'Confirm update?'}
            </p>
            <p className="text-sm text-gray-500 text-center">
              {editingIssue
                ? 'Issue details for this order will be updated.'
                : isIssue
                  ? 'This order will be flagged for operations review.'
                  : isCompletion
                    ? 'This will mark the order as completed and cannot be undone.'
                    : `Order will be moved to "${selectedStatus}".`}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${
                  isIssue ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
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
