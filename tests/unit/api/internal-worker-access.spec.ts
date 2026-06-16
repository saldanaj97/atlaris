import { AuthError, ServiceUnavailableError } from '@/lib/api/errors';
import {
  assertInternalWorkerAccess,
  assertMaintenanceWorkerAccess,
} from '@/lib/api/internal/internal-worker-access';
import { createLogger } from '@/lib/logging/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';

function createAccessArgs(
  overrides: Partial<Parameters<typeof assertInternalWorkerAccess>[0]> = {},
) {
  return {
    request: new Request('http://localhost/api/internal/worker', {
      method: 'POST',
    }),
    pathname: '/api/internal/worker',
    logger: createLogger({ requestId: 'test-request' }),
    enabled: true,
    workerToken: undefined,
    headerName: 'x-worker-token',
    unavailableMessage: 'Worker is unavailable.',
    unauthorizedLogMessage: 'Unauthorized worker trigger attempt',
    missingWorkerTokenLogMessage: 'Worker token missing in production',
    ...overrides,
  };
}

describe('assertInternalWorkerAccess', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when the feature is disabled', () => {
    expect(() =>
      assertInternalWorkerAccess(createAccessArgs({ enabled: false })),
    ).toThrow(ServiceUnavailableError);
  });

  it('throws when a configured token is missing', () => {
    expect(() =>
      assertInternalWorkerAccess(
        createAccessArgs({ workerToken: 'configured-secret' }),
      ),
    ).toThrow(AuthError);
  });

  it('accepts a matching bearer token', () => {
    expect(() =>
      assertInternalWorkerAccess(
        createAccessArgs({
          workerToken: 'configured-secret',
          request: new Request('http://localhost/api/internal/worker', {
            method: 'POST',
            headers: { authorization: 'Bearer configured-secret' },
          }),
        }),
      ),
    ).not.toThrow();
  });

  it('rejects production requests when no worker token is configured', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => assertInternalWorkerAccess(createAccessArgs())).toThrow(
      ServiceUnavailableError,
    );
  });

  it('allows non-production requests when no worker token is configured', () => {
    vi.stubEnv('NODE_ENV', 'test');

    expect(() => assertInternalWorkerAccess(createAccessArgs())).not.toThrow();
  });
});

function createMaintenanceAccessArgs(
  overrides: Partial<Parameters<typeof assertMaintenanceWorkerAccess>[0]> = {},
) {
  return {
    request: new Request(
      'http://localhost/api/internal/maintenance/plans/cleanup',
      {
        method: 'POST',
      },
    ),
    pathname: '/api/internal/maintenance/plans/cleanup',
    logger: createLogger({ requestId: 'test-request' }),
    enabled: true,
    unavailableMessage: 'Plan cleanup is currently unavailable.',
    unauthorizedLogMessage: 'Unauthorized plan cleanup trigger attempt',
    ...overrides,
  };
}

describe('assertMaintenanceWorkerAccess', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubGlobal('window', undefined);
  });

  it('returns 503 path when cleanup is enabled but maintenance token is missing in production', () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PLAN_CLEANUP_ENABLED', 'true');

    expect(() =>
      assertMaintenanceWorkerAccess(createMaintenanceAccessArgs()),
    ).toThrow(ServiceUnavailableError);
  });

  it('allows non-production requests when cleanup is enabled without a maintenance token', () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PLAN_CLEANUP_ENABLED', 'true');

    expect(() =>
      assertMaintenanceWorkerAccess(createMaintenanceAccessArgs()),
    ).not.toThrow();
  });
});
