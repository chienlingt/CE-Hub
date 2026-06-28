// client/src/components/driver/FailDeliveryModal.js
// A.5.1 — Driver failure confirmation modal.
// Separate from UpdateOrderModal (Issue path). Calls PATCH /api/orders/:id/issue
// with confirm_failure: true per partner A6 documentation.
import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import PhotoPicker from './PhotoPicker';
import { FAILURE_REASONS, FAILURE_REASON_STYLES } from '../../utils/failureReasons';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

function apiUrl(path) {
  return `${API_BASE.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`;
}

const ITEM_STATUS_OPTIONS = [
  { value: 'delivered', label: 'Delivered', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'failed',    label: 'Failed',    color: 'bg-red-100 text-red-700 border-red-200'     },
];

/**
 * @param {{
 *   order: object,
 *   employeeId: string,
 *   onClose: () => void,
 *   onSuccess: (order: object) => void,
 * }}
 */
export default function FailDeliveryModal({ order, employeeId, onClose, onSuccess }) {
  const [reason,       setReason]       = useState('');
  const [desc,         setDesc]         = useState('');
  const [photoFiles,   setPhotoFiles]   = useState([]);
  const [photoUrls,    setPhotoUrls]    = useState([]);
  const [items,        setItems]        = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState(null);
  const [confirmOpen,  setConfirmOpen]  = useState(false);

  // Load order products
  useEffect(() => {
    fetch(apiUrl(`order-products?order_id=${order.id}`))
      .then(r => r.json())
      .then(data => {
        const filtered = Array.isArray(data)
          ? data.filter(p => p.order_id === order.id)
          : [];
        setItems(filtered.map(p => ({ ...p, outcome: 'failed' })));
      })
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false));
  }, [order.id]);

  function handlePhotoFiles(files) {
    setPhotoFiles(prev => [...prev, ...files]);
    const urls = files.map(f => URL.createObjectURL(f));
    setPhotoUrls(prev => [...prev, ...urls]);
  }

  function removePhoto(idx) {
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx));
    setPhotoUrls(prev => prev.filter((_, i) => i !== idx));
  }

  function setItemOutcome(itemId, outcome) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, outcome } : i));
  }

  const allItemsClassified = items.length > 0 && items.every(i =>
    i.outcome === 'delivered' || i.outcome === 'failed'
  );

  const descRequired = reason === 'Other';

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('confirm_failure', 'true');
      formData.append('issue_reason', reason);
      formData.append('issue_desc', desc);
      formData.append('issue_status', 'open');
      if (employeeId) formData.append('employee_id', employeeId);
      formData.append(
        'order_products_status',
        JSON.stringify(items.map(i => ({ id: i.id, item_delivery_status: i.outcome })))
      );
      photoFiles.forEach(f => formData.append('files', f));

      const res = await fetch(apiUrl(`orders/${order.id}/issue`), {
        method: 'PATCH',
        body:   formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to confirm delivery failure');
        setSubmitting(false);
        setConfirmOpen(false);
        return;
      }

      onSuccess(data.order);
    } catch (e) {
      setError(e.message || 'Network error');
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  const canSubmit = reason && (!descRequired || desc.trim().length > 0) && allItemsClassified;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mt-10 mb-10">

        {/* Header */}
        <div className="px-5 py-4 bg-red-50 border-b border-red-200 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-base font-bold text-gray-900">Confirm Failed Delivery</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-red-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Customer */}
          <div className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">
            <p className="font-medium text-gray-900">{order.customer_name || 'Customer'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{order.address || 'No address'}</p>
          </div>

          {/* Failure reason (FR-05-001) */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Failure reason <span className="text-red-500">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {FAILURE_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`text-xs font-medium px-3 py-2.5 rounded-lg border text-left transition-all ${
                    reason === r
                      ? FAILURE_REASON_STYLES[r] + ' ring-2 ring-offset-1 ring-current'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1.5">
              Description {descRequired ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(optional)</span>}
            </label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder={descRequired ? 'Please describe why the delivery failed…' : 'Describe what happened (optional)…'}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>

          {/* Evidence photos */}
          <div>
            <PhotoPicker
              onFilesSelected={handlePhotoFiles}
              label="Evidence photos"
              variant="issue"
              photosRequired
            />
            {photoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {photoUrls.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Item outcomes */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Item outcomes <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(all items required)</span>
            </p>
            {loadingItems ? (
              <p className="text-xs text-gray-400">Loading items…</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-gray-400">No items found</p>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-800 font-medium truncate flex-1">
                      {item.products?.product_name || item.product_name || `Item ${item.id}`}
                    </p>
                    <div className="flex gap-1 shrink-0">
                      {ITEM_STATUS_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setItemOutcome(item.id, opt.value)}
                          className={`text-xs px-2 py-1 rounded border font-medium transition-all ${
                            item.outcome === opt.value
                              ? opt.color + ' ring-1 ring-current'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          {!confirmOpen ? (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={!canSubmit}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Confirm Failed Delivery
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-red-800">This action cannot be undone.</p>
              <p className="text-xs text-red-600">
                Order will be marked as <strong>Failed</strong> and notifications will be sent to admins and the customer.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmOpen(false)}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Submitting…
                    </>
                  ) : 'Yes, Confirm Failure'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
