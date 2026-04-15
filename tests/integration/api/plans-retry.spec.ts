import { desc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import {
  createRetryHandler,
  POST,
} from '@/app/api/v1/plans/[planId]/retry/route';
import type { GenerationAttemptResult } from '@/features/plans/lifecycle';
import { generationAttempts, learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

import { seedFailedAttemptsForDurableWindow } from '../../fixtures/attempts';
import { createPlanForRetryTest } from '../../fixtures/plans';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
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

function createRetryRequest(planId: string, signal?: AbortSignal): Request {
  return new Request(`http://localhost/api/v1/plans/${planId}/retry`, {
    method: 'POST',
    signal,
  });
}

function expectJsonObject(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

function expectPlanStartEvent(
  events: Awaited<ReturnType<typeof readStreamingResponse>>,
  expectedAttemptNumber: number
): { planId: string } {
  const startEvent = events.find((event) => event.type === 'plan_start');
  if (!startEvent) {
    throw new Error('Expected plan_start event');
  }

  const startData = expectJsonObject(startEvent.data);
  expect(startData.planId).toEqual(expect.any(String));
  expect(startData.attemptNumber).toBe(expectedAttemptNumber);

  const planId = startData.planId;
  if (typeof planId !== 'string' || planId.length === 0) {
    throw new Error('Expected plan_start event to include a planId');
  }

  return { planId };
}

function expectTerminalEventAfterStart(
  events: Awaited<ReturnType<typeof readStreamingResponse>>,
  terminalType: 'complete' | 'error' | 'cancelled'
) {
  const eventTypes = events.map((event) => event.type);
  const startIndex = eventTypes.indexOf('plan_start');
  const terminalIndex = eventTypes.indexOf(terminalType);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(terminalIndex).toBeGreaterThan(startIndex);
  expect(
    eventTypes
      .slice(0, terminalIndex)
      .filter((type) => ['complete', 'error', 'cancelled'].includes(type))
  ).toEqual([]);

  const terminalEvent = events[terminalIndex];
  if (!terminalEvent) {
    throw new Error(`Expected ${terminalType} event`);
  }

  return terminalEvent;
}

function expectNoTerminalEvent(
  events: Awaited<ReturnType<typeof readStreamingResponse>>
) {
  expect(
    events.some((event) =>
      ['complete', 'error', 'cancelled'].includes(event.type)
    )
  ).toBe(false);
}

async function listAttempts(planId: string) {
  return db
    .select({
      status: generationAttempts.status,
      classification: generationAttempts.classification,
    })
    .from(generationAttempts)
    .where(eq(generationAttempts.planId, planId))
    .orderBy(desc(generationAttempts.createdAt));
}

async function getPlanGenerationStatus(planId: string) {
  const [plan] = await db
    .select({ generationStatus: learningPlans.generationStatus })
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  return plan?.generationStatus;
}

describe('POST /api/v1/plans/:planId/retry', () => {
  it('streams retry success with incremented attempt numbering and success classification semantics', async () => {
    const authUserId = 'auth_retry_success';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'retry-success@example.com',
      subscriptionTier: 'pro',
    });

    const plan = await createTestPlanWithAttempt({
      userId,
      attemptOverrides: {
        status: 'failure',
        classification: 'timeout',
        durationMs: 1_000,
        promptHash: 'retry-success-first-attempt',
      },
    });

    const response = await POST(createRetryRequest(plan.id));
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const { planId } = expectPlanStartEvent(events, 2);
    const completeEvent = expectTerminalEventAfterStart(events, 'complete');
    expect(expectJsonObject(completeEvent.data).planId).toBe(planId);

    const attempts = await listAttempts(plan.id);
    const [persistedPlan] = await db
      .select({ generationStatus: learningPlans.generationStatus })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id))
      .limit(1);

    expect(persistedPlan?.generationStatus).toBe('ready');
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      status: 'success',
      classification: null,
    });
    expect(attempts[1]).toMatchObject({
      status: 'failure',
      classification: 'timeout',
    });
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
      const request = createRetryRequest(plan.id);
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
      const response = await POST(createRetryRequest(plan.id));
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

    const response = await postWithCappedMock(createRetryRequest(plan.id));

    expect(response.status).toBe(200);
    const events = await readStreamingResponse(response);
    expectPlanStartEvent(events, 1);
    const errorEvent = expectTerminalEventAfterStart(events, 'error');
    const errorData = expectJsonObject(errorEvent.data);
    expect(errorData.code).toBe('ATTEMPTS_EXHAUSTED');
    expect(errorData.classification).toBe('capped');
    expect(errorData.retryable).toBe(false);
    await expect(getPlanGenerationStatus(plan.id)).resolves.toBe('failed');
    await expect(listAttempts(plan.id)).resolves.toHaveLength(0);
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

    const response = await postWithConflictMock(createRetryRequest(plan.id));

    expect(response.status).toBe(200);
    const events = await readStreamingResponse(response);
    expectPlanStartEvent(events, 1);
    const errorEvent = expectTerminalEventAfterStart(events, 'error');
    const errorData = expectJsonObject(errorEvent.data);
    expect(errorData.code).toBe('RATE_LIMITED');
    expect(errorData.classification).toBe('rate_limit');
    expect(errorData.retryable).toBe(true);
    await expect(getPlanGenerationStatus(plan.id)).resolves.toBe('failed');
    await expect(listAttempts(plan.id)).resolves.toHaveLength(0);
  });

  it('emits permanent failure parity for validation-classified retry failures', async () => {
    const authUserId = 'auth_retry_permanent';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'retry-permanent@example.com',
    });

    const plan = await createTestPlanWithAttempt({ userId });
    const postWithPermanentFailure = createRetryHandler({
      overrides: {
        processGenerationAttempt: async () => ({
          status: 'permanent_failure',
          classification: 'validation',
          error: new Error('generated modules failed validation'),
        }),
      },
    });

    const response = await postWithPermanentFailure(
      createRetryRequest(plan.id)
    );
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    expectPlanStartEvent(events, 1);
    const errorEvent = expectTerminalEventAfterStart(events, 'error');
    expect(errorEvent.data).toMatchObject({
      code: 'INVALID_OUTPUT',
      classification: 'validation',
      retryable: false,
    });
    await expect(getPlanGenerationStatus(plan.id)).resolves.toBe('failed');
    await expect(listAttempts(plan.id)).resolves.toHaveLength(0);
  });

  it('marks the plan failed but leaves the reserved retry attempt in progress on unexpected errors', async () => {
    const authUserId = 'auth_retry_unhandled';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'retry-unhandled@example.com',
    });

    const plan = await createTestPlanWithAttempt({
      userId,
      attemptOverrides: {
        status: 'failure',
        classification: 'timeout',
        durationMs: 500,
        promptHash: 'retry-unhandled-first-attempt',
      },
    });

    const postWithUnhandledFailure = createRetryHandler({
      overrides: {
        processGenerationAttempt: async (input) => {
          await db.insert(generationAttempts).values({
            planId: input.planId,
            status: 'in_progress',
            classification: null,
            durationMs: 0,
            modulesCount: 0,
            tasksCount: 0,
            promptHash: 'retry-unhandled-second-attempt',
          });
          throw new Error('retry crashed unexpectedly');
        },
      },
    });

    const response = await postWithUnhandledFailure(
      createRetryRequest(plan.id)
    );
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    expectPlanStartEvent(events, 2);
    const errorEvent = expectTerminalEventAfterStart(events, 'error');
    expect(errorEvent.data).toMatchObject({
      code: 'GENERATION_FAILED',
      classification: 'provider_error',
      retryable: true,
    });

    const attempts = await listAttempts(plan.id);
    const [persistedPlan] = await db
      .select({ generationStatus: learningPlans.generationStatus })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id))
      .limit(1);

    expect(persistedPlan?.generationStatus).toBe('failed');
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      status: 'in_progress',
      classification: null,
    });
  });

  it('suppresses terminal retry SSE events on cancellation while still marking the plan failed', async () => {
    const authUserId = 'auth_retry_cancelled';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'retry-cancelled@example.com',
    });

    const plan = await createTestPlanWithAttempt({
      userId,
      attemptOverrides: {
        status: 'failure',
        classification: 'provider_error',
        durationMs: 750,
        promptHash: 'retry-cancelled-first-attempt',
      },
    });

    const controller = new AbortController();
    const postWithCancellation = createRetryHandler({
      overrides: {
        processGenerationAttempt: async (input) => {
          await db.insert(generationAttempts).values({
            planId: input.planId,
            status: 'in_progress',
            classification: null,
            durationMs: 0,
            modulesCount: 0,
            tasksCount: 0,
            promptHash: 'retry-cancelled-second-attempt',
          });
          controller.abort();
          throw new DOMException('Client disconnected', 'AbortError');
        },
      },
    });

    const response = await postWithCancellation(
      createRetryRequest(plan.id, controller.signal)
    );
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    expectPlanStartEvent(events, 2);
    expectNoTerminalEvent(events);

    const attempts = await listAttempts(plan.id);
    const [persistedPlan] = await db
      .select({ generationStatus: learningPlans.generationStatus })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id))
      .limit(1);

    expect(persistedPlan?.generationStatus).toBe('failed');
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      status: 'in_progress',
      classification: null,
    });
  });
});
