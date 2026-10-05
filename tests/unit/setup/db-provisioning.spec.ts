import {
  createAdminDatabaseUrl,
  createDatabaseUrl,
  getBaseDbName,
  getTemplateDbName,
  getTestcontainersEnvFile,
  getWorkerDbName,
  isPreviousRunDatabase,
  normalizeWorkerId,
} from '@tests/setup/db-provisioning';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('db provisioning helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses deterministic database names', () => {
    expect(getBaseDbName()).toBe('atlaris_test_base');
    expect(getTemplateDbName()).toBe('atlaris_test_template');
    expect(getWorkerDbName('2')).toBe('atlaris_test_w2');
  });

  it('falls back to worker 1 when the pool id is absent', () => {
    expect(normalizeWorkerId(undefined)).toBe('1');
    expect(getWorkerDbName(undefined)).toBe('atlaris_test_w1');
  });

  it('derives worker and admin URLs from the container URL', () => {
    const containerUrl =
      'postgresql://postgres:secret@127.0.0.1:5432/atlaris_runtime?sslmode=disable';

    expect(createDatabaseUrl(containerUrl, 'atlaris_test_w1')).toBe(
      'postgresql://postgres:secret@127.0.0.1:5432/atlaris_test_w1?sslmode=disable',
    );
    expect(createAdminDatabaseUrl(containerUrl)).toBe(
      'postgresql://postgres:secret@127.0.0.1:5432/postgres?sslmode=disable',
    );
  });

  it('selects only base, template, and worker databases for the pre-run drop', () => {
    expect(
      [
        'atlaris_test_base',
        'atlaris_test_template',
        'atlaris_test_w1',
        'atlaris_test_w12',
        'atlaris_test_smoke',
        'atlaris_test_wx',
        'atlaris_test_base_old',
        'postgres',
      ].filter(isPreviousRunDatabase),
    ).toEqual([
      'atlaris_test_base',
      'atlaris_test_template',
      'atlaris_test_w1',
      'atlaris_test_w12',
    ]);
  });

  it('uses a per-run runtime-state file when configured', () => {
    vi.stubEnv(
      'TESTCONTAINERS_ENV_FILE',
      '/tmp/testcontainers-env.integration-run.json',
    );

    expect(getTestcontainersEnvFile()).toBe(
      '/tmp/testcontainers-env.integration-run.json',
    );
  });
});
