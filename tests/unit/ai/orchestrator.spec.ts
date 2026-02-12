import { describe, expect, it } from 'vitest';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import type { AttemptRejection } from '@/lib/db/queries/attempts';
import { db } from '@/lib/db/service-role';

describe('runGenerationAttempt reservation rejection handling', () => {
  it('maps in_progress reservation rejections to a valid retryable classification', async () => {
    const reservation: AttemptRejection = {
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
        dbClient: db,
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
