import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, CheckCircle, AlertTriangle, RefreshCw, Upload } from 'lucide-react';

const LIVE_SCANNER_ID = 'live-barcode-scanner';

// Reads the EXIF orientation tag (1-8) from a JPEG's binary header.
// Resolves to 1 (normal) if not a JPEG or no orientation tag is present.
// Phones often store photos with a rotation FLAG rather than physically
// rotating the pixels — drawing the raw bytes straight to canvas (as we do
// below) ignores that flag, so a barcode that looks upright on the phone
// screen can land sideways in the image the decoder actually sees.
// Screenshots never carry this flag, which is why they always worked.
function getExifOrientation(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target.result);
        if (view.getUint16(0, false) !== 0xFFD8) { resolve(1); return; }

        const length = view.byteLength;
        let offset = 2;

        while (offset < length) {
          const marker = view.getUint16(offset, false);
          offset += 2;

          if (marker === 0xFFE1) {
            if (view.getUint32(offset + 2, false) !== 0x45786966) { resolve(1); return; }
            const tiffOffset = offset + 8;
            const little = view.getUint16(tiffOffset, false) === 0x4949;
            const firstIFDOffset = view.getUint32(tiffOffset + 4, little);
            const dirStart = tiffOffset + firstIFDOffset;
            const numEntries = view.getUint16(dirStart, little);

            for (let i = 0; i < numEntries; i++) {
              const entryOffset = dirStart + 2 + i * 12;
              if (view.getUint16(entryOffset, little) === 0x0112) {
                resolve(view.getUint16(entryOffset + 8, little));
                return;
              }
            }
            resolve(1);
            return;
          } else if ((marker & 0xFF00) !== 0xFF00) {
            break;
          } else {
            offset += view.getUint16(offset, false);
          }
        }
      } catch {
        // malformed/partial header — fall through to default
      }
      resolve(1);
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file.slice(0, 256 * 1024));
  });
}

// Draws img onto a new canvas, rotated/flipped so EXIF orientation 1-8
// always comes out upright. Canvas dimensions are swapped for the four
// orientations that are actually a 90°-rotated capture (5-8).
function correctOrientation(img, orientation) {
  const swap = orientation >= 5 && orientation <= 8;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width  = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d');

  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: break; // 1 — already upright, no transform needed
  }

  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

// Resize large phone photos so the barcode fills more of the image —
// a 12MP photo where the barcode is tiny will fail to decode. 1600px max
// keeps decoding fast while preserving enough barcode detail for photos
// taken at a normal distance (raised from 1024px, which was shrinking real
// printed barcodes below a reliably-decodable size).
async function preprocessImage(file) {
  const orientation = await getExifOrientation(file);

  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((resolve, reject) => {
    img.onload  = resolve;
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);

  const upright = correctOrientation(img, orientation);

  const MAX = 1600;
  let w = upright.width;
  let h = upright.height;
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
  ctx.drawImage(upright, 0, 0, w, h);

  return new Promise((resolve) => {
    canvas.toBlob(
      blob => resolve(new File([blob], 'scan.jpg', { type: 'image/jpeg' })),
      'image/jpeg', 0.92
    );
  });
}

export default function ScannerModal({ itemName, productId, onScan, onClose }) {
  const galleryInputRef = useRef(null);
  const html5QrRef      = useRef(null); // live-scan instance, while status === 'live'
  const [status,       setStatus]       = useState('idle'); // idle | live | processing | success | error
  const [scanned,      setScanned]      = useState(null);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [preview,      setPreview]      = useState(null);
  const [manualSerial, setManualSerial] = useState('');

  const stopLiveScan = async () => {
    if (html5QrRef.current) {
      try { await html5QrRef.current.stop(); } catch { /* already stopped */ }
      try { html5QrRef.current.clear(); } catch { /* ignore */ }
      html5QrRef.current = null;
    }
  };

  // Runs the live camera scan loop while status === 'live'; tears the camera
  // down the moment status changes away from 'live' (success, cancel, unmount).
  useEffect(() => {
    if (status !== 'live') return;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ];
        const scanner = new Html5Qrcode(LIVE_SCANNER_ID, { formatsToSupport, verbose: false });
        if (cancelled) return;
        html5QrRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 12, qrbox: { width: 280, height: 130 } },
          (decodedText) => {
            setScanned(decodedText);
            setStatus('success');
            stopLiveScan();
          },
          () => { /* per-frame decode miss while aiming — expected, ignore */ }
        );
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(
            /permission/i.test(err?.message || '')
              ? 'Camera permission denied. Allow camera access, or upload a photo instead.'
              : 'Could not start the camera. Try uploading a photo instead.'
          );
          setStatus('error');
        }
      }
    })();

    return () => { cancelled = true; stopLiveScan(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Safety net — stop the camera if the modal unmounts mid-scan.
  useEffect(() => () => { stopLiveScan(); }, []);

  const submitManual = () => {
    const v = manualSerial.trim();
    if (v) onScan(v);
  };

  const handleClose = async () => {
    await stopLiveScan();
    onClose();
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
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Image / camera / state area */}
        <div className="bg-black relative" style={{ minHeight: '240px' }}>
          {/* Hidden container required by html5-qrcode scanFile */}
          <div id="qr-file-container" style={{ display: 'none' }} />

          {status === 'live' && (
            <div id={LIVE_SCANNER_ID} className="w-full" />
          )}

          {status !== 'live' && (preview ? (
            <img src={preview} alt="captured" className="w-full object-contain" style={{ maxHeight: '300px' }} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <Camera size={44} className="text-gray-500" />
              <p className="text-gray-400 text-sm">Scan live with your camera, or upload a photo</p>
            </div>
          ))}

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

          {status === 'error' && (
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
                onClick={() => { setErrorMsg(''); setStatus('live'); }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Camera size={16} /> Scan Live
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Upload size={16} /> Upload Photo / Screenshot
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

          {status === 'live' && (
            <button
              onClick={handleRetry}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl transition-colors"
            >
              Cancel
            </button>
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
