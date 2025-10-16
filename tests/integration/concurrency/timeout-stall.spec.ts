import { describe, expect, it } from 'vitest';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { db } from '@/lib/db/drizzle';
import { learningPlans } from '@/lib/db/schema';
import { setTestUser } from '../helpers/auth';
import { ensureUser } from '../helpers/db';
import { createMockProvider } from '../helpers/mockProvider';

/**
 * Simulates a provider stall by creating a mock provider that never yields a module
 * before timeout. Ensures classification = timeout.
 */

describe('Concurrency - provider stall timeout classification', () => {
  it('classifies stalled provider as timeout', async () => {
    setTestUser('stall_user');
    const userId = await ensureUser({
      clerkUserId: 'stall_user',
      email: 'stall_user@example.com',
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Stall Plan',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    // Custom mock provider variant: never sends data until aborted.
    const stallProvider = createMockProvider({ scenario: 'timeout' }).provider;

    const result = await runGenerationAttempt(
      {
        planId: plan.id,
        userId,
        input: {
          topic: 'Stall Plan',
          notes: 'Expect timeout classification',
          skillLevel: 'beginner',
          weeklyHours: 2,
          learningStyle: 'reading',
        },
      },
      {
        provider: stallProvider,
        timeoutConfig: { baseMs: 100, extensionMs: 0 },
        clock: () => Date.now(),
      }
    );

    expect(result.status).toBe('failure');
    expect(result.classification).toBe('timeout');
    expect(result.timedOut).toBe(true);
  });
});
