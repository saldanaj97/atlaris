import { randomUUID } from 'node:crypto';
import { createTestPlan } from '@tests/fixtures/plans';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BillingSnapshotNotFoundError,
  getBillingAccountSnapshot,
} from '@/features/billing/account-snapshot';
import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { ensureStripeWebhookEvents, ensureUser } from '../../helpers/db';
import { markUserAsSubscribed } from '../../helpers/subscription';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

async function createUniqueUser(subscriptionTier?: 'free' | 'starter' | 'pro') {
  const authUserId = buildTestAuthUserId('billing-account-snapshot');
  const email = buildTestEmail(authUserId);
  return ensureUser({ authUserId, email, subscriptionTier });
}

describe('getBillingAccountSnapshot', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await ensureStripeWebhookEvents();
  });

  it('returns a canonical snapshot for a free user without billing portal access', async () => {
    const userId = await createUniqueUser('free');

    const snapshot = await getBillingAccountSnapshot({ userId, dbClient: db });

    expect(snapshot.tier).toBe('free');
    expect(snapshot.subscriptionStatus).toBeNull();
    expect(snapshot.subscriptionPeriodEnd).toBeNull();
    expect(snapshot.cancelAtPeriodEnd).toBe(false);
    expect(snapshot.canOpenBillingPortal).toBe(false);
    expect(snapshot.usage.activePlans.current).toBe(0);
    expect(snapshot.usage.regenerations.used).toBe(0);
    expect(snapshot.usage.exports.used).toBe(0);
    expect(snapshot.tier).toBe(snapshot.usage.tier);
    expect(snapshot.usage.activePlans.limit).toBe(
      TIER_LIMITS.free.maxActivePlans
    );
  });

  it('returns subscription state, portal eligibility, and usage for an active subscriber', async () => {
    const userId = await createUniqueUser('starter');
    const periodEnd = new Date('2026-06-15T00:00:00.000Z');

    await markUserAsSubscribed(userId, {
      subscriptionTier: 'starter',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: periodEnd,
    });

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
    expect(snapshot.canOpenBillingPortal).toBe(true);
    expect(snapshot.usage.activePlans.current).toBe(2);
    expect(snapshot.usage.activePlans.limit).toBeGreaterThanOrEqual(2);
    expect(snapshot.tier).toBe(snapshot.usage.tier);
    expect(snapshot.usage.activePlans.limit).toBe(
      TIER_LIMITS.starter.maxActivePlans
    );
  });

  it('preserves cancelAtPeriodEnd and keeps portal disabled when no subscription lifecycle exists', async () => {
    const userId = await createUniqueUser('pro');

    await db
      .update(users)
      .set({
        stripeCustomerId: 'cus_precreated_only',
        subscriptionStatus: null,
        cancelAtPeriodEnd: true,
      })
      .where(eq(users.id, userId));

    const snapshot = await getBillingAccountSnapshot({ userId, dbClient: db });

    expect(snapshot.tier).toBe('pro');
    expect(snapshot.cancelAtPeriodEnd).toBe(true);
    expect(snapshot.stripeCustomerId).toBe('cus_precreated_only');
    expect(snapshot.canOpenBillingPortal).toBe(false);
  });

  it('subscription projection returns lifecycle and portal without usage', async () => {
    const userId = await createUniqueUser('starter');
    const periodEnd = new Date('2026-06-15T00:00:00.000Z');

    await markUserAsSubscribed(userId, {
      subscriptionTier: 'starter',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: periodEnd,
    });

    const snapshot = await getBillingAccountSnapshot({
      userId,
      dbClient: db,
      projection: 'subscription',
    });

    expect(snapshot.tier).toBe('starter');
    expect(snapshot.subscriptionStatus).toBe('active');
    expect(snapshot.canOpenBillingPortal).toBe(true);
    expect('usage' in snapshot).toBe(false);
  });

  it('throws BillingSnapshotNotFoundError with stable code when user id does not exist', async () => {
    const missingId = randomUUID();

    const error = await getBillingAccountSnapshot({
      userId: missingId,
      dbClient: db,
    }).then(
      () => {
        throw new Error('expected getBillingAccountSnapshot to reject');
      },
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(BillingSnapshotNotFoundError);
    const snapshotError = error as BillingSnapshotNotFoundError;
    expect(snapshotError.code()).toBe('BILLING_SNAPSHOT_NOT_FOUND');
    expect(snapshotError.status()).toBe(500);
  });
});
