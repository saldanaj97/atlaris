import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { ensureUser, truncateAll } from '@/../tests/helpers/db';
import { db } from '@/lib/db/drizzle';
import { learningPlans, usageMetrics, users } from '@/lib/db/schema';
import {
  checkPlanLimit,
  checkRegenerationLimit,
  checkExportLimit,
  incrementUsage,
  getUsageSummary,
} from '@/lib/stripe/usage';

describe('Usage Tracking', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe('checkPlanLimit', () => {
    it('allows free tier user with 0 plans to create up to 3 plans', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_free_plan_limit',
        email: 'free@example.com',
      });

      // No plans yet
      expect(await checkPlanLimit(userId)).toBe(true);

      // Create 3 plans
      await db.insert(learningPlans).values([
        {
          userId,
          topic: 'Topic 1',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
        },
        {
          userId,
          topic: 'Topic 2',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
        },
        {
          userId,
          topic: 'Topic 3',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
        },
      ]);

      // At limit
      expect(await checkPlanLimit(userId)).toBe(false);
    });

    it('allows starter tier user up to 10 plans', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_starter_plan_limit',
        email: 'starter@example.com',
      });

      // Upgrade to starter
      await db
        .update(users)
        .set({ subscriptionTier: 'starter' })
        .where(sql`id = ${userId}`);

      // Create 10 plans
      const plans = Array.from({ length: 10 }, (_, i) => ({
        userId,
        topic: `Topic ${i + 1}`,
        skillLevel: 'beginner' as const,
        weeklyHours: 5,
        learningStyle: 'mixed' as const,
      }));
      await db.insert(learningPlans).values(plans);

      // At limit
      expect(await checkPlanLimit(userId)).toBe(false);

      // Below limit - delete one plan
      const planToDelete = await db
        .select({ id: learningPlans.id })
        .from(learningPlans)
        .where(sql`user_id = ${userId}`)
        .limit(1);
      if (planToDelete[0]) {
        await db.delete(learningPlans).where(sql`id = ${planToDelete[0].id}`);
      }
      expect(await checkPlanLimit(userId)).toBe(true);
    });

    it('allows pro tier user unlimited plans', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_pro_plan_limit',
        email: 'pro@example.com',
      });

      // Upgrade to pro
      await db
        .update(users)
        .set({ subscriptionTier: 'pro' })
        .where(sql`id = ${userId}`);

      // Create 100 plans (way more than starter)
      const plans = Array.from({ length: 100 }, (_, i) => ({
        userId,
        topic: `Topic ${i + 1}`,
        skillLevel: 'beginner' as const,
        weeklyHours: 5,
        learningStyle: 'mixed' as const,
      }));
      await db.insert(learningPlans).values(plans);

      // Still allowed
      expect(await checkPlanLimit(userId)).toBe(true);
    });
  });

  describe('checkRegenerationLimit', () => {
    it('allows free tier user 5 regenerations per month', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_free_regen',
        email: 'free.regen@example.com',
      });

      const month = new Date().toISOString().slice(0, 7);

      // No usage yet
      expect(await checkRegenerationLimit(userId)).toBe(true);

      // Use 5 regenerations - update the row that was created by the check above
      await db
        .update(usageMetrics)
        .set({ regenerationsUsed: 5 })
        .where(sql`user_id = ${userId} AND month = ${month}`);

      // At limit
      expect(await checkRegenerationLimit(userId)).toBe(false);
    });

    it('allows starter tier user 10 regenerations per month', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_starter_regen',
        email: 'starter.regen@example.com',
      });

      // Upgrade to starter
      await db
        .update(users)
        .set({ subscriptionTier: 'starter' })
        .where(sql`id = ${userId}`);

      const month = new Date().toISOString().slice(0, 7);

      // Use 9 regenerations
      await db.insert(usageMetrics).values({
        userId,
        month,
        regenerationsUsed: 9,
      });

      // Below limit
      expect(await checkRegenerationLimit(userId)).toBe(true);

      // Use 1 more
      await db
        .update(usageMetrics)
        .set({ regenerationsUsed: 10 })
        .where(sql`user_id = ${userId} AND month = ${month}`);

      // At limit
      expect(await checkRegenerationLimit(userId)).toBe(false);
    });

    it('allows pro tier user 50 regenerations per month', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_pro_regen',
        email: 'pro.regen@example.com',
      });

      // Upgrade to pro
      await db
        .update(users)
        .set({ subscriptionTier: 'pro' })
        .where(sql`id = ${userId}`);

      const month = new Date().toISOString().slice(0, 7);

      // Use 49 regenerations
      await db.insert(usageMetrics).values({
        userId,
        month,
        regenerationsUsed: 49,
      });

      // Below limit
      expect(await checkRegenerationLimit(userId)).toBe(true);

      // Use 1 more
      await db
        .update(usageMetrics)
        .set({ regenerationsUsed: 50 })
        .where(sql`user_id = ${userId} AND month = ${month}`);

      // At limit
      expect(await checkRegenerationLimit(userId)).toBe(false);
    });
  });

  describe('checkExportLimit', () => {
    it('allows free tier user 10 exports per month', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_free_export',
        email: 'free.export@example.com',
      });

      const month = new Date().toISOString().slice(0, 7);

      // No usage yet
      expect(await checkExportLimit(userId)).toBe(true);

      // Use 10 exports - update the row that was created by the check above
      await db
        .update(usageMetrics)
        .set({ exportsUsed: 10 })
        .where(sql`user_id = ${userId} AND month = ${month}`);

      // At limit
      expect(await checkExportLimit(userId)).toBe(false);
    });

    it('allows starter tier user 50 exports per month', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_starter_export',
        email: 'starter.export@example.com',
      });

      // Upgrade to starter
      await db
        .update(users)
        .set({ subscriptionTier: 'starter' })
        .where(sql`id = ${userId}`);

      const month = new Date().toISOString().slice(0, 7);

      // Use 50 exports
      await db.insert(usageMetrics).values({
        userId,
        month,
        exportsUsed: 50,
      });

      // At limit
      expect(await checkExportLimit(userId)).toBe(false);
    });

    it('allows pro tier user unlimited exports', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_pro_export',
        email: 'pro.export@example.com',
      });

      // Upgrade to pro
      await db
        .update(users)
        .set({ subscriptionTier: 'pro' })
        .where(sql`id = ${userId}`);

      const month = new Date().toISOString().slice(0, 7);

      // Use 1000 exports (way more than starter)
      await db.insert(usageMetrics).values({
        userId,
        month,
        exportsUsed: 1000,
      });

      // Still allowed
      expect(await checkExportLimit(userId)).toBe(true);
    });
  });

  describe('incrementUsage', () => {
    it('creates usage metrics row if not exists and increments plan counter', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_increment_plan',
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
        clerkUserId: 'user_increment_regen',
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
        clerkUserId: 'user_increment_export',
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
        clerkUserId: 'user_increment_timestamp',
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
    it('returns complete usage summary for free tier', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_summary_free',
        email: 'summary.free@example.com',
      });

      // Create 2 plans
      await db.insert(learningPlans).values([
        {
          userId,
          topic: 'Topic 1',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
        },
        {
          userId,
          topic: 'Topic 2',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
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
        clerkUserId: 'user_summary_pro',
        email: 'summary.pro@example.com',
      });

      // Upgrade to pro
      await db
        .update(users)
        .set({ subscriptionTier: 'pro' })
        .where(sql`id = ${userId}`);

      // Create 50 plans
      const plans = Array.from({ length: 50 }, (_, i) => ({
        userId,
        topic: `Topic ${i + 1}`,
        skillLevel: 'beginner' as const,
        weeklyHours: 5,
        learningStyle: 'mixed' as const,
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
        clerkUserId: 'user_summary_create',
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
        clerkUserId: 'user_monthly_partition',
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
