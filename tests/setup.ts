import { afterAll, beforeEach } from 'vitest';

import { client } from '@/lib/db/drizzle';
import { truncateAll } from './helpers/db';

if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: 'test' });
}

if (!process.env.DEV_CLERK_USER_ID) {
  Object.assign(process.env, { DEV_CLERK_USER_ID: 'test-user-id' });
}

const skipDbSetup = process.env.SKIP_DB_TEST_SETUP === 'true';

if (!skipDbSetup) {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await client.end();
  });
}
