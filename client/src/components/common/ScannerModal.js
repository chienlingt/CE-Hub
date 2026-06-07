import React, { useRef, useState } from 'react';
import { X, Camera, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

// Resize large phone photos so the QR/barcode fills more of the image —
// a 12MP photo where the QR is tiny will fail; 1024px max fixes this.
function preprocessImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1024;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        const ratio = Math.min(MAX / w, MAX / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.filter = 'contrast(1.4) brightness(1.1)'; // helps with dark/glare photos
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => resolve(new File([blob], 'scan.jpg', { type: 'image/jpeg' })),
        'image/jpeg', 0.92
      );
    };
    img.src = url;
  });
}

export default function ScannerModal({ itemName, productId, onScan, onClose }) {
  const galleryInputRef = useRef(null);
  const [status,       setStatus]       = useState('idle');
  const [scanned,      setScanned]      = useState(null);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [preview,      setPreview]      = useState(null);
  const [manualSerial, setManualSerial] = useState('');

  const submitManual = () => {
    const v = manualSerial.trim();
    if (v) onScan(v);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setStatus('processing');
    setErrorMsg('');

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const processed = await preprocessImage(file);
      const scanner   = new Html5Qrcode('qr-file-container');
      const result    = await scanner.scanFile(processed, false);
      scanner.clear();
      setScanned(result);
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMsg('No QR code or barcode detected. Make sure the QR code fills most of the frame and try again.');
    }

    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleRetry = () => {
    setStatus('idle');
    setScanned(null);
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="bg-gray-900 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Camera size={16} className="text-white" />
              <span className="text-white font-semibold text-sm">Scan Item Barcode</span>
            </div>
            <p className="text-gray-400 text-xs mt-0.5 truncate max-w-[220px]">{itemName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Image / state area */}
        <div className="bg-black relative" style={{ minHeight: '200px' }}>
          {/* Hidden container required by html5-qrcode scanFile */}
          <div id="qr-file-container" style={{ display: 'none' }} />

          {preview ? (
            <img src={preview} alt="captured" className="w-full object-contain" style={{ maxHeight: '300px' }} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <Camera size={44} className="text-gray-500" />
              <p className="text-gray-400 text-sm">Tap the button below to open your camera and photograph the barcode or QR code</p>
            </div>
          )}

          {status === 'processing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
              <RefreshCw size={28} className="text-white animate-spin mb-2" />
              <p className="text-white text-sm">Reading barcode...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
              <CheckCircle size={48} className="text-green-400 mb-3" />
              <p className="text-white font-semibold text-sm mb-1">Barcode Scanned!</p>
              <div className="bg-white/10 rounded-lg px-4 py-2 text-center max-w-[240px]">
                <p className="text-green-300 font-mono text-sm break-all">{scanned}</p>
              </div>
            </div>
          )}

          {status === 'error' && preview && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 px-6 text-center">
              <AlertTriangle size={36} className="text-red-400 mb-2" />
              <p className="text-white text-sm">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="p-4 space-y-2">
          {/* no capture — lets user pick from camera or photo library */}
          <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          {status === 'idle' && (
            <>
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Camera size={16} /> Open Camera
              </button>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="flex-1 h-px bg-gray-200" /> or enter manually <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualSerial}
                  onChange={e => setManualSerial(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitManual()}
                  placeholder="Enter serial number…"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={submitManual}
                  disabled={!manualSerial.trim()}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-colors"
                >
                  ✓
                </button>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600">
                <span className="font-medium">Scanned: </span>
                <span className="font-mono text-blue-700">{scanned}</span>
              </div>
              <button
                onClick={() => onScan(scanned)}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                <CheckCircle size={15} className="inline mr-2" />
                Confirm & Mark Item
              </button>
              <button
                onClick={handleRetry}
                className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-xl transition-colors"
              >
                Scan Again
              </button>
            </>
          )}

          {status === 'error' && (
            <button
              onClick={handleRetry}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Camera size={16} /> Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
