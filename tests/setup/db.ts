import { beforeEach } from 'vitest';
import { waitForInlineRegenerationDrains } from '@/features/jobs/regeneration-worker';

import {
  ensureStripeWebhookEvents,
  resetDbForIntegrationTestFile,
} from '../helpers/db';

const skipDbSetup = process.env.SKIP_DB_TEST_SETUP === 'true';

if (!skipDbSetup) {
  beforeEach(async () => {
    await waitForInlineRegenerationDrains();
    await resetDbForIntegrationTestFile();
    await ensureStripeWebhookEvents();
  });
}
