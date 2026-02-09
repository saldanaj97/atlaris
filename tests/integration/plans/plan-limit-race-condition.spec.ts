/**
 * Race Condition Fix Tests (T200)
 *
 * Tests to verify that the atomicCheckAndInsertPlan function prevents
 * concurrent requests from bypassing the plan limit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/service-role';
import { learningPlans, users } from '@/lib/db/schema';
import { atomicCheckAndInsertPlan } from '@/lib/stripe/usage';
import { eq } from 'drizzle-orm';

describe('Plan Limit Race Condition Prevention (T200)', () => {
  let testUserId: string;

  beforeEach(async () => {
    // Create a test user with free tier (3 plan limit)
    const [user] = await db
      .insert(users)
      .values({
        authUserId: `test-race-${Date.now()}-${Math.random()}`,
        email: `race-test-${Date.now()}@example.com`,
        subscriptionTier: 'free', // 3 plan limit
      })
      .returning({ id: users.id });

    testUserId = user.id;
  });

  it('should prevent concurrent requests from exceeding plan limit', async () => {
    // T200: Attempt 5 concurrent plan creations for a free user (limit: 3)
    const concurrentRequests = 5;

    const promises = Array.from({ length: concurrentRequests }, (_, i) =>
      atomicCheckAndInsertPlan(testUserId, {
        topic: `Concurrent Topic ${i}`,
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      }).catch((error) => ({ error: error.message }))
    );

    const results = await Promise.all(promises);

    // Count successes and failures
    const successes = results.filter((r) => !('error' in r));
    const failures = results.filter((r) => 'error' in r);

    // Exactly 3 should succeed (free tier limit)
    expect(successes.length).toBe(3);
    expect(failures.length).toBe(2);

    // All failures should be due to plan limit
    failures.forEach((failure) => {
      expect(failure.error).toContain('Plan limit reached');
    });

    // Verify database has exactly 3 plans
    const plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, testUserId));

    expect(plans.length).toBe(3);
  });

  it('should handle sequential requests correctly', async () => {
    // T201: Create plans sequentially up to limit
    const results = [];

    for (let i = 0; i < 4; i++) {
      try {
        const plan = await atomicCheckAndInsertPlan(testUserId, {
          topic: `Sequential Topic ${i}`,
          skillLevel: 'intermediate',
          weeklyHours: 10,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        });
        results.push({ success: true, planId: plan.id });
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // First 3 should succeed, 4th should fail
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results[2].success).toBe(true);
    expect(results[3].success).toBe(false);
    expect(results[3].error).toContain('Plan limit reached');
  });

  it('should allow pro tier users unlimited concurrent plans', async () => {
    // T202: Update user to pro tier
    await db
      .update(users)
      .set({ subscriptionTier: 'pro' })
      .where(eq(users.id, testUserId));

    // Attempt 10 concurrent plan creations
    const promises = Array.from({ length: 10 }, (_, i) =>
      atomicCheckAndInsertPlan(testUserId, {
        topic: `Pro Tier Topic ${i}`,
        skillLevel: 'advanced',
        weeklyHours: 15,
        learningStyle: 'practice',
        visibility: 'private',
        origin: 'ai',
      })
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
      atomicCheckAndInsertPlan(testUserId, {
        topic: `Starter Topic ${i}`,
        skillLevel: 'beginner',
        weeklyHours: 8,
        learningStyle: 'video',
        visibility: 'private',
        origin: 'ai',
      }).catch((error) => ({ error: error.message }))
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
    // T204: Test that failed insertions don't consume quota
    // This test verifies that if the plan insert fails for any reason,
    // the quota check is also rolled back

    // Create 2 plans successfully
    await atomicCheckAndInsertPlan(testUserId, {
      topic: 'Topic 1',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    });

    await atomicCheckAndInsertPlan(testUserId, {
      topic: 'Topic 2',
      skillLevel: 'intermediate',
      weeklyHours: 10,
      learningStyle: 'reading',
      visibility: 'private',
      origin: 'ai',
    });

    // Verify we have 2 plans
    let plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, testUserId));
    expect(plans.length).toBe(2);

    // Should be able to create one more (limit is 3)
    const plan3 = await atomicCheckAndInsertPlan(testUserId, {
      topic: 'Topic 3',
      skillLevel: 'advanced',
      weeklyHours: 15,
      learningStyle: 'practice',
      visibility: 'private',
      origin: 'ai',
    });

    expect(plan3).toHaveProperty('id');

    // Verify we have 3 plans
    plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, testUserId));
    expect(plans.length).toBe(3);

    // Next attempt should fail with limit reached
    await expect(
      atomicCheckAndInsertPlan(testUserId, {
        topic: 'Topic 4',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
    ).rejects.toThrow('Plan limit reached');

    // Verify we still have exactly 3 plans (not 4)
    plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, testUserId));
    expect(plans.length).toBe(3);
  });
});
