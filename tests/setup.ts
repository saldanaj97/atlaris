// IMPORTANT: Set NODE_ENV before any other imports to prevent loading wrong .env file
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: 'test' });
}

import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

import { client } from '@/lib/db/service-role';
import { Mutex } from 'async-mutex';
import {
  ensureJobTypeEnumValue,
  ensureNotionSyncStateTable,
  ensureGoogleCalendarSyncStateTable,
  ensureTaskCalendarEventsTable,
  ensureStripeWebhookEventsTable,
  truncateAll,
} from './helpers/db';

if (!process.env.DEV_CLERK_USER_ID) {
  Object.assign(process.env, { DEV_CLERK_USER_ID: 'test-user-id' });
}

if (!process.env.AI_PROVIDER) {
  Object.assign(process.env, { AI_PROVIDER: 'mock' });
}

if (!process.env.MOCK_GENERATION_DELAY_MS) {
  Object.assign(process.env, { MOCK_GENERATION_DELAY_MS: '100' });
}

if (!process.env.MOCK_GENERATION_FAILURE_RATE) {
  Object.assign(process.env, { MOCK_GENERATION_FAILURE_RATE: '0' });
}

if (!process.env.MOCK_GENERATION_SEED) {
  Object.assign(process.env, { MOCK_GENERATION_SEED: '12345' });
}

// Set encryption key for OAuth token crypto in tests (64 hex chars = 32 bytes)
if (!process.env.OAUTH_ENCRYPTION_KEY) {
  Object.assign(process.env, {
    OAUTH_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });
}

// Mock Google API rate limiter to prevent real API calls in tests
// unless explicitly overridden by individual tests
vi.mock('@/lib/utils/google-api-rate-limiter', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/utils/google-api-rate-limiter')
  >();

  return {
    ...actual,
    fetchGoogleApi: vi.fn(async (url: string | URL) => {
      // Return mock responses for Google API endpoints
      const urlString = url.toString();

      // Mock YouTube search API
      if (urlString.includes('youtube/v3/search')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: { videoId: 'mock-video-1' },
                snippet: {
                  title: 'Mock YouTube Video',
                  channelTitle: 'Mock Channel',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Mock YouTube videos API
      if (urlString.includes('youtube/v3/videos')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'mock-video-1',
                statistics: { viewCount: '10000' },
                snippet: { publishedAt: new Date().toISOString() },
                contentDetails: { duration: 'PT10M' },
                status: { privacyStatus: 'public', embeddable: true },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Mock Google Custom Search API
      if (urlString.includes('customsearch/v1')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                link: 'https://example.com/docs',
                title: 'Mock Documentation',
                snippet: 'Mock documentation snippet',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Default mock response for unknown endpoints
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  };
});

const skipDbSetup = process.env.SKIP_DB_TEST_SETUP === 'true';

function assertSafeToTruncate() {
  const url = process.env.DATABASE_URL;
  if (!url) return; // Already handled earlier in the process

  // Explicit override allows truncation anywhere (use with care, e.g., CI)
  if (process.env.ALLOW_DB_TRUNCATE === 'true') return;

  try {
    const parsed = new URL(url);
    const dbName = parsed.pathname.replace(/^\//, '');
    // Heuristic: only allow truncation for DB names that indicate test usage
    const looksLikeTestDb =
      /(^|_)(test|tests)$/.test(dbName) || /_test$/.test(dbName);
    if (!looksLikeTestDb) {
      throw new Error(
        `Refusing to truncate non-test database "${dbName}". ` +
          'Use a dedicated test DB (e.g., "postgres_test") or set ALLOW_DB_TRUNCATE=true.'
      );
    }
  } catch {
    // If URL parsing fails, be safe and refuse truncation
    throw new Error(
      'Refusing to truncate database: invalid DATABASE_URL for safety. ' +
        'Set a valid test DB URL or ALLOW_DB_TRUNCATE=true.'
    );
  }
}

const dbLock = new Mutex();
let releaseDbLock: (() => void) | null = null;

if (!skipDbSetup) {
  beforeEach(async () => {
    assertSafeToTruncate();
    releaseDbLock = await dbLock.acquire();
    await ensureJobTypeEnumValue();
    await ensureStripeWebhookEventsTable();
    await ensureNotionSyncStateTable();
    await ensureGoogleCalendarSyncStateTable();
    await ensureTaskCalendarEventsTable();
    await truncateAll();
  });

  afterEach(() => {
    // Ensure React Testing Library cleans up the DOM between tests
    cleanup();
    releaseDbLock?.();
    releaseDbLock = null;
  });

  afterAll(async () => {
    await client.end();
  });
}
