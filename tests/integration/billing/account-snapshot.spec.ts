import { ensureUser } from '../../helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';
import {
  BillingSnapshotNotFoundError,
  getBillingAccountSnapshot,
} from '@/features/billing/account-snapshot';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

async function createUniqueUser(subscriptionTier?: 'free' | 'starter' | 'pro') {
  const authUserId = buildTestAuthUserId('billing-account-snapshot');
  const email = buildTestEmail(authUserId);
  return ensureUser({ authUserId, email, subscriptionTier });
}

describe('getBillingAccountSnapshot', () => {
  it('returns a canonical snapshot for a free user', async () => {
    const userId = await createUniqueUser('free');

    const snapshot = await getBillingAccountSnapshot({ userId, dbClient: db });

    expect(snapshot.tier).toBe('free');
    expect(snapshot.subscriptionStatus).toBeNull();
    expect(snapshot.subscriptionPeriodEnd).toBeNull();
    expect(snapshot.cancelAtPeriodEnd).toBe(false);
    expect(snapshot.usage.activePlans.current).toBe(0);
    expect(snapshot.usage.regenerations.used).toBe(0);
    expect(snapshot.usage.exports.used).toBe(0);
    expect(snapshot.tier).toBe(snapshot.usage.tier);
    expect(snapshot.usage.activePlans.limit).toBe(
      TIER_LIMITS.free.maxActivePlans,
    );
  });

  it('returns subscription state and usage for an active subscriber', async () => {
    const userId = await createUniqueUser('starter');
    const periodEnd = new Date('2026-06-15T00:00:00.000Z');

    await db
      .update(users)
      .set({
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
        subscriptionPeriodEnd: periodEnd,
      })
      .where(eq(users.id, userId));

    await createTestPlan({
      userId,
      topic: 'TypeScript',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'ready',
      isQuotaEligible: true,
      finalizedAt: new Date(),
    });
    await createTestPlan({
      userId,
      topic: 'React',
      skillLevel: 'intermediate',
      weeklyHours: 6,
      learningStyle: 'practice',
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'ready',
      isQuotaEligible: true,
      finalizedAt: new Date(),
    });

    const snapshot = await getBillingAccountSnapshot({ userId, dbClient: db });

    expect(snapshot.tier).toBe('starter');
    expect(snapshot.subscriptionStatus).toBe('active');
    expect(snapshot.subscriptionPeriodEnd).toEqual(periodEnd);
    expect(snapshot.usage.activePlans.current).toBe(2);
    expect(snapshot.tier).toBe(snapshot.usage.tier);
    expect(snapshot.usage.activePlans.limit).toBe(
      TIER_LIMITS.starter.maxActivePlans,
    );
  });

  it('preserves cancelAtPeriodEnd when no subscription lifecycle exists', async () => {
    const userId = await createUniqueUser('pro');

    await db
      .update(users)
      .set({
        subscriptionStatus: null,
        cancelAtPeriodEnd: true,
      })
      .where(eq(users.id, userId));

    const snapshot = await getBillingAccountSnapshot({ userId, dbClient: db });

    expect(snapshot.tier).toBe('pro');
    expect(snapshot.cancelAtPeriodEnd).toBe(true);
  });

  it('throws BillingSnapshotNotFoundError with stable code when user id does not exist', async () => {
    const missingId = randomUUID();

    await expect(
      getBillingAccountSnapshot({ userId: missingId, dbClient: db }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof BillingSnapshotNotFoundError &&
        err.code() === 'BILLING_SNAPSHOT_NOT_FOUND' &&
        err.status() === 404,
    );
  });
});
