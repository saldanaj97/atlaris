import {
  getCurrentMonth,
  getUsageSummary,
  getUsageSummaryForTier,
} from '@/features/billing/usage-metrics';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { learningPlans, usageMetrics, users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('Usage Tracking', () => {
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

      const summary = await getUsageSummary(userId, db);

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

      // Use some regenerations
      const month = getCurrentMonth();
      await db.insert(usageMetrics).values({
        userId,
        month,
        regenerationsUsed: 3,
        exportsUsed: 7,
      });

      const summary = await getUsageSummary(userId, db);

      expect(summary).toEqual({
        tier: 'free',
        activePlans: {
          current: 2,
          limit: TIER_LIMITS.free.maxActivePlans,
        },
        regenerations: {
          used: 3,
          limit: TIER_LIMITS.free.monthlyRegenerations,
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

      // Use some regenerations
      const month = getCurrentMonth();
      await db.insert(usageMetrics).values({
        userId,
        month,
        regenerationsUsed: 20,
        exportsUsed: 100,
      });

      const summary = await getUsageSummary(userId, db);

      expect(summary).toEqual({
        tier: 'pro',
        activePlans: {
          current: 50,
          limit: Infinity,
        },
        regenerations: {
          used: 20,
          limit: TIER_LIMITS.pro.monthlyRegenerations,
        },
      });
    });

    it('returns zero counters without creating a usage metrics row', async () => {
      const userId = await ensureUser({
        authUserId: 'user_summary_read_only',
        email: 'summary.readonly@example.com',
      });

      // No metrics yet
      const before = await db
        .select()
        .from(usageMetrics)
        .where(sql`user_id = ${userId}`);
      expect(before).toHaveLength(0);

      const summary = await getUsageSummary(userId, db);

      expect(summary.regenerations.used).toBe(0);
      expect(summary).not.toHaveProperty('lessonGenerations');
      expect(summary).not.toHaveProperty('exports');

      // Summary reads should not write a row just to display zeros.
      const after = await db
        .select()
        .from(usageMetrics)
        .where(sql`user_id = ${userId}`);
      expect(after).toHaveLength(0);
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
