import { describe, it, expect } from 'vitest';

import { createMockProvider } from '@/lib/ai/mockProvider';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { db } from '@/lib/db/drizzle';
import { learningPlans } from '@/lib/db/schema';
import { setTestUser } from '../helpers/auth';
import { ensureUser, getUserIdFor } from '../helpers/db';

/**
 * Simulates a provider stall by creating a mock provider that never yields a module
 * before timeout. Ensures classification = timeout.
 */

describe('Concurrency - provider stall timeout classification', () => {
  it('classifies stalled provider as timeout', async () => {
    setTestUser('stall_user');
    await ensureUser({ clerkUserId: 'stall_user', email: 'stall_user@example.com' });
    const userId = await getUserIdFor('stall_user');

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
