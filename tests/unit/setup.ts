// Set NODE_ENV to 'test' if not already set
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: 'test' });
}

// Set mock environment variables for consistent unit testing
if (!process.env.DEV_CLERK_USER_ID) {
  Object.assign(process.env, { DEV_CLERK_USER_ID: 'test-user-id' });
}

if (!process.env.MOCK_GENERATION_DELAY_MS) {
  Object.assign(process.env, { MOCK_GENERATION_DELAY_MS: '500' });
}

if (!process.env.MOCK_GENERATION_FAILURE_RATE) {
  Object.assign(process.env, { MOCK_GENERATION_FAILURE_RATE: '0' });
}

// Extend expect with jest-dom matchers
import '@testing-library/jest-dom';

// Import Vitest and RTL hooks
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Run cleanup after each test
afterEach(() => {
  cleanup();
});
