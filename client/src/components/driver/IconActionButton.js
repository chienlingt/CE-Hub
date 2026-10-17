import { useEffect, useId, useRef, useState } from 'react';

export default function IconActionButton({ label, onClick, disabled, color, children }) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();
  const timer = useRef(null);
  const dismiss = useRef(null);
  const held = useRef(false);
  const start = useRef(null);
  function clearTimer() { clearTimeout(timer.current); }
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(dismiss.current); }, []);

  return <span className="relative inline-flex shrink-0"
    onPointerEnter={event => { if (event.pointerType === 'mouse') setVisible(true); }}
    onPointerLeave={() => { clearTimer(); setVisible(false); }}>
    <button type="button" aria-label={label} aria-describedby={visible ? tooltipId : undefined} disabled={disabled}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={event => {
        held.current = false;
        start.current = { x: event.clientX, y: event.clientY };
        clearTimeout(dismiss.current);
        if (event.pointerType !== 'mouse') {
          clearTimer();
          timer.current = setTimeout(() => { held.current = true; setVisible(true); }, 500);
        }
      }}
      onPointerMove={event => {
        if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) clearTimer();
      }}
      onPointerUp={() => {
        clearTimer();
        if (held.current) dismiss.current = setTimeout(() => setVisible(false), 1800);
      }}
      onPointerCancel={() => { clearTimer(); held.current = false; setVisible(false); }}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setVisible(true); }}
      onBlur={() => { clearTimer(); setVisible(false); }}
      onClick={event => {
        if (held.current) { event.preventDefault(); held.current = false; return; }
        onClick?.();
      }}
      className={`inline-flex h-10 w-9 items-center justify-center rounded-lg sm:h-11 sm:w-11 [&>svg]:h-5 [&>svg]:w-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-30 ${color}`}>
      {children}
    </button>
    {visible && <span id={tooltipId} role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-lg">{label}</span>}
  </span>;
}
