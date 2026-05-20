import type {
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import {
  createPlanGenerationSessionBoundary,
  PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
  type RespondRetryStreamArgs,
  type RetryPlanGenerationPlanSnapshot,
} from '@/features/plans/session/plan-generation-session';
import * as streamCleanup from '@/features/plans/session/stream-cleanup';
import { ensureUser } from '@tests/helpers/db/users';
import {
  buildMockProcessLifecycle,
  type MockProcessLifecycleHandle,
} from './stream-session-test-helpers';
import {
  findStreamingEvent,
  readStreamingResponse,
} from '@tests/helpers/streaming';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { describe, expect, it, vi } from 'vitest';
import { db } from '@supabase/service-role';

const SUCCESS_ATTEMPT_RESULT: GenerationAttemptResult = {
  status: 'generation_success',
  data: {
    modules: [
      {
        title: 'Retry Module',
        estimatedMinutes: 90,
        tasks: [
          { title: 'Retry Task A', estimatedMinutes: 30 },
          { title: 'Retry Task B', estimatedMinutes: 60 },
        ],
      },
    ],
    metadata: {
      provider: 'mock',
      model: 'mock-model',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    },
    durationMs: 5,
  },
};

const BASE_PLAN_SNAPSHOT: RetryPlanGenerationPlanSnapshot = {
  topic: 'Retry Topic',
  skillLevel: 'intermediate',
  weeklyHours: 6,
  learningStyle: 'mixed',
  startDate: '2030-01-01',
  deadlineDate: '2030-06-01',
  origin: 'ai',
};

function buildRetryRequest(planId: string, signal?: AbortSignal): Request {
  return new Request(`http://localhost/api/v1/plans/${planId}/retry`, {
    method: 'POST',
    ...(signal ? { signal } : {}),
  });
}

interface BuildArgsInput {
  req: Request;
  authUserId: string;
  internalUserId: string;
  planId?: string;
  plan?: RetryPlanGenerationPlanSnapshot;
  responseHeaders?: HeadersInit;
  requestId?: string;
}

function buildArgs(input: BuildArgsInput): RespondRetryStreamArgs {
  return {
    req: input.req,
    authUserId: input.authUserId,
    internalUserId: input.internalUserId,
    planId: input.planId ?? 'plan_boundary_retry',
    plan: input.plan ?? { ...BASE_PLAN_SNAPSHOT },
    tierDb: db,
    ...(input.responseHeaders
      ? { responseHeaders: input.responseHeaders }
      : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
  };
}

async function setupUser(scenario: string): Promise<{
  authUserId: string;
  internalUserId: string;
}> {
  const authUserId = buildTestAuthUserId(scenario);
  const internalUserId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: 'pro',
  });
  return { authUserId, internalUserId };
}

describe('PlanGenerationSessionBoundary.respondRetryStream', () => {
  it('emits plan_start with retry attempt number then complete on success', async () => {
    const fake = buildMockProcessLifecycle(async () => SUCCESS_ATTEMPT_RESULT, {
      topic: BASE_PLAN_SNAPSHOT.topic,
    });
    const createLifecycleService = vi.fn(() => fake.service);
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService,
    });

    const { authUserId, internalUserId } = await setupUser(
      'boundary-retry-success',
    );
    const req = buildRetryRequest('plan_retry_success');

    const response = await boundary.respondRetryStream(
      buildArgs({
        req,
        authUserId,
        internalUserId,
        planId: 'plan_retry_success',
      }),
    );

    expect(response.status).toBe(200);
    expect(createLifecycleService).toHaveBeenCalledTimes(1);
    expect(fake.processGenerationAttempt).toHaveBeenCalledTimes(1);

    const events = await readStreamingResponse(response);
    const planStart = findStreamingEvent(events, 'plan_start');
    const complete = findStreamingEvent(events, 'complete');

    expect(planStart?.data).toMatchObject({
      planId: 'plan_retry_success',
      attemptNumber: 2,
      topic: BASE_PLAN_SNAPSHOT.topic,
    });
    expect(complete?.data).toMatchObject({
      planId: 'plan_retry_success',
      modulesCount: 1,
      tasksCount: 2,
      totalMinutes: 90,
    });
  });

  it('emits sanitized error event for handled retryable failures', async () => {
    const fake = buildMockProcessLifecycle(async () => ({
      status: 'retryable_failure',
      classification: 'provider_error',
      error: new Error(
        'OpenRouter upstream failure: api_key=sk-live-secret-value',
      ),
    }));
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupUser(
      'boundary-retry-retryable',
    );

    const response = await boundary.respondRetryStream(
      buildArgs({
        req: buildRetryRequest('plan_retry_retryable'),
        authUserId,
        internalUserId,
        planId: 'plan_retry_retryable',
      }),
    );

    const events = await readStreamingResponse(response);
    const errorEvent = findStreamingEvent(events, 'error');
    expect(errorEvent?.data).toMatchObject({
      code: 'GENERATION_FAILED',
      classification: 'provider_error',
      retryable: true,
    });
    const message = String(errorEvent?.data?.message ?? '');
    expect(message).not.toContain('api_key');
    expect(message).not.toContain('sk-live-secret-value');
    expect(errorEvent?.data).not.toHaveProperty('requestId');
  });

  it('includes requestId on handled error SSE when requestId is supplied', async () => {
    const fake = buildMockProcessLifecycle(async () => ({
      status: 'retryable_failure',
      classification: 'provider_error',
      error: new Error('upstream'),
    }));
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupUser(
      'boundary-retry-reqid',
    );

    const response = await boundary.respondRetryStream(
      buildArgs({
        req: buildRetryRequest('plan_retry_reqid'),
        authUserId,
        internalUserId,
        planId: 'plan_retry_reqid',
        requestId: 'corr-boundary-retry-1',
      }),
    );

    const events = await readStreamingResponse(response);
    const errorEvent = findStreamingEvent(events, 'error');
    expect(errorEvent?.data).toMatchObject({
      requestId: 'corr-boundary-retry-1',
      code: 'GENERATION_FAILED',
    });
  });

  it('emits permanent failure error code for validation-classified failures', async () => {
    const fake = buildMockProcessLifecycle(async () => ({
      status: 'permanent_failure',
      classification: 'validation',
      error: new Error('invalid generated payload'),
    }));
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupUser(
      'boundary-retry-permanent',
    );

    const response = await boundary.respondRetryStream(
      buildArgs({
        req: buildRetryRequest('plan_retry_permanent'),
        authUserId,
        internalUserId,
        planId: 'plan_retry_permanent',
      }),
    );

    const events = await readStreamingResponse(response);
    const errorEvent = findStreamingEvent(events, 'error');
    expect(errorEvent?.data).toMatchObject({
      code: 'INVALID_OUTPUT',
      classification: 'validation',
      retryable: false,
    });
  });

  it('emits fallback error event when generation throws an unhandled error', async () => {
    const markSpy = vi
      .spyOn(streamCleanup, 'safeMarkPlanFailedWithDbClient')
      .mockResolvedValue(undefined);

    const fake = buildMockProcessLifecycle(
      async () => {
        throw new Error('retry boom');
      },
      { topic: BASE_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupUser(
      'boundary-retry-unhandled',
    );

    const response = await boundary.respondRetryStream(
      buildArgs({
        req: buildRetryRequest('plan_retry_unhandled'),
        authUserId,
        internalUserId,
        planId: 'plan_retry_unhandled',
        requestId: 'corr-boundary-retry-unhandled',
      }),
    );

    const events = await readStreamingResponse(response);
    expect(findStreamingEvent(events, 'plan_start')).toBeDefined();
    expect(findStreamingEvent(events, 'complete')).toBeUndefined();
    const errorEvent = findStreamingEvent(events, 'error');
    expect(errorEvent?.data).toMatchObject({
      classification: 'provider_error',
      requestId: 'corr-boundary-retry-unhandled',
    });
    expect(markSpy).toHaveBeenCalledWith(
      'plan_retry_unhandled',
      internalUserId,
      expect.anything(),
    );
    markSpy.mockRestore();
  });

  it('suppresses terminal SSE events when the client disconnects mid-stream', async () => {
    const controller = new AbortController();
    const fake = buildMockProcessLifecycle(
      async () => {
        controller.abort();
        throw new DOMException('Client disconnected', 'AbortError');
      },
      { topic: BASE_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupUser(
      'boundary-retry-disconnect',
    );

    const response = await boundary.respondRetryStream(
      buildArgs({
        req: buildRetryRequest('plan_retry_disconnect', controller.signal),
        authUserId,
        internalUserId,
        planId: 'plan_retry_disconnect',
      }),
    );

    expect(response.status).toBe(200);
    const events = await readStreamingResponse(response);
    expect(findStreamingEvent(events, 'plan_start')).toBeDefined();
    expect(findStreamingEvent(events, 'complete')).toBeUndefined();
    expect(findStreamingEvent(events, 'error')).toBeUndefined();
  });

  it('passes responseHeaders through to the streaming Response', async () => {
    const fake = buildMockProcessLifecycle(async () => SUCCESS_ATTEMPT_RESULT, {
      topic: BASE_PLAN_SNAPSHOT.topic,
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupUser(
      'boundary-retry-headers',
    );

    const response = await boundary.respondRetryStream(
      buildArgs({
        req: buildRetryRequest('plan_retry_headers'),
        authUserId,
        internalUserId,
        planId: 'plan_retry_headers',
        responseHeaders: {
          'X-RateLimit-Limit': '11',
          'X-Custom-Test': 'retry',
        },
      }),
    );

    expect(response.headers.get('X-RateLimit-Limit')).toBe('11');
    expect(response.headers.get('X-Custom-Test')).toBe('retry');
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    await response.body?.cancel();
  });

  it('forwards allowedGenerationStatuses on processGenerationInput for retry', async () => {
    const captured: ProcessGenerationInput[] = [];
    const fake = buildMockProcessLifecycle(
      async (input) => {
        captured.push(input);
        return SUCCESS_ATTEMPT_RESULT;
      },
      { topic: BASE_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupUser(
      'boundary-retry-allowed-statuses',
    );

    const response = await boundary.respondRetryStream(
      buildArgs({
        req: buildRetryRequest('plan_retry_allowed'),
        authUserId,
        internalUserId,
        planId: 'plan_retry_allowed',
      }),
    );

    expect(response.status).toBe(200);
    await readStreamingResponse(response);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.allowedGenerationStatuses).toEqual(
      PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
    );
  });

  it('builds a fresh lifecycle service per request via the injected factory', async () => {
    const builtFakes: MockProcessLifecycleHandle[] = [];
    const createLifecycleService = vi.fn(() => {
      const next = buildMockProcessLifecycle(
        async () => SUCCESS_ATTEMPT_RESULT,
        {
          topic: BASE_PLAN_SNAPSHOT.topic,
        },
      );
      builtFakes.push(next);
      return next.service;
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService,
    });

    const { authUserId, internalUserId } = await setupUser(
      'boundary-retry-factory',
    );

    const responses = await Promise.all([
      boundary.respondRetryStream(
        buildArgs({
          req: buildRetryRequest('plan_retry_factory_a'),
          authUserId,
          internalUserId,
          planId: 'plan_retry_factory_a',
        }),
      ),
      boundary.respondRetryStream(
        buildArgs({
          req: buildRetryRequest('plan_retry_factory_b'),
          authUserId,
          internalUserId,
          planId: 'plan_retry_factory_b',
        }),
      ),
    ]);

    await Promise.all(
      responses.map((response) => readStreamingResponse(response)),
    );

    expect(createLifecycleService).toHaveBeenCalledTimes(2);
    expect(builtFakes).toHaveLength(2);
    // Each request must receive a distinct fake instance — exercises true
    // per-request isolation (the boundary must not share lifecycle state
    // across concurrent stream sessions).
    expect(builtFakes[0]?.service).not.toBe(builtFakes[1]?.service);
    for (const built of builtFakes) {
      expect(built.processGenerationAttempt).toHaveBeenCalledTimes(1);
    }
  });
});
