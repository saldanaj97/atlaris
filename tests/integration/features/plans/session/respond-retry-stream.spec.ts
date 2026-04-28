import { ensureUser } from '@tests/helpers/db';
import {
  readStreamingResponse,
  type StreamingEvent,
} from '@tests/helpers/streaming';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { describe, expect, it, vi } from 'vitest';
import type {
  GenerationAttemptResult,
  PlanLifecycleService,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle';
import {
  createPlanGenerationSessionBoundary,
  type RespondRetryStreamArgs,
  type RetryPlanGenerationPlanSnapshot,
} from '@/features/plans/session/plan-generation-session';
import { db } from '@/lib/db/service-role';

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

interface FakeLifecycleHandle {
  service: PlanLifecycleService;
  processGenerationAttempt: ReturnType<typeof vi.fn>;
}

function buildFakeLifecycle(
  process: (input: ProcessGenerationInput) => Promise<GenerationAttemptResult>,
): FakeLifecycleHandle {
  const processGenerationAttempt = vi.fn(process);

  const service = {
    createPlan: vi.fn(),
    processGenerationAttempt,
  } as unknown as PlanLifecycleService;

  return { service, processGenerationAttempt };
}

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
  attemptNumber?: number;
  plan?: RetryPlanGenerationPlanSnapshot;
  responseHeaders?: HeadersInit;
}

function buildArgs(input: BuildArgsInput): RespondRetryStreamArgs {
  return {
    req: input.req,
    authUserId: input.authUserId,
    internalUserId: input.internalUserId,
    planId: input.planId ?? 'plan_boundary_retry',
    attemptNumber: input.attemptNumber ?? 2,
    plan: input.plan ?? { ...BASE_PLAN_SNAPSHOT },
    tierDb: db,
    ...(input.responseHeaders
      ? { responseHeaders: input.responseHeaders }
      : {}),
  };
}

function findEvent(
  events: StreamingEvent[],
  type: string,
): StreamingEvent | undefined {
  return events.find((event) => event.type === type);
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
    const fake = buildFakeLifecycle(async () => SUCCESS_ATTEMPT_RESULT);
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
        attemptNumber: 2,
      }),
    );

    expect(response.status).toBe(200);
    expect(createLifecycleService).toHaveBeenCalledTimes(1);
    expect(fake.processGenerationAttempt).toHaveBeenCalledTimes(1);

    const events = await readStreamingResponse(response);
    const planStart = findEvent(events, 'plan_start');
    const complete = findEvent(events, 'complete');

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
    const fake = buildFakeLifecycle(async () => ({
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
    const errorEvent = findEvent(events, 'error');
    expect(errorEvent?.data).toMatchObject({
      code: 'GENERATION_FAILED',
      classification: 'provider_error',
      retryable: true,
    });
    const message = String(errorEvent?.data?.message ?? '');
    expect(message).not.toContain('api_key');
    expect(message).not.toContain('sk-live-secret-value');
  });

  it('emits permanent failure error code for validation-classified failures', async () => {
    const fake = buildFakeLifecycle(async () => ({
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
    const errorEvent = findEvent(events, 'error');
    expect(errorEvent?.data).toMatchObject({
      code: 'INVALID_OUTPUT',
      classification: 'validation',
      retryable: false,
    });
  });

  it('emits fallback error event when generation throws an unhandled error', async () => {
    const fake = buildFakeLifecycle(async () => {
      throw new Error('retry boom');
    });
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
      }),
    );

    const events = await readStreamingResponse(response);
    expect(findEvent(events, 'plan_start')).toBeDefined();
    expect(findEvent(events, 'complete')).toBeUndefined();
    const errorEvent = findEvent(events, 'error');
    expect(errorEvent?.data).toMatchObject({
      classification: 'provider_error',
    });
  });

  it('suppresses terminal SSE events when the client disconnects mid-stream', async () => {
    const controller = new AbortController();
    const fake = buildFakeLifecycle(async () => {
      controller.abort();
      throw new DOMException('Client disconnected', 'AbortError');
    });
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
    expect(findEvent(events, 'plan_start')).toBeDefined();
    expect(findEvent(events, 'complete')).toBeUndefined();
    expect(findEvent(events, 'error')).toBeUndefined();
  });

  it('passes responseHeaders through to the streaming Response', async () => {
    const fake = buildFakeLifecycle(async () => SUCCESS_ATTEMPT_RESULT);
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

  it('builds a fresh lifecycle service per request via the injected factory', async () => {
    const builtFakes: FakeLifecycleHandle[] = [];
    const createLifecycleService = vi.fn(() => {
      const next = buildFakeLifecycle(async () => SUCCESS_ATTEMPT_RESULT);
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
