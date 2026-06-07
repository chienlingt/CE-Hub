// client/src/components/driver/DeliveryEvidenceModal.js
// View and append POD evidence on completed/delivered orders.
import { useState } from 'react';
import { X, Camera, PenLine, CheckCircle, ExternalLink } from 'lucide-react';
import PhotoPicker from './PhotoPicker';
import SignaturePad from './SignaturePad';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

function apiUrl(path) {
  return `${API_BASE.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`;
}

function evidenceUrl(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

/**
 * @param {{
 *   order: object,
 *   onClose: () => void,
 *   onSuccess: () => void,
 * }}
 */
export default function DeliveryEvidenceModal({ order, onClose, onSuccess }) {
  const savedPhotos = order.delivery_evidence || [];
  const savedSignature = order.proof_of_delivery_url || null;
  const initialNotes = order.delivery_notes || '';

  const [notes, setNotes] = useState(initialNotes);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [podMode, setPodMode] = useState('photo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const notesChanged = notes !== initialNotes;
  const hasNewPhotos = photoFiles.length > 0;
  const hasNewSignature = signatureDataUrl !== null;
  const canSave = (notesChanged || hasNewPhotos || hasNewSignature) && !submitting;

  function addPodPhotos(files) {
    setPhotoFiles(prev => [...prev, ...files]);
    setPhotoPreviewUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  }

  function removeNewPhoto(idx) {
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreviewUrls(prev => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      if (notesChanged) form.append('delivery_notes', notes);
      for (const f of photoFiles) form.append('photos', f);
      if (hasNewSignature) form.append('signature_data_url', signatureDataUrl);

      const res = await fetch(apiUrl(`driver/jobs/${order.id}/delivery-evidence`), {
        method: 'PUT',
        headers: { 'ngrok-skip-browser-warning': '1' },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSaved(true);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (saved) {
    return (
      <ModalShell onClose={onClose} title="Delivery Evidence">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <CheckCircle className="w-12 h-12 text-green-500" />
          <p className="text-lg font-semibold text-gray-800">Evidence saved</p>
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

  const hasSavedEvidence = savedPhotos.length > 0 || savedSignature;

  return (
    <ModalShell onClose={onClose} title="Delivery Evidence">
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Order marked as <strong>{order.status}</strong> — view saved POD or add more evidence below.
        </div>

        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Saved proof of delivery</p>
          {!hasSavedEvidence ? (
            <p className="text-sm text-gray-400">No POD captured yet.</p>
          ) : (
            <div className="space-y-3">
              {savedPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {savedPhotos.map((url, i) => (
                    <a
                      key={i}
                      href={evidenceUrl(url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative group"
                      title="Open full size"
                    >
                      <img
                        src={evidenceUrl(url)}
                        alt={`pod-${i + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border hover:border-blue-400"
                      />
                      <span className="absolute bottom-1 right-1 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    </a>
                  ))}
                </div>
              )}
              {savedSignature && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Customer signature</p>
                  <a href={evidenceUrl(savedSignature)} target="_blank" rel="noopener noreferrer">
                    <img
                      src={evidenceUrl(savedSignature)}
                      alt="signature"
                      className="h-24 border rounded-lg bg-white p-1 hover:border-blue-400"
                    />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Add or update</p>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Delivery notes</label>
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

          <div className="flex rounded-lg overflow-hidden border border-gray-200 w-fit">
            <button
              type="button"
              onClick={() => setPodMode('photo')}
              className={`px-4 py-2 text-sm flex items-center gap-1.5 ${podMode === 'photo' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <Camera className="w-4 h-4" /> Add photos
            </button>
            <button
              type="button"
              onClick={() => setPodMode('signature')}
              className={`px-4 py-2 text-sm flex items-center gap-1.5 ${podMode === 'signature' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <PenLine className="w-4 h-4" /> New signature
            </button>
          </div>

          {podMode === 'photo' && (
            <div className="space-y-2">
              <PhotoPicker onFilesSelected={addPodPhotos} label="" photosRequired={false} />
              {photoPreviewUrls.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {photoPreviewUrls.map((url, i) => (
                    <div key={i} className="relative">
                      <img src={url} alt={`new-${i}`} className="w-16 h-16 object-cover rounded-md border" />
                      <button
                        type="button"
                        onClick={() => removeNewPhoto(i)}
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
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Capturing a new signature replaces the saved one.</p>
              <SignaturePad onCapture={setSignatureDataUrl} />
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
        )}

        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="w-full py-3 font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
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
