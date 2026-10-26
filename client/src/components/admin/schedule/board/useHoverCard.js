import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hover-intent for a pointer-only preview card. Opens after `openDelay`, stays
 * open while the pointer travels from the trigger into the card, and never
 * opens for touch or pen — those users tap, which opens the drawer instead.
 *
 * @returns {{ open, anchorRect, triggerProps, cardProps, close }}
 */
export default function useHoverCard({ openDelay = 250, closeDelay = 120, disabled = false } = {}) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);

  const clear = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => clear, [clear]);
  useEffect(() => { if (disabled) { clear(); setOpen(false); } }, [disabled, clear]);

  const close = useCallback(() => { clear(); setOpen(false); }, [clear]);

  const scheduleClose = useCallback(() => {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), closeDelay);
  }, [closeDelay]);

  const onPointerEnter = useCallback((event) => {
    if (disabled || event.pointerType !== 'mouse') return;
    clear();
    const target = event.currentTarget;
    openTimer.current = setTimeout(() => {
      setAnchorRect(target.getBoundingClientRect());
      setOpen(true);
    }, openDelay);
  }, [disabled, openDelay, clear]);

  return {
    open,
    anchorRect,
    close,
    triggerProps: {
      onPointerEnter,
      onPointerLeave: scheduleClose,
      // A press is the start of a click or a drag; either way the preview goes.
      onPointerDown: close,
    },
    cardProps: {
      onPointerEnter: () => clearTimeout(closeTimer.current),
      onPointerLeave: scheduleClose,
    },
  };
}
