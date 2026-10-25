import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import useFocusTrap from '../../hooks/useFocusTrap';
import { FOCUS_RING } from './tokens';

// The responsive drawer shell. Lifted from the pattern already proven in
// admin/liveOps/TripDetailDrawer.js — full-screen on mobile, a fixed-width
// right panel on desktop — so the exception and config drawers don't invent a
// third drawer idiom alongside common/Modal.js and the driver modals' local
// ModalShell.

export default function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  width = 'sm:w-[720px]',
  footer = null,
  children,
}) {
  const trapRef = useFocusTrap(open, onClose);

  // Don't let the page behind scroll while the drawer owns the screen.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
        tabIndex={-1}
      />

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex h-full w-full flex-col bg-white shadow-xl ${width}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`-m-1 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 ${FOCUS_RING}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>

        {footer && (
          <div className="border-t border-gray-200 px-4 py-3 pb-safe">{footer}</div>
        )}
      </div>
    </div>
  );
}
