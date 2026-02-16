import type { StreamingHelperDependencies } from '@/app/api/v1/plans/stream/helpers';
import {
  handleFailedGeneration,
  handleSuccessfulGeneration,
  safeMarkPlanFailed,
} from '@/app/api/v1/plans/stream/helpers';
import type {
  GenerationFailureResult,
  GenerationSuccessResult,
} from '@/lib/ai/orchestrator';
import type { StreamingEvent } from '@/lib/ai/streaming/types';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createId } from '../../../fixtures/ids';

let mockMarkPlanGenerationFailure: NonNullable<
  StreamingHelperDependencies['markPlanGenerationFailure']
>;
let mockMarkPlanGenerationSuccess: NonNullable<
  StreamingHelperDependencies['markPlanGenerationSuccess']
>;
let mockRecordUsage: NonNullable<StreamingHelperDependencies['recordUsage']>;
let mockGetCorrelationId: NonNullable<
  StreamingHelperDependencies['getCorrelationId']
>;

function buildFailureResult(
  overrides: Partial<GenerationFailureResult> = {}
): GenerationFailureResult {
  const planId = createId('plan');
  const attemptId = createId('attempt');

  return {
    status: 'failure',
    classification: 'provider_error',
    error: new Error('provider failure'),
    durationMs: 120,
    extendedTimeout: false,
    timedOut: false,
    attempt: {
      id: attemptId,
      planId,
      status: 'failure',
      classification: 'provider_error',
      durationMs: 120,
      modulesCount: 0,
      tasksCount: 0,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: null,
      metadata: null,
      createdAt: new Date(),
    },
    ...overrides,
  };
}

function buildSuccessResult(
  overrides: Partial<GenerationSuccessResult> = {}
): GenerationSuccessResult {
  const attemptId = createId('attempt');
  const planId = createId('plan');

  const defaultAttempt = {
    id: attemptId,
    planId,
    status: 'success' as const,
    classification: null,
    durationMs: 200,
    modulesCount: 2,
    tasksCount: 3,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: null,
    metadata: null,
    createdAt: new Date(),
  };

  const defaultMetadata = {
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini-2024-07-18',
    usage: {
      promptTokens: 200,
      completionTokens: 500,
      totalTokens: 700,
    },
  };

  const base: GenerationSuccessResult = {
    status: 'success',
    classification: null,
    modules: [
      {
        title: 'Module 1',
        description: 'First module',
        estimatedMinutes: 60,
        tasks: [
          { title: 'Task 1', estimatedMinutes: 30 },
          { title: 'Task 2', estimatedMinutes: 30 },
        ],
      },
      {
        title: 'Module 2',
        description: 'Second module',
        estimatedMinutes: 90,
        tasks: [{ title: 'Task 3', estimatedMinutes: 45 }],
      },
    ],
    rawText: '{"modules":[]}',
    metadata: defaultMetadata,
    durationMs: 200,
    extendedTimeout: false,
    timedOut: false,
    attempt: defaultAttempt,
  };

  const {
    attempt: attemptOverride,
    metadata: metadataOverride,
    ...restOverrides
  } = overrides;

  const merged: GenerationSuccessResult = {
    ...base,
    ...restOverrides,
    ...(attemptOverride != null && {
      attempt: { ...defaultAttempt, ...attemptOverride },
    }),
    ...(metadataOverride != null && {
      metadata: { ...defaultMetadata, ...metadataOverride },
    }),
  };

  return merged;
}

describe('stream helpers', () => {
  beforeEach(() => {
    mockMarkPlanGenerationFailure = vi
      .fn()
      .mockResolvedValue(undefined) as NonNullable<
      StreamingHelperDependencies['markPlanGenerationFailure']
    >;
    mockMarkPlanGenerationSuccess = vi
      .fn()
      .mockResolvedValue(undefined) as NonNullable<
      StreamingHelperDependencies['markPlanGenerationSuccess']
    >;
    mockRecordUsage = vi.fn().mockResolvedValue(undefined) as NonNullable<
      StreamingHelperDependencies['recordUsage']
    >;
    mockGetCorrelationId = vi.fn(() => 'req_test_123') as NonNullable<
      StreamingHelperDependencies['getCorrelationId']
    >;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('emits sanitized retryable error payload and skips terminal side-effects', async () => {
    const planId = createId('plan');
    const userId = createId('user');
    const emittedEvents: StreamingEvent[] = [];
    const failureResult = buildFailureResult({
      classification: 'provider_error',
      error: new Error('sensitive provider details: sk-live-secret'),
    });

    await handleFailedGeneration(failureResult, {
      planId,
      userId,
      dbClient: {} as AttemptsDbClient,
      emit: (event) => emittedEvents.push(event),
      markPlanGenerationFailure: mockMarkPlanGenerationFailure,
      recordUsage: mockRecordUsage,
      getCorrelationId: mockGetCorrelationId,
    });

    expect(mockMarkPlanGenerationFailure).not.toHaveBeenCalled();
    expect(mockRecordUsage).not.toHaveBeenCalled();

    const errorEvent = emittedEvents.find((event) => event.type === 'error');
    expect(errorEvent?.data).toMatchObject({
      planId,
      code: 'GENERATION_FAILED',
      classification: 'provider_error',
      retryable: true,
      requestId: 'req_test_123',
    });
    expect(String(errorEvent?.data?.message ?? '')).not.toContain('sk-live');
  });

  it('marks plan failed and records usage for non-retryable failures', async () => {
    const planId = createId('plan');
    const userId = createId('user');
    const emittedEvents: StreamingEvent[] = [];
    const failureResult = buildFailureResult({
      classification: 'validation',
      error: new Error('invalid schema details'),
    });

    await handleFailedGeneration(failureResult, {
      planId,
      userId,
      dbClient: {} as AttemptsDbClient,
      emit: (event) => emittedEvents.push(event),
      markPlanGenerationFailure: mockMarkPlanGenerationFailure,
      recordUsage: mockRecordUsage,
      getCorrelationId: mockGetCorrelationId,
    });

    expect(mockMarkPlanGenerationFailure).toHaveBeenCalledTimes(1);
    expect(mockMarkPlanGenerationFailure).toHaveBeenCalledWith(
      planId,
      expect.any(Object)
    );
    expect(mockRecordUsage).toHaveBeenCalledTimes(1);

    const errorEvent = emittedEvents.find((event) => event.type === 'error');
    expect(errorEvent?.data).toMatchObject({
      code: 'INVALID_OUTPUT',
      classification: 'validation',
      retryable: false,
    });
  });

  it('emits module summaries/progress and complete event on success', async () => {
    const planId = createId('plan');
    const userId = createId('user');
    const emittedEvents: StreamingEvent[] = [];
    const result = buildSuccessResult();
    const dbClient = {} as AttemptsDbClient;
    // 100ms in the past so durationMs = Date.now() - startedAt is positive
    const startedAt = Date.now() - 100;

    await handleSuccessfulGeneration(result, {
      planId,
      userId,
      dbClient,
      startedAt,
      emit: (event) => emittedEvents.push(event),
      markPlanGenerationSuccess: mockMarkPlanGenerationSuccess,
      recordUsage: mockRecordUsage,
    });

    expect(mockMarkPlanGenerationSuccess).toHaveBeenCalledTimes(1);
    expect(mockMarkPlanGenerationSuccess).toHaveBeenCalledWith(
      planId,
      dbClient
    );
    expect(mockRecordUsage).toHaveBeenCalledTimes(1);

    const moduleEvents = emittedEvents.filter(
      (event) => event.type === 'module_summary'
    );
    const progressEvents = emittedEvents.filter(
      (event) => event.type === 'progress'
    );
    const completeEvent = emittedEvents.find(
      (event) => event.type === 'complete'
    );

    expect(moduleEvents).toHaveLength(2);
    expect(progressEvents).toHaveLength(2);
    expect(completeEvent?.data).toMatchObject({
      planId,
      modulesCount: 2,
      tasksCount: 3,
    });
    const durationMs = completeEvent?.data?.durationMs;
    expect(typeof durationMs).toBe('number');
    expect(durationMs).toBeGreaterThanOrEqual(100);
  });

  it('swallows mark failure errors in safeMarkPlanFailed', async () => {
    vi.mocked(mockMarkPlanGenerationFailure).mockRejectedValueOnce(
      new Error('db down')
    );

    await expect(
      safeMarkPlanFailed(
        createId('plan'),
        createId('user'),
        {} as AttemptsDbClient,
        { markPlanGenerationFailure: mockMarkPlanGenerationFailure }
      )
    ).resolves.toBeUndefined();

    expect(mockMarkPlanGenerationFailure).toHaveBeenCalledTimes(1);
  });
});
