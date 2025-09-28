import { afterAll, afterEach, beforeEach } from 'vitest';

import { client } from '@/lib/db/drizzle';
import { truncateAll } from './helpers/db';

if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: 'test' });
}

if (!process.env.DEV_CLERK_USER_ID) {
  Object.assign(process.env, { DEV_CLERK_USER_ID: 'test-user-id' });
}

const skipDbSetup = process.env.SKIP_DB_TEST_SETUP === 'true';

class AsyncLock {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return this.createRelease();
    }

    return await new Promise<() => void>((resolve) => {
      this.queue.push(() => resolve(this.createRelease()));
    });
  }

  private createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release();
    };
  }

  private release() {
    const next = this.queue.shift();
    if (next) {
      next();
      return;
    }
    this.locked = false;
  }
}

const dbLock = new AsyncLock();
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
