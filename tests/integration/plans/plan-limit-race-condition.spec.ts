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
    // Create a test user with free tier (1 plan limit)
    const [user] = await db
      .insert(users)
      .values({
        authUserId: `test-race-${Date.now()}-${Math.random()}`,
        email: `race-test-${Date.now()}@example.com`,
        subscriptionTier: 'free',
      })
      .returning({ id: users.id });

    testUserId = user.id;
  });

  it('should prevent concurrent requests from exceeding plan limit', async () => {
    const concurrentRequests = 5;

    const promises = Array.from({ length: concurrentRequests }, (_, i) =>
      atomicInsertPlanOrThrow(db, testUserId, {
        topic: `Concurrent Topic ${i}`,
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      }).catch((error) => ({ error: (error as Error).message })),
    );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => !('error' in r));
    const failures = results.filter((r) => 'error' in r);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(4);

    failures.forEach((failure) => {
      expect(failure.error).toMatch(
        /Plan limit reached|FREE_PLAN_GENERATION_IN_PROGRESS/,
      );
    });

    const plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, testUserId));

    expect(plans.length).toBe(1);
  });

  it('should handle sequential requests correctly', async () => {
    // T201: Create plans sequentially up to limit
    const results = [];

    for (let i = 0; i < 4; i++) {
      try {
        const plan = await atomicInsertPlanOrThrow(db, testUserId, {
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

    // First should succeed, remaining should fail
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(false);
    expect(results[3].success).toBe(false);
    expect(results[1].error).toContain('Plan limit reached');
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
    await atomicInsertPlanOrThrow(db, testUserId, {
      topic: 'Topic 1',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    });

    let plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, testUserId));
    expect(plans.length).toBe(1);

    await expect(
      atomicInsertPlanOrThrow(db, testUserId, {
        topic: 'Topic 2',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      }),
    ).rejects.toThrow('Plan limit reached');

    plans = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.userId, testUserId));
    expect(plans.length).toBe(1);
  });
});
