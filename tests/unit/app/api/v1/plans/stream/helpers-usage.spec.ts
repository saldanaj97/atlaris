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
import type { GenerationAttemptRecord } from '@/lib/db/queries/types/attempts.types';

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
  it('records canonical usage with kind plan via UsageRecordingPort', async () => {
    const usageRecording = {
      recordUsage: vi.fn().mockResolvedValue(undefined),
    };

    const metadata = makeOpenRouterGpt4oProviderMetadata();
    const canonical = safeNormalizeUsage(metadata);

    await tryRecordUsage('user-1', makeSuccessResult(metadata), usageRecording);

    expect(usageRecording.recordUsage).toHaveBeenCalledTimes(1);
    expect(usageRecording.recordUsage).toHaveBeenCalledWith({
      userId: 'user-1',
      usage: canonical,
      kind: 'plan',
    });
  });

  it('gates provider-only fields when metadata normalizes to partial usage', async () => {
    const usageRecording = {
      recordUsage: vi.fn().mockResolvedValue(undefined),
    };

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

    await tryRecordUsage('user-2', makeSuccessResult(metadata), usageRecording);

    expect(usageRecording.recordUsage).toHaveBeenCalledWith({
      userId: 'user-2',
      usage: canonical,
      kind: 'plan',
    });
  });

  it('passes merged provider metadata into recordUsage', async () => {
    const usageRecording = {
      recordUsage: vi.fn().mockResolvedValue(undefined),
    };

    const metadata = makeOpenRouterGpt4oProviderMetadata({
      usage: {
        promptTokens: 99,
      },
    });

    await tryRecordUsage('user-3', makeSuccessResult(metadata), usageRecording);

    const call = usageRecording.recordUsage.mock.calls[0]?.[0];
    expect(call?.usage).toMatchObject({
      provider: 'openrouter',
      model: CATALOG_MODEL_OPENAI_GPT4O,
      inputTokens: 99,
      outputTokens: 20,
    });
  });

  it('swallows usage recording failures without throwing', async () => {
    const usageRecording = {
      recordUsage: vi.fn().mockRejectedValue(new Error('usage write failed')),
    };

    await expect(
      tryRecordUsage(
        'user-4',
        makeSuccessResult(makeOpenRouterGpt4oProviderMetadata()),
        usageRecording
      )
    ).resolves.toBeUndefined();

    expect(usageRecording.recordUsage).toHaveBeenCalledTimes(1);
  });

  it('normalizes missing metadata before recording usage', async () => {
    const usageRecording = {
      recordUsage: vi.fn().mockResolvedValue(undefined),
    };

    await tryRecordUsage(
      'user-5',
      makeFailureResult('validation'),
      usageRecording
    );

    expect(usageRecording.recordUsage).toHaveBeenCalledWith({
      userId: 'user-5',
      usage: safeNormalizeUsage(undefined),
      kind: 'plan',
    });
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
    const persistence = {
      markGenerationFailure: vi.fn().mockResolvedValue(undefined),
      markGenerationSuccess: vi.fn(),
    };
    const usageRecording = { recordUsage: vi.fn() };

    await handleFailedGeneration(makeFailureResult(classification), {
      planId: 'plan-classification',
      userId: 'user-classification',
      emit,
      persistence,
      usageRecording,
    });

    expect(persistence.markGenerationFailure).toHaveBeenCalledWith(
      'plan-classification'
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
    const persistence = {
      markGenerationFailure: vi.fn().mockResolvedValue(undefined),
      markGenerationSuccess: vi.fn(),
    };
    const usageRecording = { recordUsage: vi.fn() };

    await handleFailedGeneration(makeFailureResult('timeout'), {
      planId: 'plan-retryable',
      userId: 'user-retryable',
      emit,
      persistence,
      usageRecording,
    });

    expect(persistence.markGenerationFailure).toHaveBeenCalledWith(
      'plan-retryable'
    );
    expect(usageRecording.recordUsage).not.toHaveBeenCalled();
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
    const persistence = {
      markGenerationFailure: vi.fn().mockResolvedValue(undefined),
      markGenerationSuccess: vi.fn(),
    };
    const usageRecording = {
      recordUsage: vi.fn().mockResolvedValue(undefined),
    };

    await handleFailedGeneration(
      makeFailureResult('validation', makeOpenRouterGpt4oProviderMetadata()),
      {
        planId: 'plan-permanent',
        userId: 'user-permanent',
        emit,
        persistence,
        usageRecording,
      }
    );

    expect(persistence.markGenerationFailure).toHaveBeenCalledWith(
      'plan-permanent'
    );
    expect(usageRecording.recordUsage).toHaveBeenCalledTimes(1);
    expect(usageRecording.recordUsage.mock.invocationCallOrder[0]).toBeLessThan(
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
