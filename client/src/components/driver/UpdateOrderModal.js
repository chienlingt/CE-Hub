// client/src/components/driver/UpdateOrderModal.js
// A.4.1 / FR-04-001: Driver status update + POD gate for completion.
// Issue reporting is now via the Report button (ContactReportModal).
// Mark as Failed is now via the Failed button (FailDeliveryModal).
import { useEffect, useRef, useState } from 'react';
import { X, Camera, PenLine, CheckCircle } from 'lucide-react';
import SignaturePad from './SignaturePad';
import PhotoPicker from './PhotoPicker';
import { allowedTransitions, isTerminal } from '../../utils/driverStatusMap';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

function apiUrl(path) {
  return `${API_BASE.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`;
}

/**
 * @param {{
 *   order: object,
 *   employeeId: string,
 *   onClose: () => void,
 *   onSuccess: (result: object) => void,
 * }}
 */
export default function UpdateOrderModal({ order, employeeId, onClose, onSuccess }) {
  const transitions    = allowedTransitions(order.status);
  const [selectedStatus, setSelectedStatus] = useState(transitions[0] || null);

  // POD state
  const [notes, setNotes]                       = useState('');
  const [photoFiles, setPhotoFiles]             = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [podMode, setPodMode]                   = useState('photo');

  const [submitting,    setSubmitting]    = useState(false);
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const [error,         setError]         = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  // Location — captured best-effort on modal open
  const locationRef = useRef(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { locationRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }; },
      () => { /* silently ignore — location is optional */ },
      { timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  const isCompletion = selectedStatus === 'Delivered';
  const noUpdates    = transitions.length === 0;

  const podOk    = !isCompletion || (
    podMode === 'photo' ? photoFiles.length > 0 : signatureDataUrl !== null
  );
  const canSubmit = !noUpdates && !!selectedStatus && podOk && !submitting;

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

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      const loc = locationRef.current;
      if (isCompletion) {
        const form = new FormData();
        form.append('employee_id', employeeId || '');
        if (notes) form.append('delivery_notes', notes);
        for (const f of photoFiles) form.append('photos', f);
        if (podMode === 'signature' && signatureDataUrl) {
          form.append('signature_data_url', signatureDataUrl);
        }
        if (loc) {
          form.append('latitude',  String(loc.latitude));
          form.append('longitude', String(loc.longitude));
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

      } else {
        const form = new FormData();
        form.append('employee_id', employeeId || '');
        form.append('status', selectedStatus);
        if (notes) form.append('delivery_notes', notes);
        if (loc) {
          form.append('latitude',  String(loc.latitude));
          form.append('longitude', String(loc.longitude));
        }

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
    const isComp = !!successResult.final_status;
    return (
      <ModalShell onClose={onClose} title="Updated">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <CheckCircle className="w-12 h-12 text-green-500" />
          <p className="text-lg font-semibold text-gray-800">
            {isComp
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

  return (
    <ModalShell onClose={onClose} title="Update Order">
      <div className="flex flex-col gap-4">

        {noUpdates && (
          <p className="text-center text-gray-500 py-4">No updates available for this order.</p>
        )}

        {/* Status chips */}
        {!noUpdates && (
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
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
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

        {!noUpdates && (
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
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting
              ? 'Saving…'
              : isCompletion
                ? 'Mark as Delivered'
                : `Update to ${selectedStatus}`}
          </button>
        )}
      </div>

      {confirmOpen && (
        <div className="absolute inset-0 bg-black/40 flex items-end justify-center pb-4 px-4 z-10">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <p className="font-semibold text-gray-800 text-center">Confirm update?</p>
            <p className="text-sm text-gray-500 text-center">
              {isCompletion
                ? 'This will mark the order as delivered and cannot be undone.'
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
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
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
