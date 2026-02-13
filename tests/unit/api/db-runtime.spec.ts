import { createRequestContext, withRequestContext } from '@/lib/api/context';
import { getDb, MissingRequestDbContextError } from '@/lib/db/runtime';
import { db as serviceDb } from '@/lib/db/service-role';
import { afterEach, describe, expect, it } from 'vitest';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_VITEST_WORKER_ID = process.env.VITEST_WORKER_ID;

function setNonTestRuntime(): void {
  Object.assign(process.env, {
    NODE_ENV: 'development',
    VITEST_WORKER_ID: '',
  });
}

function restoreRuntimeEnv(): void {
  if (ORIGINAL_NODE_ENV === undefined) {
    Reflect.deleteProperty(process.env, 'NODE_ENV');
  } else {
    Object.assign(process.env, { NODE_ENV: ORIGINAL_NODE_ENV });
  }

  if (ORIGINAL_VITEST_WORKER_ID === undefined) {
    Reflect.deleteProperty(process.env, 'VITEST_WORKER_ID');
  } else {
    Object.assign(process.env, {
      VITEST_WORKER_ID: ORIGINAL_VITEST_WORKER_ID,
    });
  }
}

describe('getDb runtime safety', () => {
  afterEach(() => {
    restoreRuntimeEnv();
  });

  it('returns service db in test runtime', () => {
    Object.assign(process.env, { NODE_ENV: 'test' });

    expect(getDb()).toBe(serviceDb);
  });

  it('throws when request context is missing in non-test runtime', () => {
    setNonTestRuntime();

    expect(() => getDb()).toThrow(MissingRequestDbContextError);
  });

  it('returns request-scoped db when context is present in non-test runtime', () => {
    setNonTestRuntime();

    const requestDb = {
      select: () => undefined,
    } as unknown as ReturnType<typeof getDb>;

    const resolvedDb = withRequestContext(
      createRequestContext(
        new Request('http://localhost/runtime-test'),
        undefined,
        requestDb
      ),
      () => getDb()
    );

    expect(resolvedDb).toBe(requestDb);
  });
});
