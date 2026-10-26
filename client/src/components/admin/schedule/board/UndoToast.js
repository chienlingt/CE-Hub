import React, { useEffect } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { FOCUS_RING } from '../../../common/tokens';

const UNDO_MS = 8000;

/**
 * A drop saves immediately; this is the way back. Approvals never get one —
 * they write to Odoo — so `onUndo` is omitted for those.
 */
export default function UndoToast({ toast, onUndo, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onDismiss, UNDO_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
    >
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={() => onUndo(toast)}
          className={`inline-flex items-center gap-1 font-semibold text-blue-300 hover:text-blue-200 ${FOCUS_RING}`}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Undo
        </button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className={`text-gray-400 hover:text-white ${FOCUS_RING}`}>
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
