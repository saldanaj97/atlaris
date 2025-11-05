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

// Provide required curation envs for unit tests
if (!process.env.YOUTUBE_API_KEY) {
  Object.assign(process.env, { YOUTUBE_API_KEY: 'test-yt-api-key' });
}

// Provide optional Google CSE credentials to exercise CSE code path when mocked
if (!process.env.GOOGLE_CSE_ID) {
  Object.assign(process.env, { GOOGLE_CSE_ID: 'cse-id' });
}
if (!process.env.GOOGLE_CSE_KEY) {
  Object.assign(process.env, { GOOGLE_CSE_KEY: 'cse-key' });
}

// Provide OAuth encryption key for token encryption tests (64-char hex for AES-256)
if (!process.env.OAUTH_ENCRYPTION_KEY) {
  Object.assign(process.env, {
    OAUTH_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });
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
