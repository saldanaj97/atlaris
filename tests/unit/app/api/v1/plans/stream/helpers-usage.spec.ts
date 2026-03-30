import {
  CATALOG_MODEL_OPENAI_GPT4O,
  makeOpenRouterGpt4oProviderMetadata,
} from '@tests/fixtures/canonical-usage.factory';
import { describe, expect, it, vi } from 'vitest';
import { tryRecordUsage } from '@/app/api/v1/plans/stream/helpers';
import type { GenerationSuccessResult } from '@/features/ai/types/orchestrator.types';
import { safeNormalizeUsage } from '@/features/ai/usage';
import type {
  AttemptsDbClient,
  GenerationAttemptRecord,
} from '@/lib/db/queries/types/attempts.types';
import { canonicalUsageToRecordParams } from '@/lib/db/usage';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

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
});
