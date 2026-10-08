import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestPlanRegeneration: vi.fn(),
  baseDeps: { dbClient: {}, marker: 'default-deps' },
  runtime: { value: 'vercel' as 'vercel' | 'cloudflare' },
}));

vi.mock('@/features/plans/regeneration-orchestration/request', () => ({
  requestPlanRegeneration: mocks.requestPlanRegeneration,
}));

vi.mock('@/features/plans/regeneration-orchestration/deps', () => ({
  createDefaultRegenerationOrchestrationDeps: vi.fn(() => mocks.baseDeps),
}));

vi.mock('@/lib/config/env/jobs-worker', () => ({
  jobsWorkerEnv: {
    get regenerationRuntime() {
      return mocks.runtime.value;
    },
  },
}));

vi.mock('@/lib/posthog-server', () => ({
  captureAfterResponse: vi.fn(),
}));

vi.mock('@/lib/api/request-boundary', async () => {
  const { withErrorBoundary } = await vi.importActual<
    typeof import('@/lib/api/route-wrappers')
  >('@/lib/api/route-wrappers');

  return {
    requestBoundary: {
      route: (
        _options: unknown,
        handler: (scope: {
          req: Request;
          params: Record<string, string>;
          actor: { id: string; subscriptionTier: 'pro' };
          db: unknown;
          correlationId: string;
        }) => Promise<Response>,
      ) =>
        withErrorBoundary((req) =>
          handler({
            req,
            params: { planId: PLAN_ID },
            actor: { id: 'user-1', subscriptionTier: 'pro' },
            db: {},
            correlationId: 'test-correlation-id',
          }),
        ),
    },
  };
});

const PLAN_ID = '0c834f38-e9e1-4c7d-bdc0-2e28c505256a';

import { POST } from '@/app/api/v1/plans/[planId]/regenerate/route';
import { dispatchRegenerationToWorker } from '@/features/jobs/regeneration-dispatch';

function regenerate(): Promise<Response> {
  return POST(
    new Request(`http://localhost/api/v1/plans/${PLAN_ID}/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  );
}

describe('POST /api/v1/plans/:planId/regenerate runtime selection', () => {
  beforeEach(() => {
    mocks.requestPlanRegeneration.mockReset();
    mocks.requestPlanRegeneration.mockResolvedValue({
      kind: 'enqueued',
      jobId: 'job-1',
      planId: PLAN_ID,
      status: 'pending',
      planGenerationRateLimit: {
        remaining: 4,
        limit: 10,
        reset: 1_700_000_000,
      },
    });
  });

  it('keeps the Vercel workflow path by default (no dispatch)', async () => {
    mocks.runtime.value = 'vercel';

    const response = await regenerate();

    expect(response.status).toBe(202);
    const [, deps] = mocks.requestPlanRegeneration.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(deps).toBe(mocks.baseDeps);
    expect(deps).not.toHaveProperty('dispatch');
  });

  it('hands the job to the jobs Worker when REGENERATION_RUNTIME=cloudflare', async () => {
    mocks.runtime.value = 'cloudflare';

    const response = await regenerate();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      planId: PLAN_ID,
      jobId: 'job-1',
      status: 'pending',
    });
    const [, deps] = mocks.requestPlanRegeneration.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(deps).toEqual({
      ...mocks.baseDeps,
      dispatch: dispatchRegenerationToWorker,
    });
  });
});
