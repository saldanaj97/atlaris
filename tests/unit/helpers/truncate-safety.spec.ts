import { truncateAll } from '@tests/helpers/db/truncate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('assertSafeToTruncate (via truncateAll)', () => {
  let savedUrl: string | undefined;
  let savedAllow: string | undefined;

  beforeEach(() => {
    savedUrl = process.env.DATABASE_URL;
    savedAllow = process.env.ALLOW_DB_TRUNCATE;
    delete process.env.ALLOW_DB_TRUNCATE;
  });

  afterEach(() => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;

    if (savedAllow === undefined) delete process.env.ALLOW_DB_TRUNCATE;
    else process.env.ALLOW_DB_TRUNCATE = savedAllow;
  });

  it('passes when DATABASE_URL is not set', async () => {
    delete process.env.DATABASE_URL;
    // truncateAll calls the mock db.execute, so no real DB is needed
    await expect(truncateAll()).resolves.not.toThrow();
  });

  it('passes when ALLOW_DB_TRUNCATE is true', async () => {
    process.env.DATABASE_URL = 'postgres://host/myapp_prod';
    process.env.ALLOW_DB_TRUNCATE = 'true';
    await expect(truncateAll()).resolves.not.toThrow();
  });

  it('passes for a test-suffixed DB name', async () => {
    process.env.DATABASE_URL = 'postgres://host/postgres_test';
    await expect(truncateAll()).resolves.not.toThrow();
  });

  it('passes for a DB name ending in _tests', async () => {
    process.env.DATABASE_URL = 'postgres://host/myapp_tests';
    await expect(truncateAll()).resolves.not.toThrow();
  });

  it('throws specific message for a non-test DB name', async () => {
    process.env.DATABASE_URL = 'postgres://host/myapp_prod';
    await expect(truncateAll()).rejects.toThrow(
      'Refusing to truncate non-test database "myapp_prod"'
    );
  });

  it('throws for a malformed DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'not-a-valid-url';
    await expect(truncateAll()).rejects.toThrow(
      'invalid DATABASE_URL for safety'
    );
  });

  it('non-test DB error is NOT swallowed into the generic invalid-URL message (regression)', async () => {
    process.env.DATABASE_URL = 'postgres://host/myapp_prod';
    await expect(truncateAll()).rejects.toThrow(
      /Refusing to truncate non-test database/
    );
    await expect(truncateAll()).rejects.not.toThrow(/invalid DATABASE_URL/);
  });
});
