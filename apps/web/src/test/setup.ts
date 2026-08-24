/**
 * Vitest setup for the web app. Adds jest-dom matchers, axe matchers, and the
 * browser APIs jsdom does not implement but the component tree touches on mount.
 */
import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(axeMatchers);

// motion/react and the responsive shell read this on first render.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Scrolling. jsdom defines `window.scrollTo` only so that calling it throws
// "Not implemented" onto stderr, and omits `scrollIntoView` entirely, so both
// are replaced rather than guarded. Any component that puts the reader
// somewhere on navigation touches one of them on mount; the alternative is
// optional-calling a method that exists in every real browser.
window.scrollTo = (() => {}) as typeof window.scrollTo;
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Radix Toast's swipe handler uses Pointer Capture. Browsers provide all
// three methods; jsdom currently provides none, so a normal userEvent click
// otherwise throws after the action has already succeeded.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
