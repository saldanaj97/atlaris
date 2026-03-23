import { Mutex } from 'async-mutex';
import { afterEach, beforeEach } from 'vitest';

import {
  ensureGoogleCalendarSyncState,
  ensureStripeWebhookEvents,
  ensureTaskCalendarEvents,
  resetDbForIntegrationTestFile,
} from '../helpers/db';

const skipDbSetup = process.env.SKIP_DB_TEST_SETUP === 'true';
const dbLock = new Mutex();
let releaseDbLock: (() => void) | null = null;

if (!skipDbSetup) {
  beforeEach(async () => {
    releaseDbLock = await dbLock.acquire();
    try {
      await resetDbForIntegrationTestFile();
      await ensureStripeWebhookEvents();
      await ensureGoogleCalendarSyncState();
      await ensureTaskCalendarEvents();
    } catch (error) {
      releaseDbLock?.();
      releaseDbLock = null;
      throw error;
    }
  });

  afterEach(() => {
    releaseDbLock?.();
    releaseDbLock = null;
  });
}
