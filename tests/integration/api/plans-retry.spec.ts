import {
  createRetryHandler,
  POST,
} from '@/app/api/v1/plans/[planId]/retry/route';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle';
import { generationAttempts } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { seedFailedAttemptsForDurableWindow } from '../../fixtures/attempts';
import { createPlanForRetryTest } from '../../fixtures/plans';
import { setTestUser } from '../../helpers/auth';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';
import { readStreamingResponse } from '../../helpers/streaming';

type RetryAttemptOverrides = Partial<
  Omit<typeof generationAttempts.$inferInsert, 'planId'>
>;

type CreateTestPlanWithAttemptOptions = {
  userId: string;
  planOverrides?: Parameters<typeof createPlanForRetryTest>[1];
  attemptOverrides?: RetryAttemptOverrides;
};

async function createTestPlanWithAttempt({
  userId,
  planOverrides,
  attemptOverrides,
}: CreateTestPlanWithAttemptOptions) {
  const plan = await createPlanForRetryTest(userId, planOverrides);

  if (attemptOverrides) {
    await db.insert(generationAttempts).values({
      planId: plan.id,
      status: 'in_progress',
      classification: null,
      durationMs: 0,
      modulesCount: 0,
      tasksCount: 0,
      promptHash: 'retry-in-progress',
      ...attemptOverrides,
    });
  }

  return plan;
}

async function withRunGenerationAttemptSpy<T>(
  fn: (runSpy: ReturnType<typeof vi.spyOn>) => Promise<T>
): Promise<T> {
  const orchestrator = await import('@/features/ai/orchestrator');
  const runSpy = vi.spyOn(orchestrator, 'runGenerationAttempt');
  try {
    return await fn(runSpy);
  } finally {
    vi.restoreAllMocks();
  }
}

describe('POST /api/v1/plans/:planId/retry', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
  });

  it('applies durable generation_attempts rate limit before retry starts', async () => {
    const authUserId = 'auth_retry_rate_limit';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'retry-rate-limit@example.com',
    });

    const plan = await createTestPlanWithAttempt({ userId });
    await seedFailedAttemptsForDurableWindow(plan.id);

    await withRunGenerationAttemptSpy(async (runSpy) => {
      const request = new Request(
        `http://localhost/api/v1/plans/${plan.id}/retry`,
        { method: 'POST' }
      );
      const response = await POST(request);
      expect(response.status).toBe(429);
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');

      const body = (await response.json()) as {
        code?: string;
        retryAfter?: number;
      };
      expect(body.code).toBe('RATE_LIMITED');
      expect(typeof body.retryAfter).toBe('number');
      expect(runSpy).not.toHaveBeenCalled();
    });
  });

  it('returns 400 when plan is not in failed state', async () => {
    const authUserId = 'auth_retry_invalid_status';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'retry-invalid-status@example.com',
    });

    const plan = await createTestPlanWithAttempt({
      userId,
      planOverrides: {
        topic: 'Ready plan',
        generationStatus: 'ready',
      },
    });

    await withRunGenerationAttemptSpy(async (runSpy) => {
      const response = await POST(
        new Request(`http://localhost/api/v1/plans/${plan.id}/retry`, {
          method: 'POST',
        })
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error?: string; code?: string };
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.error).toContain('not eligible for retry');
      expect(runSpy).not.toHaveBeenCalled();
    });
  });

  it('emits SSE error event when plan attempt cap is already reached', async () => {
    const authUserId = 'auth_retry_capped';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'retry-capped@example.com',
    });

    const plan = await createTestPlanWithAttempt({
      userId,
      planOverrides: { topic: 'Capped plan' },
    });

    const cappedResult: GenerationAttemptResult = {
      status: 'permanent_failure',
      classification: 'capped',
      error: new Error('Generation attempt cap reached'),
    };

    const postWithCappedMock = createRetryHandler({
      overrides: {
        processGenerationAttempt: async () => cappedResult,
      },
    });

    const response = await postWithCappedMock(
      new Request(`http://localhost/api/v1/plans/${plan.id}/retry`, {
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    const events = await readStreamingResponse(response);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.data!.code).toBe('ATTEMPTS_EXHAUSTED');
    expect(errorEvent!.data!.classification).toBe('capped');
    expect(errorEvent!.data!.retryable).toBe(false);
  });

  it('emits SSE error event when another attempt is already in progress', async () => {
    const authUserId = 'auth_retry_in_progress';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'retry-in-progress@example.com',
    });

    const plan = await createTestPlanWithAttempt({
      userId,
      planOverrides: { topic: 'Plan in progress' },
    });

    const conflictResult: GenerationAttemptResult = {
      status: 'retryable_failure',
      classification: 'rate_limit',
      error: new Error(
        'A generation is already in progress for this plan (concurrent conflict)'
      ),
    };

    const postWithConflictMock = createRetryHandler({
      overrides: {
        processGenerationAttempt: async () => conflictResult,
      },
    });

    const response = await postWithConflictMock(
      new Request(`http://localhost/api/v1/plans/${plan.id}/retry`, {
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    const events = await readStreamingResponse(response);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.data!.code).toBe('RATE_LIMITED');
    expect(errorEvent!.data!.classification).toBe('rate_limit');
    expect(errorEvent!.data!.retryable).toBe(true);
  });
});
