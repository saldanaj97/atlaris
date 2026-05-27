import { AuthError, ServiceUnavailableError } from '@/lib/api/errors';
import { assertInternalWorkerAccess } from '@/lib/api/internal/internal-worker-access';
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
