import { makeOpenRouterGpt4oProviderMetadata } from '@tests/fixtures/canonical-usage.factory';
import { describe, expect, it, vi } from 'vitest';
import type { GenerationSuccessResult } from '@/features/ai/types/orchestrator.types';
import { safeNormalizeUsage } from '@/features/ai/usage';
import { tryRecordUsage } from '@/features/plans/session/stream-outcomes';
import type { GenerationAttemptRecord } from '@/lib/db/queries/types/attempts.types';

function buildAttemptRecord(): GenerationAttemptRecord {
  return {
    id: 'attempt-1',
    planId: 'plan-1',
    status: 'success',
    classification: null,
    durationMs: 1,
    modulesCount: 0,
    tasksCount: 0,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: 'h',
    metadata: null,
    createdAt: new Date(),
  };
}

function makeSuccess(
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

describe('stream-outcomes tryRecordUsage', () => {
  it('delegates to UsageRecordingPort with kind plan', async () => {
    const usageRecording = {
      recordUsage: vi.fn().mockResolvedValue(undefined),
    };
    const metadata = makeOpenRouterGpt4oProviderMetadata();
    const canonical = safeNormalizeUsage(metadata);

    await tryRecordUsage('u1', makeSuccess(metadata), usageRecording);

    expect(usageRecording.recordUsage).toHaveBeenCalledWith({
      userId: 'u1',
      usage: canonical,
      kind: 'plan',
    });
  });
});
