import {
  CATALOG_MODEL_OPENAI_GPT4O,
  makeOpenRouterGpt4oProviderMetadata,
} from '@tests/fixtures/canonical-usage.factory';
import { describe, expect, it, vi } from 'vitest';
import type {
  GenerationFailureResult,
  GenerationSuccessResult,
} from '@/features/ai/types/orchestrator.types';
import { safeNormalizeUsage } from '@/features/ai/usage';
import {
  handleFailedGeneration,
  tryRecordUsage,
} from '@/features/plans/session/stream-outcomes';
import type {
  AttemptsDbClient,
  GenerationAttemptRecord,
} from '@/lib/db/queries/types/attempts.types';
import { canonicalUsageToRecordParams } from '@/lib/db/usage';

const mockDbClient = {} as AttemptsDbClient;

function buildAttemptRecord(): GenerationAttemptRecord {
  return {
    id: 'attempt-record-1',
    planId: 'plan-1',
    status: 'success',
    classification: null,
    durationMs: 1,
    modulesCount: 0,
    tasksCount: 0,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: 'prompt-hash-1',
    metadata: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };
}

function makeSuccessResult(
  metadata: GenerationSuccessResult['metadata']
): GenerationSuccessResult {
  return {
    status: 'success',
    classification: null,
    modules: [],
    rawText: '',
    metadata,
    durationMs: 1,
    extendedTimeout: false,
    timedOut: false,
    attempt: buildAttemptRecord(),
  };
}

function makeFailureResult(
  classification: GenerationFailureResult['classification'],
  metadata?: GenerationFailureResult['metadata']
): GenerationFailureResult {
  return {
    status: 'failure',
    classification,
    error: new Error(`${classification} failure`),
    durationMs: 1,
    extendedTimeout: false,
    timedOut: classification === 'timeout',
    attempt: buildAttemptRecord(),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

describe('tryRecordUsage', () => {
  it('passes recordUsage the same params as canonicalUsageToRecordParams(safeNormalizeUsage(metadata), userId)', async () => {
    const mockRecordUsage = vi.fn();
    const mockIncrementUsage = vi.fn();

    const metadata = makeOpenRouterGpt4oProviderMetadata();
    const canonical = safeNormalizeUsage(metadata);
    const expected = canonicalUsageToRecordParams(canonical, 'user-1');
    const mockToRecordParams = vi.fn().mockReturnValue(expected);

    await tryRecordUsage('user-1', makeSuccessResult(metadata), mockDbClient, {
      recordUsage: mockRecordUsage,
      incrementUsage: mockIncrementUsage,
      canonicalUsageToRecordParams: mockToRecordParams,
    });

    expect(mockToRecordParams).toHaveBeenCalledWith(canonical, 'user-1');
    expect(mockRecordUsage).toHaveBeenCalledTimes(1);
    expect(mockRecordUsage).toHaveBeenCalledWith(expected, mockDbClient);
    expect(mockIncrementUsage).toHaveBeenCalledTimes(1);
    expect(mockIncrementUsage).toHaveBeenCalledWith(
      'user-1',
      'plan',
      mockDbClient
    );
  });

  it('gates provider-only fields when metadata normalizes to partial usage', async () => {
    const mockRecordUsage = vi.fn();
    const mockIncrementUsage = vi.fn();

    const metadata = {
      model: CATALOG_MODEL_OPENAI_GPT4O,
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      },
    };
    const canonical = safeNormalizeUsage(metadata);
    expect(canonical.isPartial).toBe(true);
    expect(canonical.missingFields).toContain('provider');

    const expected = canonicalUsageToRecordParams(canonical, 'user-2');
    const mockToRecordParams = vi.fn().mockReturnValue(expected);

    await tryRecordUsage('user-2', makeSuccessResult(metadata), mockDbClient, {
      recordUsage: mockRecordUsage,
      incrementUsage: mockIncrementUsage,
      canonicalUsageToRecordParams: mockToRecordParams,
    });

    expect(mockToRecordParams).toHaveBeenCalledWith(canonical, 'user-2');
    expect(mockRecordUsage).toHaveBeenCalledWith(expected, mockDbClient);
  });

  it('deep-merges nested provider metadata overrides in the fixture', async () => {
    const mockRecordUsage = vi.fn();
    const mockIncrementUsage = vi.fn();

    const metadata = makeOpenRouterGpt4oProviderMetadata({
      usage: {
        promptTokens: 99,
      },
    });

    await tryRecordUsage('user-3', makeSuccessResult(metadata), mockDbClient, {
      recordUsage: mockRecordUsage,
      incrementUsage: mockIncrementUsage,
    });

    const params = mockRecordUsage.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      provider: 'openrouter',
      model: CATALOG_MODEL_OPENAI_GPT4O,
      inputTokens: 99,
      outputTokens: 20,
    });
  });

  it('swallows usage recording failures without incrementing usage', async () => {
    const mockRecordUsage = vi
      .fn()
      .mockRejectedValue(new Error('usage write failed'));
    const mockIncrementUsage = vi.fn();

    await expect(
      tryRecordUsage(
        'user-4',
        makeSuccessResult(makeOpenRouterGpt4oProviderMetadata()),
        mockDbClient,
        {
          recordUsage: mockRecordUsage,
          incrementUsage: mockIncrementUsage,
        }
      )
    ).resolves.toBeUndefined();

    expect(mockRecordUsage).toHaveBeenCalledTimes(1);
    expect(mockIncrementUsage).not.toHaveBeenCalled();
  });

  it('normalizes missing metadata before building record params', async () => {
    const mockRecordUsage = vi.fn();
    const mockIncrementUsage = vi.fn();
    const mockToRecordParams = vi.fn().mockReturnValue({
      userId: 'user-5',
      kind: 'plan',
    });

    await tryRecordUsage(
      'user-5',
      makeFailureResult('validation'),
      mockDbClient,
      {
        recordUsage: mockRecordUsage,
        incrementUsage: mockIncrementUsage,
        canonicalUsageToRecordParams: mockToRecordParams,
      }
    );

    expect(mockToRecordParams).toHaveBeenCalledWith(
      safeNormalizeUsage(undefined),
      'user-5'
    );
    expect(mockRecordUsage).toHaveBeenCalledTimes(1);
    expect(mockIncrementUsage).toHaveBeenCalledTimes(1);
  });
});

describe('handleFailedGeneration usage semantics', () => {
  it.each([
    {
      classification: 'capped' as const,
      expectedClassification: 'capped' as const,
      retryable: false,
    },
    {
      classification: 'conflict' as const,
      expectedClassification: 'conflict' as const,
      retryable: true,
    },
  ])('emits documented classification fallback for $expectedClassification', async ({
    classification,
    expectedClassification,
    retryable,
  }) => {
    const emit = vi.fn();
    const mockMarkPlanGenerationFailure = vi.fn().mockResolvedValue(undefined);

    await handleFailedGeneration(makeFailureResult(classification), {
      planId: 'plan-classification',
      userId: 'user-classification',
      dbClient: mockDbClient,
      emit,
      markPlanGenerationFailure: mockMarkPlanGenerationFailure,
    });

    expect(mockMarkPlanGenerationFailure).toHaveBeenCalledWith(
      'plan-classification',
      mockDbClient
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        data: expect.objectContaining({
          classification: expectedClassification,
          retryable,
        }),
      })
    );
  });

  it('marks retryable failures without recording usage', async () => {
    const emit = vi.fn();
    const mockMarkPlanGenerationFailure = vi.fn().mockResolvedValue(undefined);
    const mockRecordUsage = vi.fn();
    const mockIncrementUsage = vi.fn();

    await handleFailedGeneration(makeFailureResult('timeout'), {
      planId: 'plan-retryable',
      userId: 'user-retryable',
      dbClient: mockDbClient,
      emit,
      markPlanGenerationFailure: mockMarkPlanGenerationFailure,
      recordUsage: mockRecordUsage,
      incrementUsage: mockIncrementUsage,
    });

    expect(mockMarkPlanGenerationFailure).toHaveBeenCalledWith(
      'plan-retryable',
      mockDbClient
    );
    expect(mockRecordUsage).not.toHaveBeenCalled();
    expect(mockIncrementUsage).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        data: expect.objectContaining({
          classification: 'timeout',
          retryable: true,
        }),
      })
    );
  });

  it('records usage for permanent failures before emitting the fallback error', async () => {
    const emit = vi.fn();
    const mockMarkPlanGenerationFailure = vi.fn().mockResolvedValue(undefined);
    const mockRecordUsage = vi.fn().mockResolvedValue(undefined);
    const mockIncrementUsage = vi.fn().mockResolvedValue(undefined);

    await handleFailedGeneration(
      makeFailureResult('validation', makeOpenRouterGpt4oProviderMetadata()),
      {
        planId: 'plan-permanent',
        userId: 'user-permanent',
        dbClient: mockDbClient,
        emit,
        markPlanGenerationFailure: mockMarkPlanGenerationFailure,
        recordUsage: mockRecordUsage,
        incrementUsage: mockIncrementUsage,
      }
    );

    expect(mockMarkPlanGenerationFailure).toHaveBeenCalledWith(
      'plan-permanent',
      mockDbClient
    );
    expect(mockRecordUsage).toHaveBeenCalledTimes(1);
    expect(mockIncrementUsage).toHaveBeenCalledTimes(1);
    expect(mockRecordUsage.mock.invocationCallOrder[0]).toBeLessThan(
      emit.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        data: expect.objectContaining({
          classification: 'validation',
          retryable: false,
        }),
      })
    );
  });
});
