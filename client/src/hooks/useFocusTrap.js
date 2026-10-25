import { useCallback, useEffect, useRef } from 'react';

// Focus containment for dialogs and drawers. This is the one capability a
// headless UI library (Radix et al.) would genuinely have given us — at ~40
// lines it did not justify adding a second styling idiom to the codebase.

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @param {boolean} active
 * @param {() => void} [onEscape]
 * @returns {React.RefObject} attach to the dialog container
 */
export default function useFocusTrap(active, onEscape) {
  const containerRef = useRef(null);
  const previouslyFocused = useRef(null);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;

    const nodes = containerRef.current?.querySelectorAll(FOCUSABLE);
    if (!nodes?.length) return;

    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const activeEl = document.activeElement;

    if (event.shiftKey && activeEl === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeEl === last) {
      event.preventDefault();
      first.focus();
    }
  }, [onEscape]);

  useEffect(() => {
    if (!active) return undefined;

    previouslyFocused.current = document.activeElement;

    // Focus the first control, falling back to the container itself so the
    // Escape handler still receives keys in an empty dialog.
    const node = containerRef.current;
    const firstFocusable = node?.querySelector(FOCUSABLE);
    (firstFocusable ?? node)?.focus?.({ preventScroll: true });

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // Return focus to whatever opened the dialog.
      previouslyFocused.current?.focus?.({ preventScroll: true });
    };
  }, [active, handleKeyDown]);

  return containerRef;
}
