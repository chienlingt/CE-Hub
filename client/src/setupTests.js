// Jest setup for react-scripts. Registers @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveClass, ...). The package was already a dependency
// but this file was missing, so the matchers were never actually available.
import '@testing-library/jest-dom';

// jsdom does not implement matchMedia.
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
