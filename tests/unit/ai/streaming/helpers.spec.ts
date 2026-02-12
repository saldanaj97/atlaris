import { handleFailedGeneration } from '@/app/api/v1/plans/stream/helpers';
import type { GenerationFailureResult } from '@/lib/ai/orchestrator';
import type { StreamingEvent } from '@/lib/ai/streaming/types';
import type { AttemptsDbClient } from '@/lib/db/queries/attempts';
import { describe, expect, it } from 'vitest';

import { createId } from '../../../fixtures/ids';

describe('stream helpers - failed generation sanitization', () => {
  it('emits a sanitized error payload for retryable failures', async () => {
    const planId = createId('plan');
    const userId = createId('user');
    const attemptId = createId('attempt');
    const emittedEvents: StreamingEvent[] = [];

    const failureResult: GenerationFailureResult = {
      status: 'failure',
      classification: 'provider_error',
      error: new Error(
        'Upstream provider failure with leaked key: sk-live-sensitive-value'
      ),
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
    };

    // Intentionally exercises a retryable classification so this unit test stays
    // DB-free. Non-retryable classifications hit getDb()/markPlanGenerationFailure.
    await handleFailedGeneration(failureResult, {
      planId,
      userId,
      dbClient: {} as AttemptsDbClient,
      emit: (event) => emittedEvents.push(event),
    });

    const errorEvent = emittedEvents.find((event) => event.type === 'error');
    expect(errorEvent).toBeTruthy();
    expect(errorEvent?.data).toMatchObject({
      planId,
      code: 'GENERATION_FAILED',
      classification: 'provider_error',
      retryable: true,
      message: 'Plan generation encountered an error. Please try again.',
    });
    expect(String(errorEvent?.data?.message ?? '')).not.toContain('sk-live');
    expect(String(errorEvent?.data?.message ?? '')).not.toContain('sensitive');
  });
});
