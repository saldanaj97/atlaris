import { createMaintenanceEnvForTests } from '@/lib/config/env/maintenance';
import { EnvValidationError } from '@/lib/config/env/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

function readWorkerHealthTokenSafely(
  readToken: () => string | undefined,
): string | undefined {
  try {
    return readToken();
  } catch (error) {
    if (
      error instanceof EnvValidationError &&
      error.envKey === 'WORKER_HEALTH_TOKEN'
    ) {
      return undefined;
    }
    throw error;
  }
}

describe('worker health token resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubGlobal('window', undefined);
  });

  it('returns undefined when WORKER_HEALTH_TOKEN is missing in production', () => {
    vi.stubGlobal('window', undefined);
    const maintenance = createMaintenanceEnvForTests({
      NODE_ENV: 'production',
    });

    expect(
      readWorkerHealthTokenSafely(() => maintenance.workerHealthToken),
    ).toBe(undefined);
  });

  it('rethrows unrelated env validation errors', () => {
    vi.stubGlobal('window', undefined);
    const maintenance = createMaintenanceEnvForTests({
      NODE_ENV: 'production',
      PLAN_CLEANUP_ENABLED: 'true',
    });

    expect(() =>
      readWorkerHealthTokenSafely(() => maintenance.workerToken),
    ).toThrow(EnvValidationError);
  });
});
