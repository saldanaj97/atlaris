import { AVAILABLE_MODELS } from '@/features/ai/ai-models';
import * as streamCleanup from '@/features/plans/session/stream-cleanup';
import { createPlanGenerationSessionBoundary } from '@/features/plans/session/plan-generation-session';
import {
  findStreamingEvent,
  readStreamingResponse,
} from '@tests/helpers/streaming';
import { buildTestAuthUserId } from '@tests/helpers/testIds';
import { describe, expect, it, vi } from 'vitest';

import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import {
  BASE_CREATE_BODY,
  buildCreateStreamArgs,
  buildCreateStreamRequest,
  buildMockCreateLifecycle,
  SUCCESS_CREATE_ATTEMPT_RESULT,
  SUCCESS_CREATE_RESULT,
} from './stream-session-test-helpers';

const VALID_PRO_MODEL = AVAILABLE_MODELS.find(({ tier }) => tier === 'pro')?.id;

if (!VALID_PRO_MODEL) {
  throw new Error('Expected at least one pro-tier model fixture');
}

describe('PlanGenerationSessionBoundary.respondCreateStream', () => {
  it('emits plan_start, module_summary, progress, then complete on success', async () => {
    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async () => SUCCESS_CREATE_ATTEMPT_RESULT,
    });
    const createLifecycleService = vi.fn(() => fake.service);
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService,
    });

    const authUserId = buildTestAuthUserId('boundary-create-success');
    const req = buildCreateStreamRequest();

    const response = await boundary.respondCreateStream(
      buildCreateStreamArgs({ req, authUserId }),
    );

    expect(response.status).toBe(200);
    expect(createLifecycleService).toHaveBeenCalledTimes(1);
    expect(fake.createPlan).toHaveBeenCalledTimes(1);
    expect(fake.processGenerationAttempt).toHaveBeenCalledTimes(1);

    const events = await readStreamingResponse(response);
    const types = events.map((event) => event.type);
    expect(types).toEqual([
      'plan_start',
      'module_summary',
      'progress',
      'complete',
    ]);

    const planStart = findStreamingEvent(events, 'plan_start');
    expect(planStart?.data).toMatchObject({
      planId: SUCCESS_CREATE_RESULT.planId,
      attemptNumber: 1,
      topic: BASE_CREATE_BODY.topic,
    });

    const complete = findStreamingEvent(events, 'complete');
    expect(complete?.data).toMatchObject({
      planId: SUCCESS_CREATE_RESULT.planId,
      modulesCount: 1,
      tasksCount: 1,
      totalMinutes: 60,
    });
  });

  it('emits sanitized error event for handled retryable failures', async () => {
    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async () => ({
        status: 'retryable_failure',
        classification: 'provider_error',
        error: new Error(
          'OpenRouter upstream failure: api_key=sk-live-secret-value',
        ),
      }),
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const authUserId = buildTestAuthUserId('boundary-create-retryable');
    const req = buildCreateStreamRequest();

    const response = await boundary.respondCreateStream(
      buildCreateStreamArgs({ req, authUserId }),
    );

    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const planStart = findStreamingEvent(events, 'plan_start');
    const errorEvent = findStreamingEvent(events, 'error');
    expect(planStart).toBeDefined();
    expect(errorEvent).toBeDefined();
    expect(findStreamingEvent(events, 'complete')).toBeUndefined();

    const errorData = errorEvent?.data ?? {};
    expect(errorData).toMatchObject({
      code: 'GENERATION_FAILED',
      classification: 'provider_error',
      retryable: true,
    });
    const message = String(errorData.message ?? '');
    expect(message).not.toContain('api_key');
    expect(message).not.toContain('sk-live-secret-value');
    expect(errorData).not.toHaveProperty('requestId');
  });

  it('includes requestId on handled error SSE when requestId is supplied', async () => {
    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async () => ({
        status: 'retryable_failure',
        classification: 'provider_error',
        error: new Error('upstream'),
      }),
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const authUserId = buildTestAuthUserId('boundary-create-reqid');
    const req = buildCreateStreamRequest();

    const response = await boundary.respondCreateStream(
      buildCreateStreamArgs({
        req,
        authUserId,
        requestId: 'corr-boundary-create-1',
      }),
    );

    const events = await readStreamingResponse(response);
    const errorEvent = findStreamingEvent(events, 'error');
    expect(errorEvent?.data).toMatchObject({
      requestId: 'corr-boundary-create-1',
      code: 'GENERATION_FAILED',
    });
  });

  it('emits permanent failure error code without retryable flag', async () => {
    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async () => ({
        status: 'permanent_failure',
        classification: 'validation',
        error: new Error('invalid generated payload'),
      }),
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const authUserId = buildTestAuthUserId('boundary-create-permanent');
    const req = buildCreateStreamRequest();

    const response = await boundary.respondCreateStream(
      buildCreateStreamArgs({ req, authUserId }),
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

    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async () => {
        throw new Error('boundary unhandled boom');
      },
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const authUserId = buildTestAuthUserId('boundary-create-unhandled');
    const req = buildCreateStreamRequest();

    const response = await boundary.respondCreateStream(
      buildCreateStreamArgs({
        req,
        authUserId,
        requestId: 'corr-boundary-create-unhandled',
      }),
    );

    const events = await readStreamingResponse(response);
    const planStart = findStreamingEvent(events, 'plan_start');
    const errorEvent = findStreamingEvent(events, 'error');
    expect(planStart).toBeDefined();
    expect(errorEvent).toBeDefined();
    expect(findStreamingEvent(events, 'complete')).toBeUndefined();
    expect(errorEvent?.data).toMatchObject({
      classification: 'provider_error',
      requestId: 'corr-boundary-create-unhandled',
    });
    expect(markSpy).toHaveBeenCalledWith(
      SUCCESS_CREATE_RESULT.planId,
      'internal-user-id',
      expect.anything(),
    );
    markSpy.mockRestore();
  });

  it('suppresses terminal SSE events when the client disconnects mid-stream', async () => {
    const controller = new AbortController();
    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async () => {
        controller.abort();
        throw new DOMException('Client disconnected', 'AbortError');
      },
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const authUserId = buildTestAuthUserId('boundary-create-disconnect');
    const req = buildCreateStreamRequest({ signal: controller.signal });

    const response = await boundary.respondCreateStream(
      buildCreateStreamArgs({ req, authUserId }),
    );

    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    expect(findStreamingEvent(events, 'plan_start')).toBeDefined();
    expect(findStreamingEvent(events, 'complete')).toBeUndefined();
    expect(findStreamingEvent(events, 'error')).toBeUndefined();
  });

  it('passes responseHeaders through to the streaming Response', async () => {
    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async () => SUCCESS_CREATE_ATTEMPT_RESULT,
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const authUserId = buildTestAuthUserId('boundary-create-headers');
    const req = buildCreateStreamRequest();

    const response = await boundary.respondCreateStream(
      buildCreateStreamArgs({
        req,
        authUserId,
        responseHeaders: {
          'X-RateLimit-Limit': '7',
          'X-Custom-Test': 'boundary',
        },
      }),
    );

    expect(response.headers.get('X-RateLimit-Limit')).toBe('7');
    expect(response.headers.get('X-Custom-Test')).toBe('boundary');
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    await response.body?.cancel();
  });

  it('ignores invalid model query param when savedPreferredAiModel is null', async () => {
    const captured: ProcessGenerationInput[] = [];
    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async (input) => {
        captured.push(input);
        return SUCCESS_CREATE_ATTEMPT_RESULT;
      },
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const authUserId = buildTestAuthUserId('boundary-create-model-invalid');
    const req = buildCreateStreamRequest({
      url: 'http://localhost/api/v1/plans/stream?model=invalid/model-id',
    });

    const response = await boundary.respondCreateStream(
      buildCreateStreamArgs({
        req,
        authUserId,
        savedPreferredAiModel: null,
      }),
    );

    await readStreamingResponse(response);

    expect(captured).toHaveLength(1);
    // Invalid query param + null saved preference → tier_default → no override.
    expect(captured[0]?.modelOverride).toBeUndefined();
  });

  it('forwards a valid model query param into processGenerationAttempt', async () => {
    const captured: ProcessGenerationInput[] = [];
    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async (input) => {
        captured.push(input);
        return SUCCESS_CREATE_ATTEMPT_RESULT;
      },
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const authUserId = buildTestAuthUserId('boundary-create-model-valid');
    const req = buildCreateStreamRequest({
      url: `http://localhost/api/v1/plans/stream?model=${encodeURIComponent(VALID_PRO_MODEL)}`,
    });

    const response = await boundary.respondCreateStream(
      buildCreateStreamArgs({
        req,
        authUserId,
        savedPreferredAiModel: null,
      }),
    );

    await readStreamingResponse(response);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.modelOverride).toBe(VALID_PRO_MODEL);
  });

  it('falls back to savedPreferredAiModel when no query param is supplied', async () => {
    const captured: ProcessGenerationInput[] = [];
    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async (input) => {
        captured.push(input);
        return SUCCESS_CREATE_ATTEMPT_RESULT;
      },
    });
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService: () => fake.service,
    });

    const authUserId = buildTestAuthUserId('boundary-create-saved-pref');
    const req = buildCreateStreamRequest();

    const response = await boundary.respondCreateStream(
      buildCreateStreamArgs({
        req,
        authUserId,
        savedPreferredAiModel: VALID_PRO_MODEL,
      }),
    );

    await readStreamingResponse(response);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.modelOverride).toBe(VALID_PRO_MODEL);
  });

  it('builds a fresh lifecycle service per request via the injected factory', async () => {
    const fake = buildMockCreateLifecycle({
      createResult: SUCCESS_CREATE_RESULT,
      process: async () => SUCCESS_CREATE_ATTEMPT_RESULT,
    });
    const createLifecycleService = vi.fn<
      (db: AttemptsDbClient) => PlanLifecycleService
    >(() => fake.service);
    const boundary = createPlanGenerationSessionBoundary({
      createLifecycleService,
    });

    const authUserId = buildTestAuthUserId('boundary-create-factory');

    const responses = await Promise.all([
      boundary.respondCreateStream(
        buildCreateStreamArgs({ req: buildCreateStreamRequest(), authUserId }),
      ),
      boundary.respondCreateStream(
        buildCreateStreamArgs({ req: buildCreateStreamRequest(), authUserId }),
      ),
    ]);

    await Promise.all(
      responses.map((response) => readStreamingResponse(response)),
    );

    expect(createLifecycleService).toHaveBeenCalledTimes(2);
    for (const call of createLifecycleService.mock.calls) {
      expect(call[0]).toBeDefined();
    }
  });
});
