import { vi } from 'vitest';

// Set NODE_ENV to 'test' if not already set
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: 'test' });
}

// Prevent unit tests from importing a real DB client.
// This avoids requiring DATABASE_URL in unit test runs and catches accidental DB usage.
vi.mock('@/lib/db/service-role', () => {
  return {
    client: { end: vi.fn() },
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
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

// Provide OAuth encryption key for token encryption tests (64-char hex for AES-256)
if (!process.env.OAUTH_ENCRYPTION_KEY) {
  Object.assign(process.env, {
    OAUTH_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });
}

// Extend expect with jest-dom matchers
import '@testing-library/jest-dom';

// Provide React global for JSX runtime in tests
import React from 'react';

// Import Vitest and RTL hooks
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Make React available as a global for classic JSX runtime
(globalThis as typeof globalThis & { React?: typeof React }).React ??= React;

// Run cleanup after each test
afterEach(() => {
  cleanup();
});
