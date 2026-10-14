// jsdom setup for the `unit-dom` project (.spec.tsx). The shared env and
// module mocks come first so they are registered before any DOM helpers load.
import './setup.node';

// Shim DOM methods missing in jsdom (required by Radix UI primitives)
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== 'function') {
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}

// Charts measure container size via ResizeObserver (not provided by jsdom).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}

    unobserve() {}

    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Extend expect with jest-dom matchers
import '@testing-library/jest-dom';

// Import Vitest and RTL hooks
import { cleanup } from '@testing-library/react';
// Provide React global for JSX runtime in tests
import React from 'react';
import { afterEach } from 'vitest';

// Make React available as a global for classic JSX runtime
(globalThis as typeof globalThis & { React?: typeof React }).React ??= React;

// Run cleanup after each test
afterEach(() => {
  cleanup();
});
