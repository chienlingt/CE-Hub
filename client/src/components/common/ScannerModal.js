import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Demo barcode / QR scanner modal.
 * Uses html5-qrcode to access the device camera.
 * Calls onScan(scannedValue) when a code is successfully read.
 *
 * For demo purposes: any barcode or QR code will be accepted.
 * In production this would validate against Odoo serial numbers.
 */
export default function ScannerModal({ itemName, productId, onScan, onClose }) {
  const scannerRef   = useRef(null);
  const isRunningRef = useRef(false); // tracks if scanner.start() has been called
  const [status,   setStatus]   = useState('starting');
  const [scanned,  setScanned]  = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [cameras,  setCameras]  = useState([]);
  const [camIndex, setCamIndex] = useState(0);
  const [scanKey,  setScanKey]  = useState(0); // increment to restart scanner

  const safeStop = async () => {
    if (scannerRef.current && isRunningRef.current) {
      try {
        await scannerRef.current.stop();
      } catch { /* already stopped */ }
      isRunningRef.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;

    // Clear container first to prevent duplicate video elements (React StrictMode / rescan)
    const container = document.getElementById('qr-scanner-container');
    if (container) container.innerHTML = '';

    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

        const devices = await Html5Qrcode.getCameras();
        if (!devices?.length) {
          if (!cancelled) { setStatus('error'); setErrorMsg('No camera found on this device.'); }
          return;
        }
        if (!cancelled) setCameras(devices);

        const backCam = devices.find(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        const camId = backCam ? backCam.id : devices[camIndex % devices.length]?.id;

        const formatsToSupport = [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
        ];

        const scanner = new Html5Qrcode('qr-scanner-container', { formatsToSupport, verbose: false });
        scannerRef.current = scanner;

        // Responsive qrbox: narrow height for barcode, width fits screen
        const vw = window.innerWidth;
        const boxW = Math.min(vw - 48, vw < 640 ? 260 : vw < 1024 ? 300 : 320);
        const boxH = 110; // narrow for 1D barcodes; QR also reads in this window

        await scanner.start(
          camId,
          { fps: 10, qrbox: { width: boxW, height: boxH }, aspectRatio: vw < 640 ? 1.5 : 1.7 },
          (decodedText) => {
            if (cancelled) return;
            isRunningRef.current = false;
            scanner.stop().catch(() => {});
            setScanned(decodedText);
            setStatus('success');
          },
          () => { /* per-frame failure — keep trying */ }
        );

        isRunningRef.current = true;
        if (!cancelled) setStatus('scanning');
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(err.message || 'Camera access denied. Please allow camera permission.');
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      safeStop();
      // Clear container so next mount starts fresh
      const el = document.getElementById('qr-scanner-container');
      if (el) el.innerHTML = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camIndex, scanKey]);

  const handleConfirm = () => onScan(scanned);

  const handleRescan = async () => {
    await safeStop();
    setScanned(null);
    setStatus('starting');
    setScanKey(k => k + 1); // triggers useEffect restart
  };

  const switchCamera = async () => {
    await safeStop();
    setStatus('starting');
    setScanned(null);
    setCamIndex(i => (i + 1) % Math.max(cameras.length, 1));
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
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scanner area */}
        <div className="bg-black relative" style={{ minHeight: '280px' }}>
          {/* The scanner renders into this div */}
          <div
            id="qr-scanner-container"
            className="w-full"
            style={{ minHeight: '280px' }}
          />

          {/* Overlay states */}
          {status === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
              <RefreshCw size={28} className="text-white animate-spin mb-2" />
              <p className="text-white text-sm">Starting camera...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
              <CheckCircle size={48} className="text-green-400 mb-3" />
              <p className="text-white font-semibold text-sm mb-1">Barcode Scanned!</p>
              <div className="bg-white/10 rounded-lg px-4 py-2 text-center max-w-[240px]">
                <p className="text-green-300 font-mono text-sm break-all">{scanned}</p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-4">
              <AlertTriangle size={36} className="text-red-400 mb-2" />
              <p className="text-white text-sm text-center">{errorMsg}</p>
            </div>
          )}

          {/* Scanning guide overlay */}
          {status === 'scanning' && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="border-2 border-blue-400 rounded-lg"
                   style={{ width: 240, height: 240, boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }}
              >
                {/* Corner indicators */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                {/* Scan line animation */}
                <div className="absolute left-0 right-0 h-0.5 bg-blue-400 opacity-70 scan-line" />
              </div>
            </div>
          )}
        </div>

        {/* Instruction */}
        {status === 'scanning' && (
          <div className="bg-gray-900 px-4 py-2 text-center">
            <p className="text-gray-300 text-xs">Point camera at item barcode or QR code</p>
          </div>
        )}

        {/* Bottom actions */}
        <div className="p-4 space-y-2">
          {status === 'success' && (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600">
                <span className="font-medium">Scanned serial: </span>
                <span className="font-mono text-blue-700">{scanned}</span>
              </div>
              <button
                onClick={handleConfirm}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                <CheckCircle size={15} className="inline mr-2" />
                Confirm & Mark Item
              </button>
              <button
                onClick={() => { setScanned(null); setStatus('starting'); setCamIndex(i => i); }}
                className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-xl transition-colors"
              >
                Scan Again
              </button>
            </>
          )}

          {status === 'scanning' && cameras.length > 1 && (
            <button
              onClick={switchCamera}
              className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={13} /> Switch Camera
            </button>
          )}

          {status === 'error' && (
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-gray-800 text-white text-sm rounded-xl"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Scan line CSS */}
      <style>{`
        @keyframes scanLine {
          0%   { top: 0; }
          50%  { top: 230px; }
          100% { top: 0; }
        }
        .scan-line { animation: scanLine 2s linear infinite; }
      `}</style>
    </div>
  );
}
