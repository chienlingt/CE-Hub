import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import useFocusTrap from '../../../../hooks/useFocusTrap';
import { FOCUS_RING } from '../../../common/tokens';

/**
 * Centred dialog with a focus trap, Escape to close and a sticky footer.
 * zIndex sits above SlideOver (z-50), because the impact check can open from
 * the session panel.
 */
export default function FleetDialog({ open, title, subtitle, onClose, footer, children, maxWidth = 'max-w-2xl' }) {
  const trapRef = useFocusTrap(open, onClose);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open) return null;
  const titleId = 'fleet-dialog-title';

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 sm:py-10">
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex w-full ${maxWidth} flex-col rounded-lg bg-white shadow-xl`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`-m-1 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 ${FOCUS_RING}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-5 px-5 py-4">{children}</div>
        {footer && <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
