import { beforeEach } from 'vitest';
import { waitForInlineRegenerationDrains } from '@/features/jobs/regeneration-worker';

import { resetDbForIntegrationTestFile } from '../helpers/db/reset';
import { ensureStripeWebhookEvents } from '../helpers/db/schema-fixups';

const skipDbSetup = process.env.SKIP_DB_TEST_SETUP === 'true';

if (!skipDbSetup) {
  beforeEach(async () => {
    await waitForInlineRegenerationDrains();
    await resetDbForIntegrationTestFile();
    await ensureStripeWebhookEvents();
  });
}
