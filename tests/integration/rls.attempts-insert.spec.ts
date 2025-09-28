import { describe, it, expect } from 'vitest';

import { db } from '@/lib/db/drizzle';
import { generationAttempts, learningPlans } from '@/lib/db/schema';
import { setTestUser } from '../helpers/auth';
import { ensureUser, getUserIdFor } from '../helpers/db';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { createMockProvider } from '@/lib/ai/mockProvider';

/**
 * This test uses application path to insert an attempt via orchestrator
 * while authenticated as a user that does NOT own the plan. RLS should block
 * the INSERT into generation_attempts (policy requires ownership).
 */

describe('RLS attempt insertion', () => {
  it('blocks attempt insertion for non-owner user', async () => {
    // Owner user + plan
    setTestUser('rls_insert_owner');
    await ensureUser({
      clerkUserId: 'rls_insert_owner',
      email: 'rls_insert_owner@example.com',
    });
    const ownerId = await getUserIdFor('rls_insert_owner');

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerId,
        topic: 'Insert Protection Plan',
        skillLevel: 'beginner',
        weeklyHours: 3,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    // Different user tries to run attempt
    setTestUser('rls_insert_attacker');
    await ensureUser({
      clerkUserId: 'rls_insert_attacker',
      email: 'rls_insert_attacker@example.com',
    });
    const attackerId = await getUserIdFor('rls_insert_attacker');

    const mock = createMockProvider({ scenario: 'success' });
    let error: unknown = null;
    try {
      await runGenerationAttempt(
        {
          planId: plan.id,
            // attacker userId (does not own plan)
          userId: attackerId,
          input: {
            topic: 'Insert Protection Plan',
            notes: 'Should not succeed',
            skillLevel: 'beginner',
            weeklyHours: 3,
            learningStyle: 'reading',
          },
        },
        { provider: mock.provider }
      );
    } catch (e) {
      error = e;
    }

    // Expect an error due to RLS violation
    expect(error).toBeTruthy();

    const attempts = await db
      .select()
      .from(generationAttempts)
      .where(generationAttempts.planId.eq(plan.id));
    expect(attempts.length).toBe(0);
  });
});
