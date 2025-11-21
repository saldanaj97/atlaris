import { describe, expect, it } from 'vitest';

import { sql } from 'drizzle-orm';

import { ensureUser } from '@/../tests/helpers/db';
import { usageMetrics, users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

describe('Stripe DB schema', () => {
  describe('users (subscription + Stripe fields)', () => {
    it('defaults subscriptionTier to free via ensureUser()', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_sub_defaults',
        email: 'defaults@example.com',
      });
      const rows = await db.query.users.findMany({
        where: (fields, { eq }) => eq(fields.id, userId),
        columns: { subscriptionTier: true },
      });
      expect(rows[0]?.subscriptionTier).toBe('free');
    });

    it('accepts valid subscriptionTier enum values', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_enum_valid',
        email: 'enumvalid@example.com',
      });
      await db
        .update(users)
        .set({ subscriptionTier: 'starter' })
        .where(sql`id = ${userId}`);
      await db
        .update(users)
        .set({ subscriptionTier: 'pro' })
        .where(sql`id = ${userId}`);
      const rows = await db.query.users.findMany({
        where: (fields, { eq }) => eq(fields.id, userId),
        columns: { subscriptionTier: true },
      });
      expect(rows[0]?.subscriptionTier).toBe('pro');
    });

    it('rejects invalid subscriptionTier values', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_enum_invalid',
        email: 'invalid@example.com',
      });
      await expect(
        db
          .update(users)
          .set({ subscriptionTier: 'gold' as any })
          .where(sql`id = ${userId}`)
      ).rejects.toThrow();
    });

    it('enforces uniqueness on stripeCustomerId and stripeSubscriptionId', async () => {
      const a = await ensureUser({
        clerkUserId: 'u_a',
        email: 'a@example.com',
      });
      const b = await ensureUser({
        clerkUserId: 'u_b',
        email: 'b@example.com',
      });

      await db
        .update(users)
        .set({ stripeCustomerId: 'cus_123' })
        .where(sql`id = ${a}`);
      await db
        .update(users)
        .set({ stripeSubscriptionId: 'sub_456' })
        .where(sql`id = ${a}`);

      await expect(
        db
          .update(users)
          .set({ stripeCustomerId: 'cus_123' })
          .where(sql`id = ${b}`)
      ).rejects.toThrow();
      await expect(
        db
          .update(users)
          .set({ stripeSubscriptionId: 'sub_456' })
          .where(sql`id = ${b}`)
      ).rejects.toThrow();
    });

    it('accepts valid subscriptionStatus values and a timestamp for subscriptionPeriodEnd', async () => {
      const userId = await ensureUser({
        clerkUserId: 'u_status',
        email: 'status@example.com',
      });

      await db
        .update(users)
        .set({
          subscriptionStatus: 'trialing',
          subscriptionPeriodEnd: new Date(),
        })
        .where(sql`id = ${userId}`);

      const rows = await db.query.users.findMany({
        where: (fields, { eq }) => eq(fields.id, userId),
        columns: { subscriptionStatus: true, subscriptionPeriodEnd: true },
      });
      expect(rows[0]?.subscriptionStatus).toBe('trialing');
      expect(rows[0]?.subscriptionPeriodEnd).toBeInstanceOf(Date);
    });
  });

  describe('usage_metrics', () => {
    it('inserts with defaults and non-negative checks', async () => {
      const userId = await ensureUser({
        clerkUserId: 'u_metrics_defaults',
        email: 'metrics.defaults@example.com',
      });

      const [row] = await db
        .insert(usageMetrics)
        .values({ userId, month: '2025-01' })
        .returning();

      expect(row.plansGenerated).toBe(0);
      expect(row.regenerationsUsed).toBe(0);
      expect(row.exportsUsed).toBe(0);
    });

    it('enforces unique (userId, month)', async () => {
      const userId = await ensureUser({
        clerkUserId: 'u_metrics_unique',
        email: 'metrics.unique@example.com',
      });

      await db.insert(usageMetrics).values({ userId, month: '2025-02' });
      await expect(
        db.insert(usageMetrics).values({ userId, month: '2025-02' })
      ).rejects.toThrow();
    });

    it('rejects negative counters', async () => {
      const userId = await ensureUser({
        clerkUserId: 'u_metrics_neg',
        email: 'metrics.neg@example.com',
      });
      await expect(
        db
          .insert(usageMetrics)
          .values({ userId, month: '2025-03', plansGenerated: -1 })
      ).rejects.toThrow();
      await expect(
        db
          .insert(usageMetrics)
          .values({ userId, month: '2025-03', regenerationsUsed: -1 })
      ).rejects.toThrow();
      await expect(
        db
          .insert(usageMetrics)
          .values({ userId, month: '2025-03', exportsUsed: -1 })
      ).rejects.toThrow();
    });

    it('cascades delete when user is removed', async () => {
      const userId = await ensureUser({
        clerkUserId: 'u_metrics_cascade',
        email: 'metrics.cascade@example.com',
      });
      await db.insert(usageMetrics).values({ userId, month: '2025-04' });

      await db.delete(users).where(sql`id = ${userId}`);

      const metrics = await db.select().from(usageMetrics);
      expect(metrics.find((m) => m.userId === userId)).toBeUndefined();
    });

    it('exposes expected indexes for user_id and month', async () => {
      const indexes = await db.execute<{
        schemaname: string;
        tablename: string;
        indexname: string;
      }>(
        sql`select schemaname, tablename, indexname from pg_indexes where schemaname = 'public' and tablename = 'usage_metrics'`
      );

      const names = indexes.map((r) => r.indexname);
      expect(names).toEqual(
        expect.arrayContaining([
          'idx_usage_metrics_user_id',
          'idx_usage_metrics_month',
        ])
      );
    });
  });
});
