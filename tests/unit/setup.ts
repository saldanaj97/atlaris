// Import centralized test env defaults first
import '../setup/test-env';

import { vi } from 'vitest';

// Set NODE_ENV to 'test' if not already set
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: 'test' });
}

// Prevent unit tests from importing a real DB client.
// This avoids requiring DATABASE_URL in unit test runs and catches accidental DB usage.
vi.mock('@/lib/db/service-role', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/service-role')>();

  const crud = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  };

  return {
    ...actual,
    client: { end: vi.fn() },
    db: {
      ...crud,
      transaction: vi.fn((fn: (tx: typeof crud) => Promise<unknown>) =>
        fn({ ...crud }),
      ),
      query: {
        learningPlans: {
          findFirst: vi.fn(),
        },
      },
    },
    serviceRoleDb: {
      select: vi.fn(),
      insert: vi.fn(),
    },
  };
});

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
