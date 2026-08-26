import {
  resolveExternalPostgresUrl,
  waitForPostgres,
} from '@tests/setup/testcontainers';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('external PostgreSQL setup helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers POSTGRES_URL_NON_POOLING over POSTGRES_URL', () => {
    vi.stubEnv(
      'POSTGRES_URL',
      'postgresql://postgres:postgres@127.0.0.1:5432/pooled',
    );
    vi.stubEnv(
      'POSTGRES_URL_NON_POOLING',
      'postgresql://postgres:postgres@127.0.0.1:5432/direct',
    );

    expect(resolveExternalPostgresUrl()).toBe(
      'postgresql://postgres:postgres@127.0.0.1:5432/direct',
    );
  });

  it('falls back to POSTGRES_URL when the non-pooling URL is absent', () => {
    vi.stubEnv(
      'POSTGRES_URL',
      'postgresql://postgres:postgres@localhost:5432/postgres',
    );
    vi.stubEnv('POSTGRES_URL_NON_POOLING', '');

    expect(resolveExternalPostgresUrl()).toBe(
      'postgresql://postgres:postgres@localhost:5432/postgres',
    );
  });

  it('throws when neither PostgreSQL URL is set', () => {
    vi.stubEnv('POSTGRES_URL', '');
    vi.stubEnv('POSTGRES_URL_NON_POOLING', '');

    expect(() => resolveExternalPostgresUrl()).toThrow(
      /POSTGRES_URL or POSTGRES_URL_NON_POOLING/,
    );
  });

  it('refuses a hosted PostgreSQL host', () => {
    vi.stubEnv(
      'POSTGRES_URL',
      'postgresql://postgres:postgres@db.example.com:5432/postgres',
    );
    vi.stubEnv('POSTGRES_URL_NON_POOLING', '');

    expect(() => resolveExternalPostgresUrl()).toThrow(
      /non-local PostgreSQL host/,
    );
  });

  it('times out when PostgreSQL never accepts connections', async () => {
    await expect(
      waitForPostgres('postgresql://postgres:postgres@127.0.0.1:1/postgres', {
        timeoutMs: 400,
        intervalMs: 50,
      }),
    ).rejects.toThrow(/PostgreSQL not ready/);
  });
});
