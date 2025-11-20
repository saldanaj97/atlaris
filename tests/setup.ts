import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeEach } from 'vitest';
import './mocks/google-api';

import { client } from '@/lib/db/service-role';
import { Mutex } from 'async-mutex';
import {
  ensureGoogleCalendarSyncState,
  ensureJobTypeEnumValue,
  ensureNotionSyncState,
  ensureStripeWebhookEvents,
  ensureTaskCalendarEvents,
  truncateAll,
} from './helpers/db';

// Set encryption key for OAuth token crypto in tests (64 hex chars = 32 bytes)
if (!process.env.OAUTH_ENCRYPTION_KEY) {
  Object.assign(process.env, {
    OAUTH_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });
}

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
    await ensureStripeWebhookEvents();
    await ensureNotionSyncState();
    await ensureGoogleCalendarSyncState();
    await ensureTaskCalendarEvents();
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
