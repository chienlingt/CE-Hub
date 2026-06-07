// client/src/components/driver/SignaturePad.js
// Simple canvas-based signature capture for FR-04-003 POD requirement.
import { useRef, useEffect, useState } from 'react';

/**
 * @param {{ onCapture: (dataUrl: string|null) => void }}
 */
export default function SignaturePad({ onCapture }) {
  const canvasRef   = useRef(null);
  const drawing     = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas  = canvasRef.current;
    if (!canvas) return;
    const ctx     = canvas.getContext('2d');
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const src  = e.touches ? e.touches[0] : e;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }

    function start(e) {
      e.preventDefault();
      drawing.current = true;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }

    function move(e) {
      if (!drawing.current) return;
      e.preventDefault();
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      setIsEmpty(false);
    }

    function end() { drawing.current = false; }

    canvas.addEventListener('mousedown',  start);
    canvas.addEventListener('mousemove',  move);
    canvas.addEventListener('mouseup',    end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove',  move,  { passive: false });
    canvas.addEventListener('touchend',   end);

    return () => {
      canvas.removeEventListener('mousedown',  start);
      canvas.removeEventListener('mousemove',  move);
      canvas.removeEventListener('mouseup',    end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove',  move);
      canvas.removeEventListener('touchend',   end);
    };
  }, []);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onCapture(null);
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    const dataUrl = canvas.toDataURL('image/png');
    onCapture(dataUrl);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white w-full">
        <canvas
          ref={canvasRef}
          width={320}
          height={150}
          className="w-full touch-none"
          style={{ cursor: 'crosshair' }}
        />
      </div>
      <p className="text-xs text-gray-500">Sign above with your finger or mouse</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={clear}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={isEmpty}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40"
        >
          Use Signature
        </button>
      </div>
    </div>
  );
}
