// Jest setup for react-scripts. Registers @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveClass, ...). The package was already a dependency
// but this file was missing, so the matchers were never actually available.
import '@testing-library/jest-dom';

// jsdom implements neither ResizeObserver nor matchMedia, both of which real
// browsers provide. recharts' ResponsiveContainer constructs a ResizeObserver
// on mount, so without this stub any test that renders a chart throws.
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
