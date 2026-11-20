/**
 * Race Condition Fix Tests (T200)
 *
 * Tests to verify that the atomicCheckAndInsertPlan function prevents
 * concurrent requests from bypassing the plan limit.
 */

import { learningPlans, users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { atomicInsertPlanOrThrow } from '@tests/helpers/plan-persistence';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Plan Limit Race Condition Prevention (T200)', () => {
  let testUserId: string;

  beforeEach(async () => {
    // Create a test user on the starter tier (10 plan limit)
    const [user] = await db
      .insert(users)
      .values({
        authUserId: `test-race-${Date.now()}-${Math.random()}`,
        email: `race-test-${Date.now()}@example.com`,
        subscriptionTier: 'starter',
      })
      .returning({ id: users.id });

    testUserId = user.id;
  });

  it('should allow pro tier users unlimited concurrent plans', async () => {
    // T202: Update user to pro tier
    await db
      .update(users)
      .set({ subscriptionTier: 'pro' })
      .where(eq(users.id, testUserId));

    // Attempt 10 concurrent plan creations
    const promises = Array.from({ length: 10 }, (_, i) =>
      atomicInsertPlanOrThrow(db, testUserId, {
        topic: `Pro Tier Topic ${i}`,
        skillLevel: 'advanced',
        weeklyHours: 15,
        learningStyle: 'practice',
        visibility: 'private',
        origin: 'ai',
      }),
    );

    const results = await Promise.all(promises);

    // All should succeed for pro tier
    expect(results.length).toBe(10);
    results.forEach((result) => {
      expect(result).toHaveProperty('id');
    });

    // Verify database has 10 plans
    const plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, testUserId));

    expect(plans.length).toBe(10);
  });

  it('should handle starter tier limit correctly', async () => {
    // T203: Update user to starter tier (10 plan limit)
    await db
      .update(users)
      .set({ subscriptionTier: 'starter' })
      .where(eq(users.id, testUserId));

    // Attempt 12 concurrent plan creations
    const promises = Array.from({ length: 12 }, (_, i) =>
      atomicInsertPlanOrThrow(db, testUserId, {
        topic: `Starter Topic ${i}`,
        skillLevel: 'beginner',
        weeklyHours: 8,
        learningStyle: 'video',
        visibility: 'private',
        origin: 'ai',
      }).catch((error) => ({ error: (error as Error).message })),
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => !('error' in r));
    const failures = results.filter((r) => 'error' in r);

    // Exactly 10 should succeed (starter tier limit)
    expect(successes.length).toBe(10);
    expect(failures.length).toBe(2);

    // Verify database has exactly 10 plans
    const plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, testUserId));

    expect(plans.length).toBe(10);
  });

  it('should rollback transaction on plan insertion failure', async () => {
    for (let i = 0; i < 10; i++) {
      await atomicInsertPlanOrThrow(db, testUserId, {
        topic: `Topic ${i}`,
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      });
    }

    await expect(
      atomicInsertPlanOrThrow(db, testUserId, {
        topic: 'Topic over limit',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      }),
    ).rejects.toThrow('Plan limit reached');

    const plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, testUserId));
    expect(plans.length).toBe(10);
  });
});
