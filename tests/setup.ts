// IMPORTANT: Set NODE_ENV before any other imports to prevent loading wrong .env file
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: 'test' });
}

import { afterAll, afterEach, beforeEach } from 'vitest';

import { client } from '@/lib/db/drizzle';
import { truncateAll } from './helpers/db';

if (!process.env.DEV_CLERK_USER_ID) {
  Object.assign(process.env, { DEV_CLERK_USER_ID: 'test-user-id' });
}

if (!process.env.MOCK_GENERATION_DELAY_MS) {
  Object.assign(process.env, { MOCK_GENERATION_DELAY_MS: '500' });
}

if (!process.env.MOCK_GENERATION_FAILURE_RATE) {
  Object.assign(process.env, { MOCK_GENERATION_FAILURE_RATE: '0' });
}

// const testDbUser = process.env.TEST_DB_USER || 'test_user';
// const testDbPass = process.env.TEST_DB_PASS || 'test_pass';
// Object.assign(process.env, {
//   DATABASE_URL: `postgresql://${testDbUser}:${testDbPass}@127.0.0.1:54322/postgres`,
// });

const skipDbSetup = process.env.SKIP_DB_TEST_SETUP === 'true';

import { Mutex } from 'async-mutex';

const dbLock = new Mutex();
let releaseDbLock: (() => void) | null = null;

if (!skipDbSetup) {
  beforeEach(async () => {
    releaseDbLock = await dbLock.acquire();
    await truncateAll();
  });

  afterEach(() => {
    releaseDbLock?.();
    releaseDbLock = null;
  });

  afterAll(async () => {
    await client.end();
  });
}
