import { describe, expect, it } from 'vitest';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';

describe('runGenerationAttempt reservation rejection handling', () => {
  it('maps in_progress reservation rejections to a valid retryable classification', async () => {
    const dbClientStub = {
      select: () => ({}),
      insert: () => ({}),
      update: () => ({}),
      delete: () => ({}),
      transaction: () => ({}),
    };
    const reservation = {
      reserved: false,
      reason: 'in_progress',
    };

    const result = await runGenerationAttempt(
      {
        planId: 'plan_test',
        userId: 'user_test',
        input: {
          topic: 'TypeScript',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
        },
      },
      {
        dbClient: dbClientStub as unknown as RunGenerationDbClient,
        // Intentional double-cast: options accepts a narrow reservation type; we pass a minimal shape for rejection testing.
        reservation: reservation as unknown as RunGenerationReservation,
      }
    );

    expect(result.status).toBe('failure');
    if (result.status !== 'failure') {
      throw new Error('Expected failure result for reservation rejection');
    }
    expect(result.classification).toBe('rate_limit');
    expect(result.attempt.classification).toBe('rate_limit');
  });
});

type RunGenerationReservation = Parameters<
  typeof runGenerationAttempt
>[1] extends {
  reservation?: infer Reservation;
}
  ? Reservation
  : never;

type RunGenerationDbClient = Parameters<
  typeof runGenerationAttempt
>[1] extends {
  dbClient: infer DbClient;
}
  ? DbClient
  : never;
