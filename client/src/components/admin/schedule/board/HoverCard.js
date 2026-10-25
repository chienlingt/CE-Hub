import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 6;
const MARGIN = 8;

/**
 * A floating preview anchored to a trigger's rect. Portalled to <body> so the
 * Board's scroll container never clips it; flips above the trigger when there
 * is no room below, and clamps inside the viewport.
 */
export default function HoverCard({ open, anchorRect, width = 320, cardProps, children, label }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRect || !ref.current) return;
    const height = ref.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const below = anchorRect.bottom + GAP;
    const top = below + height > vh - MARGIN && anchorRect.top - GAP - height > MARGIN
      ? anchorRect.top - GAP - height
      : Math.min(below, vh - MARGIN - height);
    const left = Math.max(MARGIN, Math.min(anchorRect.left, vw - MARGIN - width));
    setPos({ top: Math.max(MARGIN, top), left });
  }, [open, anchorRect, width]);

  if (!open || !anchorRect) return null;

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      aria-label={label}
      {...cardProps}
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
      className="z-50 rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-700 shadow-lg"
    >
      {children}
    </div>,
    document.body,
  );
}
