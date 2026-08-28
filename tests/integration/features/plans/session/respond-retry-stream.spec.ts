import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';

import {
  BASE_RETRY_PLAN_SNAPSHOT,
  buildMockProcessLifecycle,
  buildRetryStreamArgs,
  buildRetryStreamRequest,
  setupPlanSessionUser,
  SUCCESS_RETRY_ATTEMPT_RESULT,
  type MockProcessLifecycleHandle,
} from './stream-session-test-helpers';
import { getPersistableModelsForTier } from '@/features/ai/model-preferences';
import {
  createPlanGenerationSessionBoundary,
  PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
} from '@/features/plans/session/plan-generation-session';
import * as streamCleanup from '@/features/plans/session/stream-cleanup';
import {
  findStreamingEvent,
  readStreamingResponse,
} from '@tests/helpers/streaming';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workflowProcessFactory = vi.hoisted(() =>
  vi.fn((lifecycleService: PlanLifecycleService) =>
    lifecycleService.processGenerationAttempt.bind(lifecycleService),
  ),
);

vi.mock('@/features/plans/create-workflow-backed-process-generation', () => ({
  createWorkflowBackedProcessGeneration: workflowProcessFactory,
}));

const STARTER_OUTLINE_MODELS = getPersistableModelsForTier(
  'starter',
  'initial_outline',
);
const STARTER_OUTLINE_MODEL = STARTER_OUTLINE_MODELS[0]?.id;
const STARTER_QUERY_OVERRIDE_MODEL =
  STARTER_OUTLINE_MODELS[1]?.id ?? STARTER_OUTLINE_MODEL;
const PRO_OUTLINE_MODEL = getPersistableModelsForTier(
  'pro',
  'initial_outline',
).find(
  ({ id }) => !STARTER_OUTLINE_MODELS.some((model) => model.id === id),
)?.id;

if (
  !STARTER_OUTLINE_MODEL ||
  !STARTER_QUERY_OVERRIDE_MODEL ||
  !PRO_OUTLINE_MODEL
) {
  throw new Error(
    'Expected persistable outline fixtures for retry model tests',
  );
}

describe('PlanGenerationSessionBoundary.respondRetryStream', () => {
  beforeEach(() => {
    workflowProcessFactory.mockClear();
  });

  it('emits plan_start with retry attempt number then complete on success', async () => {
    const fake = buildMockProcessLifecycle(
      async () => SUCCESS_RETRY_ATTEMPT_RESULT,
      {
        topic: BASE_RETRY_PLAN_SNAPSHOT.topic,
      },
    );
    const createLifecycleService = vi.fn(() => fake.service);
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-success',
    );
    const req = buildRetryStreamRequest('plan_retry_success');

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req,
        authUserId,
        internalUserId,
        planId: 'plan_retry_success',
      }),
    );

    expect(response.status).toBe(200);
    expect(createLifecycleService).toHaveBeenCalledTimes(1);
    expect(fake.processGenerationAttempt).toHaveBeenCalledTimes(1);
    expect(workflowProcessFactory).toHaveBeenCalledWith(
      fake.service,
      expect.anything(),
      'plan-gen-plan_retry_success',
    );

    const events = await readStreamingResponse(response);
    const planStart = findStreamingEvent(events, 'plan_start');
    const complete = findStreamingEvent(events, 'complete');

    expect(planStart?.data).toMatchObject({
      planId: 'plan_retry_success',
      attemptNumber: 2,
      topic: BASE_RETRY_PLAN_SNAPSHOT.topic,
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

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-retryable',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_retryable'),
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

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-reqid',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_reqid'),
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

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-permanent',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_permanent'),
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
      { topic: BASE_RETRY_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-unhandled',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_unhandled'),
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
      { topic: BASE_RETRY_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-disconnect',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_disconnect', {
          signal: controller.signal,
        }),
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
    const fake = buildMockProcessLifecycle(
      async () => SUCCESS_RETRY_ATTEMPT_RESULT,
      {
        topic: BASE_RETRY_PLAN_SNAPSHOT.topic,
      },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-headers',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_headers'),
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
        return SUCCESS_RETRY_ATTEMPT_RESULT;
      },
      { topic: BASE_RETRY_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-allowed-statuses',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_allowed'),
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
    expect(captured[0]?.generationPurpose).toBe('initial');
  });

  it('forwards the saved outline preference as modelOverride', async () => {
    const captured: ProcessGenerationInput[] = [];
    const fake = buildMockProcessLifecycle(
      async (input) => {
        captured.push(input);
        return SUCCESS_RETRY_ATTEMPT_RESULT;
      },
      { topic: BASE_RETRY_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-saved-outline',
      'starter',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_saved_outline'),
        authUserId,
        internalUserId,
        planId: 'plan_retry_saved_outline',
        savedPreferredAiModel: STARTER_OUTLINE_MODEL,
      }),
    );

    await readStreamingResponse(response);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.modelOverride).toBe(STARTER_OUTLINE_MODEL);
    expect(captured[0]?.generationPurpose).toBe('initial');
  });

  it('prefers a Starter allowlist query override over the saved outline preference', async () => {
    const captured: ProcessGenerationInput[] = [];
    const fake = buildMockProcessLifecycle(
      async (input) => {
        captured.push(input);
        return SUCCESS_RETRY_ATTEMPT_RESULT;
      },
      { topic: BASE_RETRY_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-query-starter',
      'starter',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_query_starter', {
          model: STARTER_QUERY_OVERRIDE_MODEL,
        }),
        authUserId,
        internalUserId,
        planId: 'plan_retry_query_starter',
        savedPreferredAiModel: STARTER_OUTLINE_MODEL,
      }),
    );

    await readStreamingResponse(response);

    expect(captured[0]?.modelOverride).toBe(STARTER_QUERY_OVERRIDE_MODEL);
  });

  it('prefers a Pro allowlist query override over the saved outline preference', async () => {
    const captured: ProcessGenerationInput[] = [];
    const fake = buildMockProcessLifecycle(
      async (input) => {
        captured.push(input);
        return SUCCESS_RETRY_ATTEMPT_RESULT;
      },
      { topic: BASE_RETRY_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-query-pro',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_query_pro', {
          model: PRO_OUTLINE_MODEL,
        }),
        authUserId,
        internalUserId,
        planId: 'plan_retry_query_pro',
        savedPreferredAiModel: STARTER_OUTLINE_MODEL,
      }),
    );

    await readStreamingResponse(response);

    expect(captured[0]?.modelOverride).toBe(PRO_OUTLINE_MODEL);
  });

  it('falls back to the saved outline preference when the query override is invalid', async () => {
    const captured: ProcessGenerationInput[] = [];
    const fake = buildMockProcessLifecycle(
      async (input) => {
        captured.push(input);
        return SUCCESS_RETRY_ATTEMPT_RESULT;
      },
      { topic: BASE_RETRY_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-invalid-to-saved',
      'starter',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_invalid_to_saved', {
          model: 'invalid/model-id',
        }),
        authUserId,
        internalUserId,
        planId: 'plan_retry_invalid_to_saved',
        savedPreferredAiModel: STARTER_OUTLINE_MODEL,
      }),
    );

    await readStreamingResponse(response);

    expect(captured[0]?.modelOverride).toBe(STARTER_OUTLINE_MODEL);
  });

  it('omits modelOverride when the query override is invalid and no saved preference remains', async () => {
    const captured: ProcessGenerationInput[] = [];
    const fake = buildMockProcessLifecycle(
      async (input) => {
        captured.push(input);
        return SUCCESS_RETRY_ATTEMPT_RESULT;
      },
      { topic: BASE_RETRY_PLAN_SNAPSHOT.topic },
    );
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-invalid-to-default',
      'starter',
    );

    const response = await boundary.respondRetryStream(
      buildRetryStreamArgs({
        req: buildRetryStreamRequest('plan_retry_invalid_to_default', {
          model: 'invalid/model-id',
        }),
        authUserId,
        internalUserId,
        planId: 'plan_retry_invalid_to_default',
        savedPreferredAiModel: null,
      }),
    );

    await readStreamingResponse(response);

    expect(captured[0]?.modelOverride).toBeUndefined();
  });

  it('builds a fresh lifecycle service per request via the injected factory', async () => {
    const builtFakes: MockProcessLifecycleHandle[] = [];
    const createLifecycleService = vi.fn(() => {
      const next = buildMockProcessLifecycle(
        async () => SUCCESS_RETRY_ATTEMPT_RESULT,
        {
          topic: BASE_RETRY_PLAN_SNAPSHOT.topic,
        },
      );
      builtFakes.push(next);
      return next.service;
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService,
    });

    const { authUserId, internalUserId } = await setupPlanSessionUser(
      'boundary-retry-factory',
    );

    const responses = await Promise.all([
      boundary.respondRetryStream(
        buildRetryStreamArgs({
          req: buildRetryStreamRequest('plan_retry_factory_a'),
          authUserId,
          internalUserId,
          planId: 'plan_retry_factory_a',
        }),
      ),
      boundary.respondRetryStream(
        buildRetryStreamArgs({
          req: buildRetryStreamRequest('plan_retry_factory_b'),
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
