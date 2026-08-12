import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
  };

  return {
    assertInternalWorkerAccess: vi.fn(),
    checkIpRateLimit: vi.fn(),
    drainRegenerationQueue: vi.fn(),
    getLoggingRequestContext: vi.fn(),
    logger,
  };
});

vi.mock('@/features/jobs/regeneration-worker', () => ({
  drainRegenerationQueue: mocks.drainRegenerationQueue,
}));

vi.mock('@/lib/api/internal/internal-worker-access', () => ({
  assertInternalWorkerAccess: mocks.assertInternalWorkerAccess,
}));

vi.mock('@/lib/api/ip-rate-limit', () => ({
  checkIpRateLimit: mocks.checkIpRateLimit,
}));

vi.mock('@/lib/config/env', async (importOriginal) => ({
  ...(await importOriginal()),
  regenerationQueueEnv: {
    enabled: true,
    maxJobsPerDrain: 3,
    workerToken: 'test-only-worker-token',
  },
}));

vi.mock('@/lib/logging/request-context', () => ({
  getLoggingRequestContext: mocks.getLoggingRequestContext,
}));

import { POST } from '@/app/api/internal/jobs/regeneration/process/route';

describe('POST /api/internal/jobs/regeneration/process', () => {
  beforeEach(() => {
    mocks.assertInternalWorkerAccess.mockReset();
    mocks.checkIpRateLimit.mockReset();
    mocks.drainRegenerationQueue.mockReset();
    mocks.getLoggingRequestContext.mockReset();
    mocks.logger.error.mockReset();
    mocks.logger.info.mockReset();
    mocks.drainRegenerationQueue.mockResolvedValue({
      processedCount: 2,
      completedCount: 1,
      failedCount: 1,
    });
    mocks.getLoggingRequestContext.mockReturnValue({ logger: mocks.logger });
  });

  it('authorizes a configured worker request and forwards its bounded drain limit', async () => {
    const request = new Request(
      'http://localhost/api/internal/jobs/regeneration/process',
      {
        method: 'POST',
        headers: {
          'x-regeneration-worker-token': 'test-only-worker-token',
        },
      },
    );

    const response = await POST(request);

    expect(mocks.assertInternalWorkerAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        request,
        pathname: '/api/internal/jobs/regeneration/process',
        enabled: true,
        workerToken: 'test-only-worker-token',
        headerName: 'x-regeneration-worker-token',
      }),
    );
    expect(mocks.drainRegenerationQueue).toHaveBeenCalledWith({ maxJobs: 3 });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      processedCount: 2,
      completedCount: 1,
      failedCount: 1,
    });
  });
});
