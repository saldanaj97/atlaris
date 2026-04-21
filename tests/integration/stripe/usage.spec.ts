import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ensureUser } from '@/../tests/helpers/db';
import {
  getUsageSummary,
  getUsageSummaryForTier,
  incrementUsage,
} from '@/features/billing/usage-metrics';
import { checkPlanLimit } from '@/features/plans/quota/check-plan-limit';
import { learningPlans, usageMetrics, users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

describe('Usage Tracking', () => {
  describe('checkPlanLimit', () => {
    it('allows free tier user with 0 plans to create up to 3 plans', async () => {
      const userId = await ensureUser({
        authUserId: 'user_free_plan_limit',
        email: 'free@example.com',
      });

      // No plans yet
      expect(await checkPlanLimit(userId, db)).toBe(true);

      // Create 3 plans
      const finalizedAt = new Date();
      await db.insert(learningPlans).values([
        {
          userId,
          topic: 'Topic 1',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          generationStatus: 'ready',
          isQuotaEligible: true,
          finalizedAt,
        },
        {
          userId,
          topic: 'Topic 2',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          generationStatus: 'ready',
          isQuotaEligible: true,
          finalizedAt,
        },
        {
          userId,
          topic: 'Topic 3',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          generationStatus: 'ready',
          isQuotaEligible: true,
          finalizedAt,
        },
      ]);

      // At limit
      expect(await checkPlanLimit(userId, db)).toBe(false);
    });

    it('allows starter tier user up to 10 plans', async () => {
      const userId = await ensureUser({
        authUserId: 'user_starter_plan_limit',
        email: 'starter@example.com',
      });

      // Upgrade to starter
      await db
        .update(users)
        .set({ subscriptionTier: 'starter' })
        .where(sql`id = ${userId}`);

      // Create 10 plans
      const finalizedAt = new Date();
      const plans = Array.from({ length: 10 }, (_, i) => ({
        userId,
        topic: `Topic ${i + 1}`,
        skillLevel: 'beginner' as const,
        weeklyHours: 5,
        learningStyle: 'mixed' as const,
        generationStatus: 'ready' as const,
        isQuotaEligible: true,
        finalizedAt,
      }));
      await db.insert(learningPlans).values(plans);

      // At limit
      expect(await checkPlanLimit(userId, db)).toBe(false);

      // Below limit - delete one plan
      const planToDelete = await db
        .select({ id: learningPlans.id })
        .from(learningPlans)
        .where(sql`user_id = ${userId}`)
        .limit(1);
      if (planToDelete[0]) {
        await db.delete(learningPlans).where(sql`id = ${planToDelete[0].id}`);
      }
      expect(await checkPlanLimit(userId, db)).toBe(true);
    });

    it('allows pro tier user unlimited plans', async () => {
      const userId = await ensureUser({
        authUserId: 'user_pro_plan_limit',
        email: 'pro@example.com',
      });

      // Upgrade to pro
      await db
        .update(users)
        .set({ subscriptionTier: 'pro' })
        .where(sql`id = ${userId}`);

      // Create 100 plans (way more than starter)
      const finalizedAt = new Date();
      const plans = Array.from({ length: 100 }, (_, i) => ({
        userId,
        topic: `Topic ${i + 1}`,
        skillLevel: 'beginner' as const,
        weeklyHours: 5,
        learningStyle: 'mixed' as const,
        generationStatus: 'ready' as const,
        isQuotaEligible: true,
        finalizedAt,
      }));
      await db.insert(learningPlans).values(plans);

      // Still allowed
      expect(await checkPlanLimit(userId, db)).toBe(true);
    });

    it('ignores non-eligible plans when enforcing limits', async () => {
      const userId = await ensureUser({
        authUserId: 'user_plan_limit_non_eligible',
        email: 'non.eligible@example.com',
      });

      const finalizedAt = new Date();
      await db.insert(learningPlans).values([
        {
          userId,
          topic: 'Eligible 1',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          generationStatus: 'ready',
          isQuotaEligible: true,
          finalizedAt,
        },
        {
          userId,
          topic: 'Eligible 2',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          generationStatus: 'ready',
          isQuotaEligible: true,
          finalizedAt,
        },
        {
          userId,
          topic: 'Failed Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          generationStatus: 'failed',
          isQuotaEligible: false,
          finalizedAt: null,
        },
      ]);

      expect(await checkPlanLimit(userId, db)).toBe(true);

      await db.insert(learningPlans).values({
        userId,
        topic: 'Eligible 3',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        generationStatus: 'ready',
        isQuotaEligible: true,
        finalizedAt,
      });

      expect(await checkPlanLimit(userId, db)).toBe(false);
    });
  });

  describe('incrementUsage', () => {
    it('creates usage metrics row if not exists and increments plan counter', async () => {
      const userId = await ensureUser({
        authUserId: 'user_increment_plan',
        email: 'increment.plan@example.com',
      });

      // No metrics yet
      const before = await db
        .select()
        .from(usageMetrics)
        .where(sql`user_id = ${userId}`);
      expect(before).toHaveLength(0);

      // Increment
      await incrementUsage(userId, 'plan');

      // Metrics created and incremented
      const after = await db
        .select()
        .from(usageMetrics)
        .where(sql`user_id = ${userId}`);
      expect(after).toHaveLength(1);
      expect(after[0]?.plansGenerated).toBe(1);
      expect(after[0]?.regenerationsUsed).toBe(0);
      expect(after[0]?.exportsUsed).toBe(0);
    });

    it('increments regeneration counter for existing row', async () => {
      const userId = await ensureUser({
        authUserId: 'user_increment_regen',
        email: 'increment.regen@example.com',
      });

      const month = new Date().toISOString().slice(0, 7);
      await db.insert(usageMetrics).values({
        userId,
        month,
        regenerationsUsed: 2,
      });

      // Increment
      await incrementUsage(userId, 'regeneration');

      // Counter incremented
      const after = await db
        .select()
        .from(usageMetrics)
        .where(sql`user_id = ${userId} AND month = ${month}`);
      expect(after[0]?.regenerationsUsed).toBe(3);
    });

    it('increments export counter for existing row', async () => {
      const userId = await ensureUser({
        authUserId: 'user_increment_export',
        email: 'increment.export@example.com',
      });

      const month = new Date().toISOString().slice(0, 7);
      await db.insert(usageMetrics).values({
        userId,
        month,
        exportsUsed: 5,
      });

      // Increment
      await incrementUsage(userId, 'export');

      // Counter incremented
      const after = await db
        .select()
        .from(usageMetrics)
        .where(sql`user_id = ${userId} AND month = ${month}`);
      expect(after[0]?.exportsUsed).toBe(6);
    });

    it('updates updatedAt timestamp', async () => {
      const userId = await ensureUser({
        authUserId: 'user_increment_timestamp',
        email: 'increment.timestamp@example.com',
      });

      const month = new Date().toISOString().slice(0, 7);
      const initialTime = new Date(Date.now() - 1000); // 1 second ago
      await db.insert(usageMetrics).values({
        userId,
        month,
        updatedAt: initialTime,
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Increment
      await incrementUsage(userId, 'plan');

      // Timestamp updated
      const after = await db
        .select()
        .from(usageMetrics)
        .where(sql`user_id = ${userId} AND month = ${month}`);
      expect(after[0]?.updatedAt.getTime()).toBeGreaterThan(
        initialTime.getTime()
      );
    });
  });

  describe('getUsageSummary', () => {
    it('does not call resolveUserTier when getUsageSummaryForTier is used directly', async () => {
      const userId = await ensureUser({
        authUserId: 'user_summary_tier_short_circuit',
        email: 'summary.tier.short@example.com',
      });

      const summary = await getUsageSummaryForTier({
        userId,
        tier: 'pro',
        dbClient: db,
      });

      expect(summary.tier).toBe('pro');
      expect(summary.activePlans.limit).toBe(Infinity);
    });

    it('excludes non-eligible plans and counts only eligible ones', async () => {
      const userId = await ensureUser({
        authUserId: 'user_summary_eligibility_filter',
        email: 'summary.eligibility@example.com',
      });

      const finalizedAt = new Date();
      // Insert a mix of plans: two eligible (ready+eligible), and two non-eligible
      await db.insert(learningPlans).values([
        {
          userId,
          topic: 'Eligible 1',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          generationStatus: 'ready',
          isQuotaEligible: true,
          finalizedAt,
        },
        {
          userId,
          topic: 'Eligible 2',
          skillLevel: 'intermediate',
          weeklyHours: 6,
          learningStyle: 'reading',
          generationStatus: 'ready',
          isQuotaEligible: true,
          finalizedAt,
        },
        {
          userId,
          topic: 'In-flight Generating',
          skillLevel: 'beginner',
          weeklyHours: 4,
          learningStyle: 'video',
          generationStatus: 'generating',
          isQuotaEligible: false,
          finalizedAt: null,
        },
        {
          userId,
          topic: 'Failed Plan',
          skillLevel: 'advanced',
          weeklyHours: 8,
          learningStyle: 'practice',
          generationStatus: 'failed',
          isQuotaEligible: false,
          finalizedAt: null,
        },
      ]);

      const summary = await getUsageSummary(userId);

      // Only the two eligible plans should be counted
      expect(summary.activePlans.current).toBe(2);
    });
    it('returns complete usage summary for free tier', async () => {
      const userId = await ensureUser({
        authUserId: 'user_summary_free',
        email: 'summary.free@example.com',
      });

      // Create 2 plans
      const finalizedAt = new Date();
      await db.insert(learningPlans).values([
        {
          userId,
          topic: 'Topic 1',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          generationStatus: 'ready',
          isQuotaEligible: true,
          finalizedAt,
        },
        {
          userId,
          topic: 'Topic 2',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          generationStatus: 'ready',
          isQuotaEligible: true,
          finalizedAt,
        },
      ]);

      // Use some regenerations and exports
      const month = new Date().toISOString().slice(0, 7);
      await db.insert(usageMetrics).values({
        userId,
        month,
        regenerationsUsed: 3,
        exportsUsed: 7,
      });

      const summary = await getUsageSummary(userId);

      expect(summary).toEqual({
        tier: 'free',
        activePlans: {
          current: 2,
          limit: 3,
        },
        regenerations: {
          used: 3,
          limit: 5,
        },
        exports: {
          used: 7,
          limit: 10,
        },
      });
    });

    it('returns summary for pro tier with Infinity limits', async () => {
      const userId = await ensureUser({
        authUserId: 'user_summary_pro',
        email: 'summary.pro@example.com',
      });

      // Upgrade to pro
      await db
        .update(users)
        .set({ subscriptionTier: 'pro' })
        .where(sql`id = ${userId}`);

      // Create 50 plans
      const finalizedAt = new Date();
      const plans = Array.from({ length: 50 }, (_, i) => ({
        userId,
        topic: `Topic ${i + 1}`,
        skillLevel: 'beginner' as const,
        weeklyHours: 5,
        learningStyle: 'mixed' as const,
        generationStatus: 'ready' as const,
        isQuotaEligible: true,
        finalizedAt,
      }));
      await db.insert(learningPlans).values(plans);

      // Use some regenerations and exports
      const month = new Date().toISOString().slice(0, 7);
      await db.insert(usageMetrics).values({
        userId,
        month,
        regenerationsUsed: 20,
        exportsUsed: 100,
      });

      const summary = await getUsageSummary(userId);

      expect(summary).toEqual({
        tier: 'pro',
        activePlans: {
          current: 50,
          limit: Infinity,
        },
        regenerations: {
          used: 20,
          limit: 50,
        },
        exports: {
          used: 100,
          limit: Infinity,
        },
      });
    });

    it('creates usage metrics row for current month if not exists', async () => {
      const userId = await ensureUser({
        authUserId: 'user_summary_create',
        email: 'summary.create@example.com',
      });

      // No metrics yet
      const before = await db
        .select()
        .from(usageMetrics)
        .where(sql`user_id = ${userId}`);
      expect(before).toHaveLength(0);

      const summary = await getUsageSummary(userId);

      // Metrics created with zeros
      expect(summary.regenerations.used).toBe(0);
      expect(summary.exports.used).toBe(0);

      // Verify in DB
      const after = await db
        .select()
        .from(usageMetrics)
        .where(sql`user_id = ${userId}`);
      expect(after).toHaveLength(1);
    });
  });

  describe('Monthly Partitioning', () => {
    it('auto-resets usage for new month via separate row', async () => {
      const userId = await ensureUser({
        authUserId: 'user_monthly_partition',
        email: 'monthly@example.com',
      });

      // January usage
      await db.insert(usageMetrics).values({
        userId,
        month: '2025-01',
        regenerationsUsed: 5,
        exportsUsed: 10,
      });

      // Simulate new month by creating new row
      await db.insert(usageMetrics).values({
        userId,
        month: '2025-02',
        regenerationsUsed: 0,
        exportsUsed: 0,
      });

      // Verify separate rows exist
      const metrics = await db
        .select()
        .from(usageMetrics)
        .where(sql`user_id = ${userId}`)
        .orderBy(usageMetrics.month);

      expect(metrics).toHaveLength(2);
      expect(metrics[0]?.month).toBe('2025-01');
      expect(metrics[0]?.regenerationsUsed).toBe(5);
      expect(metrics[1]?.month).toBe('2025-02');
      expect(metrics[1]?.regenerationsUsed).toBe(0);
    });
  });
});
