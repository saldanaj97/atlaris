import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import './mocks/shared/google-api.shared';

import { client, isClientInitialized } from '@/lib/db/service-role';
import { Mutex } from 'async-mutex';
import {
  ensureGoogleCalendarSyncState,
  ensureStripeWebhookEvents,
  ensureTaskCalendarEvents,
  resetDbForIntegrationTestFile,
} from './helpers/db';

const skipDbSetup = process.env.SKIP_DB_TEST_SETUP === 'true';

// Log test configuration for debugging
beforeAll(() => {
  if (process.env.USE_LOCAL_NEON === 'true') {
    console.log('[Test Setup] Using LOCAL Neon configuration (Docker Compose)');
  }
});

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
    await resetDbForIntegrationTestFile();
    await ensureStripeWebhookEvents();
    await ensureGoogleCalendarSyncState();
    await ensureTaskCalendarEvents();
  });

  afterEach(() => {
    // Ensure React Testing Library cleans up the DOM between tests
    cleanup();
    releaseDbLock?.();
    releaseDbLock = null;
  });

  afterAll(async () => {
    if (isClientInitialized()) {
      await client.end();
    }
  });
}
