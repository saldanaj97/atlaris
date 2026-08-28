import type { BackendBillingSubscription } from '@/features/billing/clerk-billing/projection';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';

import {
  applyVerifiedClerkBillingEvent,
  CLERK_BILLING_PAYER_LOCK_NAMESPACE,
  CLERK_BILLING_WEBHOOK_LEASE_MS,
  ClerkBillingRefreshTimeoutError,
  reconcileClerkBillingEntitlements,
} from '@/features/billing/clerk-billing/reconciliation';
import {
  clerkWebhookEventClaims,
  clerkWebhookEvents,
  users,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { createDeferredPromise } from '@tests/helpers/deferred-promise';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

function billingEvent(payerUserId = 'billing_claim_user'): WebhookEvent {
  return {
    type: 'subscription.updated',
    data: {
      id: 'sub_claim_fixture',
      status: 'active',
      payer: { user_id: payerUserId },
      payer_id: payerUserId,
      items: [],
    },
  } as unknown as WebhookEvent;
}

function userUpdatedEvent(
  authUserId: string,
  email: string,
  updatedAt: Date,
): WebhookEvent {
  return {
    type: 'user.updated',
    data: {
      id: authUserId,
      updated_at: updatedAt.getTime(),
      primary_email_address_id: 'email_primary',
      email_addresses: [
        {
          id: 'email_primary',
          email_address: email,
          verification: { status: 'verified' },
        },
      ],
    },
  } as unknown as WebhookEvent;
}

function userCreatedEvent(
  authUserId: string,
  email: string,
  updatedAt: Date,
): WebhookEvent {
  return {
    ...userUpdatedEvent(authUserId, email, updatedAt),
    type: 'user.created',
  } as unknown as WebhookEvent;
}

function userDeletedEvent(authUserId: string): WebhookEvent {
  return {
    type: 'user.deleted',
    data: { id: authUserId },
  } as unknown as WebhookEvent;
}

function subscription(
  overrides: Partial<BackendBillingSubscription> = {},
): BackendBillingSubscription {
  return {
    payerId: 'billing_claim_user',
    status: 'active',
    subscriptionItems: [
      {
        id: 'item_claim_pro',
        status: 'active',
        planId: 'cplan_pro_fixture',
        plan: { id: 'cplan_pro_fixture', slug: 'pro_plan' },
        amount: { amount: 2_000 },
        periodEnd: new Date('2026-09-01T00:00:00.000Z').getTime(),
        isFreeTrial: false,
      },
    ],
    ...overrides,
  };
}

function logger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as never;
}

async function currentTier(authUserId: string): Promise<string | undefined> {
  const [user] = await db
    .select({ subscriptionTier: users.subscriptionTier })
    .from(users)
    .where(eq(users.authUserId, authUserId));
  return user?.subscriptionTier;
}

function isLockTimeoutError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object') {
      return false;
    }
    if ('code' in current && current.code === '55P03') {
      return true;
    }
    if (
      'message' in current &&
      typeof current.message === 'string' &&
      /lock timeout/i.test(current.message)
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

async function seedBillingUser(): Promise<void> {
  await ensureUser({
    authUserId: 'billing_claim_user',
    email: buildTestEmail(buildTestAuthUserId('clerk-claim')),
    subscriptionTier: 'starter',
  });
}

describe('Clerk billing webhook claims', () => {
  it('skips a completed duplicate before calling Clerk', async () => {
    await db.insert(clerkWebhookEvents).values({
      eventId: 'evt_claim_completed',
      type: 'subscription.updated',
    });
    const getSubscription = vi.fn().mockResolvedValue(subscription());

    await expect(
      applyVerifiedClerkBillingEvent(billingEvent(), 'evt_claim_completed', {
        clerkClient: {
          billing: { getUserBillingSubscription: getSubscription },
        },
        db,
        logger: logger(),
      }),
    ).resolves.toEqual({ status: 'duplicate' });

    expect(getSubscription).not.toHaveBeenCalled();
    await expect(
      db
        .select({ eventId: clerkWebhookEventClaims.eventId })
        .from(clerkWebhookEventClaims)
        .where(eq(clerkWebhookEventClaims.eventId, 'evt_claim_completed')),
    ).resolves.toEqual([]);
  });

  it('preserves the local tier for an unknown item mixed with terminal billing', async () => {
    await seedBillingUser();
    const baseItem = subscription().subscriptionItems[0]!;
    const getSubscription = vi.fn().mockResolvedValue(
      subscription({
        status: 'ended',
        subscriptionItems: [
          {
            ...baseItem,
            id: 'item_unknown_active',
            planId: 'cplan_unknown',
            plan: { id: 'cplan_unknown', slug: 'enterprise_plan' },
          },
          {
            ...baseItem,
            id: 'item_pro_ended',
            status: 'ended',
            periodEnd: new Date('2026-06-01T00:00:00.000Z').getTime(),
          },
        ],
      }),
    );

    await expect(
      applyVerifiedClerkBillingEvent(
        billingEvent(),
        'evt_unknown_terminal_plan',
        {
          clerkClient: {
            billing: { getUserBillingSubscription: getSubscription },
          },
          db,
          logger: logger(),
        },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'ignored' });

    await expect(currentTier('billing_claim_user')).resolves.toBe('starter');
  });

  it('projects a signed user event once without refreshing Clerk Billing', async () => {
    const authUserId = buildTestAuthUserId('clerk-identity-webhook');
    const initialEmail = buildTestEmail(authUserId);
    const projectedEmail = `projected-${initialEmail}`;
    const clerkUpdatedAt = new Date('2026-08-11T10:01:00.000Z');
    await ensureUser({ authUserId, email: initialEmail });
    const getSubscription = vi.fn();
    const eventId = `evt_identity_${authUserId}`;
    const event = userUpdatedEvent(authUserId, projectedEmail, clerkUpdatedAt);

    await expect(
      applyVerifiedClerkBillingEvent(event, eventId, {
        clerkClient: {
          billing: { getUserBillingSubscription: getSubscription },
        },
        db,
        logger: logger(),
      }),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });

    expect(getSubscription).not.toHaveBeenCalled();
    await expect(
      db
        .select({
          email: users.email,
          clerkUserUpdatedAt: users.clerkUserUpdatedAt,
        })
        .from(users)
        .where(eq(users.authUserId, authUserId)),
    ).resolves.toEqual([
      { email: projectedEmail, clerkUserUpdatedAt: clerkUpdatedAt },
    ]);

    await expect(
      applyVerifiedClerkBillingEvent(event, eventId, {
        clerkClient: {
          billing: { getUserBillingSubscription: getSubscription },
        },
        db,
        logger: logger(),
      }),
    ).resolves.toEqual({ status: 'duplicate' });
    expect(getSubscription).not.toHaveBeenCalled();
    await expect(
      db
        .select({ eventId: clerkWebhookEvents.eventId })
        .from(clerkWebhookEvents)
        .where(eq(clerkWebhookEvents.eventId, eventId)),
    ).resolves.toEqual([{ eventId }]);
  });

  it('does not let stale events or updates after deletion restore an identity', async () => {
    const authUserId = buildTestAuthUserId('clerk-identity-tombstone');
    const initialEmail = buildTestEmail(authUserId);
    const newerEmail = `newer-${initialEmail}`;
    const staleEmail = `stale-${initialEmail}`;
    const updatedAt = new Date('2026-08-11T10:02:00.000Z');
    await ensureUser({ authUserId, email: initialEmail });

    await expect(
      applyVerifiedClerkBillingEvent(
        userUpdatedEvent(authUserId, newerEmail, updatedAt),
        `evt_identity_new_${authUserId}`,
        { db, logger: logger() },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });
    await expect(
      applyVerifiedClerkBillingEvent(
        userUpdatedEvent(
          authUserId,
          staleEmail,
          new Date(updatedAt.getTime() - 1),
        ),
        `evt_identity_stale_${authUserId}`,
        { db, logger: logger() },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'ignored' });
    await expect(
      applyVerifiedClerkBillingEvent(
        userDeletedEvent(authUserId),
        `evt_identity_deleted_${authUserId}`,
        { db, logger: logger() },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });
    await expect(
      applyVerifiedClerkBillingEvent(
        userUpdatedEvent(
          authUserId,
          `late-${initialEmail}`,
          new Date(updatedAt.getTime() + 1),
        ),
        `evt_identity_late_${authUserId}`,
        { db, logger: logger() },
      ),
    ).resolves.toEqual({
      status: 'inserted',
      result: 'skipped_deleted_user',
    });

    await expect(
      db
        .select({
          email: users.email,
          clerkDeletedAt: users.clerkDeletedAt,
        })
        .from(users)
        .where(eq(users.authUserId, authUserId)),
    ).resolves.toMatchObject([
      { email: null, clerkDeletedAt: expect.any(Date) },
    ]);
  });

  it('rolls back a conflicting identity email instead of transferring it', async () => {
    const firstAuthUserId = buildTestAuthUserId('clerk-identity-first');
    const secondAuthUserId = buildTestAuthUserId('clerk-identity-second');
    const firstEmail = buildTestEmail(firstAuthUserId);
    const conflictingEmail = buildTestEmail(secondAuthUserId);
    await ensureUser({ authUserId: firstAuthUserId, email: firstEmail });
    await ensureUser({ authUserId: secondAuthUserId, email: conflictingEmail });
    const eventId = `evt_identity_conflict_${firstAuthUserId}`;

    await expect(
      applyVerifiedClerkBillingEvent(
        userUpdatedEvent(
          firstAuthUserId,
          conflictingEmail,
          new Date('2026-08-11T10:04:00.000Z'),
        ),
        eventId,
        { db, logger: logger() },
      ),
    ).rejects.toThrow(/Failed query:|unique|duplicate|23505/i);

    await expect(
      db
        .select({ authUserId: users.authUserId, email: users.email })
        .from(users)
        .where(eq(users.authUserId, firstAuthUserId)),
    ).resolves.toEqual([{ authUserId: firstAuthUserId, email: firstEmail }]);
    await expect(
      db
        .select({ authUserId: users.authUserId, email: users.email })
        .from(users)
        .where(eq(users.authUserId, secondAuthUserId)),
    ).resolves.toEqual([
      { authUserId: secondAuthUserId, email: conflictingEmail },
    ]);
    await expect(
      db
        .select({ eventId: clerkWebhookEvents.eventId })
        .from(clerkWebhookEvents)
        .where(eq(clerkWebhookEvents.eventId, eventId)),
    ).resolves.toEqual([]);
  });

  it('acknowledges user.created before local provisioning', async () => {
    const authUserId = buildTestAuthUserId('clerk-identity-missing');
    const eventId = `evt_identity_missing_${authUserId}`;

    await expect(
      applyVerifiedClerkBillingEvent(
        userCreatedEvent(
          authUserId,
          buildTestEmail(authUserId),
          new Date('2026-08-11T10:03:00.000Z'),
        ),
        eventId,
        { db, logger: logger() },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'skipped_no_user' });
    await expect(
      db
        .select({ eventId: clerkWebhookEvents.eventId })
        .from(clerkWebhookEvents)
        .where(eq(clerkWebhookEvents.eventId, eventId)),
    ).resolves.toEqual([{ eventId }]);
  });

  it('replays a missing user.updated event after local provisioning', async () => {
    const authUserId = buildTestAuthUserId('clerk-identity-updated-missing');
    const eventId = `evt_identity_updated_missing_${authUserId}`;
    const staleEmail = buildTestEmail(`stale-${authUserId}`);
    const projectedEmail = buildTestEmail(`projected-${authUserId}`);
    const clerkUpdatedAt = new Date('2026-08-11T10:03:00.000Z');
    const event = userUpdatedEvent(authUserId, projectedEmail, clerkUpdatedAt);

    await expect(
      applyVerifiedClerkBillingEvent(event, eventId, {
        db,
        logger: logger(),
      }),
    ).rejects.toThrow('No local user found for Clerk update event');
    await expect(
      db
        .select({ eventId: clerkWebhookEvents.eventId })
        .from(clerkWebhookEvents)
        .where(eq(clerkWebhookEvents.eventId, eventId)),
    ).resolves.toEqual([]);
    await expect(
      db
        .select({ eventId: clerkWebhookEventClaims.eventId })
        .from(clerkWebhookEventClaims)
        .where(eq(clerkWebhookEventClaims.eventId, eventId)),
    ).resolves.toEqual([]);

    const staleUpdatedAt = new Date(clerkUpdatedAt.getTime() - 1_000);
    await ensureUser({ authUserId, email: staleEmail });
    await db
      .update(users)
      .set({ email: staleEmail, clerkUserUpdatedAt: staleUpdatedAt })
      .where(eq(users.authUserId, authUserId));

    await expect(
      applyVerifiedClerkBillingEvent(event, eventId, {
        db,
        logger: logger(),
      }),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });
    await expect(
      db
        .select({
          email: users.email,
          clerkUserUpdatedAt: users.clerkUserUpdatedAt,
        })
        .from(users)
        .where(eq(users.authUserId, authUserId)),
    ).resolves.toEqual([
      { email: projectedEmail, clerkUserUpdatedAt: clerkUpdatedAt },
    ]);

    await expect(
      applyVerifiedClerkBillingEvent(event, eventId, {
        db,
        logger: logger(),
      }),
    ).resolves.toEqual({ status: 'duplicate' });
    await expect(
      db
        .select({ eventId: clerkWebhookEvents.eventId })
        .from(clerkWebhookEvents)
        .where(eq(clerkWebhookEvents.eventId, eventId)),
    ).resolves.toEqual([{ eventId }]);
  });

  it('replays a missing user deletion after local provisioning', async () => {
    const authUserId = buildTestAuthUserId('clerk-deletion-missing');
    const eventId = `evt_deletion_missing_${authUserId}`;
    const event = userDeletedEvent(authUserId);

    await expect(
      applyVerifiedClerkBillingEvent(event, eventId, {
        db,
        logger: logger(),
      }),
    ).rejects.toThrow('No local user found for Clerk deletion event');
    await expect(
      db
        .select({ eventId: clerkWebhookEvents.eventId })
        .from(clerkWebhookEvents)
        .where(eq(clerkWebhookEvents.eventId, eventId)),
    ).resolves.toEqual([]);

    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    await expect(
      applyVerifiedClerkBillingEvent(event, eventId, {
        db,
        logger: logger(),
      }),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });
    await expect(
      db
        .select({
          email: users.email,
          clerkDeletedAt: users.clerkDeletedAt,
        })
        .from(users)
        .where(eq(users.authUserId, authUserId)),
    ).resolves.toMatchObject([
      { email: null, clerkDeletedAt: expect.any(Date) },
    ]);
    await expect(
      db
        .select({ eventId: clerkWebhookEvents.eventId })
        .from(clerkWebhookEvents)
        .where(eq(clerkWebhookEvents.eventId, eventId)),
    ).resolves.toEqual([{ eventId }]);
  });

  it('allows only one concurrent claimant and one Clerk refresh', async () => {
    await seedBillingUser();
    let releaseRefresh!: () => void;
    let refreshStarted!: () => void;
    const refreshStartedPromise = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    const refreshGate = new Promise<BackendBillingSubscription>((resolve) => {
      releaseRefresh = () => resolve(subscription());
    });
    const firstGet = vi.fn(async () => {
      refreshStarted();
      return refreshGate;
    });
    const secondGet = vi.fn().mockResolvedValue(subscription());
    const eventId = 'evt_claim_race';

    const first = applyVerifiedClerkBillingEvent(billingEvent(), eventId, {
      clerkClient: { billing: { getUserBillingSubscription: firstGet } },
      db,
      logger: logger(),
      createClaimToken: () => '00000000-0000-4000-8000-000000000011',
    });
    await refreshStartedPromise;

    await expect(
      applyVerifiedClerkBillingEvent(billingEvent(), eventId, {
        clerkClient: { billing: { getUserBillingSubscription: secondGet } },
        db,
        logger: logger(),
        createClaimToken: () => '00000000-0000-4000-8000-000000000012',
      }),
    ).resolves.toMatchObject({ status: 'in_flight' });

    releaseRefresh();
    await expect(first).resolves.toEqual({
      status: 'inserted',
      result: 'updated',
    });
    expect(firstGet).toHaveBeenCalledTimes(1);
    expect(secondGet).not.toHaveBeenCalled();

    const events = await db
      .select({ eventId: clerkWebhookEvents.eventId })
      .from(clerkWebhookEvents)
      .where(eq(clerkWebhookEvents.eventId, eventId));
    expect(events).toHaveLength(1);
    expect(
      await db
        .select({ eventId: clerkWebhookEventClaims.eventId })
        .from(clerkWebhookEventClaims)
        .where(eq(clerkWebhookEventClaims.eventId, eventId)),
    ).toEqual([]);
  });

  it('fences a slow owner after an expired claim is reclaimed', async () => {
    await seedBillingUser();
    let releaseRefresh!: () => void;
    let refreshStarted!: () => void;
    const refreshStartedPromise = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    const refreshGate = new Promise<BackendBillingSubscription>((resolve) => {
      releaseRefresh = () => resolve(subscription());
    });
    const firstGet = vi.fn(async () => {
      refreshStarted();
      return refreshGate;
    });
    const secondGet = vi
      .fn()
      .mockResolvedValue(subscription({ status: 'past_due' }));
    const eventId = 'evt_claim_stale_owner';

    const first = applyVerifiedClerkBillingEvent(billingEvent(), eventId, {
      clerkClient: { billing: { getUserBillingSubscription: firstGet } },
      db,
      logger: logger(),
      createClaimToken: () => '00000000-0000-4000-8000-000000000041',
    });
    await refreshStartedPromise;

    await db
      .update(clerkWebhookEventClaims)
      .set({ claimExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(clerkWebhookEventClaims.eventId, eventId));

    const second = applyVerifiedClerkBillingEvent(billingEvent(), eventId, {
      clerkClient: { billing: { getUserBillingSubscription: secondGet } },
      db,
      logger: logger(),
      createClaimToken: () => '00000000-0000-4000-8000-000000000042',
    });
    await vi.waitFor(() => {
      expect(secondGet).toHaveBeenCalled();
    });
    await expect(second).resolves.toEqual({
      status: 'inserted',
      result: 'updated',
    });

    releaseRefresh();
    await expect(first).resolves.toEqual({ status: 'duplicate' });
    expect(firstGet).toHaveBeenCalledTimes(1);
    expect(secondGet).toHaveBeenCalledTimes(1);
    expect(
      await db
        .select({ eventId: clerkWebhookEventClaims.eventId })
        .from(clerkWebhookEventClaims)
        .where(eq(clerkWebhookEventClaims.eventId, eventId)),
    ).toEqual([]);
  });

  it('reclaims an expired claim and completes the projection', async () => {
    await seedBillingUser();
    const eventId = 'evt_claim_reclaim';
    await db.insert(clerkWebhookEventClaims).values({
      eventId,
      claimToken: '00000000-0000-4000-8000-000000000021',
      claimExpiresAt: new Date(Date.now() - 1_000),
    });
    const getSubscription = vi.fn().mockResolvedValue(subscription());

    await expect(
      applyVerifiedClerkBillingEvent(billingEvent(), eventId, {
        clerkClient: {
          billing: { getUserBillingSubscription: getSubscription },
        },
        db,
        logger: logger(),
        createClaimToken: () => '00000000-0000-4000-8000-000000000022',
      }),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });

    expect(getSubscription).toHaveBeenCalledTimes(1);
    const [user] = await db
      .select({ subscriptionTier: users.subscriptionTier })
      .from(users)
      .where(eq(users.authUserId, 'billing_claim_user'));
    expect(user?.subscriptionTier).toBe('pro');
  });

  it('releases a failed claim so the next delivery can retry immediately', async () => {
    await seedBillingUser();
    const eventId = 'evt_claim_failure';
    const processingError = new Error('clerk unavailable');
    const failedGet = vi.fn().mockRejectedValue(processingError);

    await expect(
      applyVerifiedClerkBillingEvent(billingEvent(), eventId, {
        clerkClient: { billing: { getUserBillingSubscription: failedGet } },
        db,
        logger: logger(),
      }),
    ).rejects.toBe(processingError);
    await expect(currentTier('billing_claim_user')).resolves.toBe('starter');
    await expect(
      db
        .select({ eventId: clerkWebhookEvents.eventId })
        .from(clerkWebhookEvents)
        .where(eq(clerkWebhookEvents.eventId, eventId)),
    ).resolves.toEqual([]);
    await expect(
      db
        .select({ eventId: clerkWebhookEventClaims.eventId })
        .from(clerkWebhookEventClaims)
        .where(eq(clerkWebhookEventClaims.eventId, eventId)),
    ).resolves.toEqual([]);

    await expect(
      applyVerifiedClerkBillingEvent(billingEvent(), eventId, {
        clerkClient: {
          billing: {
            getUserBillingSubscription: vi
              .fn()
              .mockResolvedValue(subscription()),
          },
        },
        db,
        logger: logger(),
      }),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });
  });

  it('lets the legacy ledger win without allowing a stale claimant to project', async () => {
    await seedBillingUser();
    const eventId = 'evt_claim_legacy_race';
    await db.insert(clerkWebhookEventClaims).values({
      eventId,
      claimToken: '00000000-0000-4000-8000-000000000031',
      claimExpiresAt: new Date(Date.now() + CLERK_BILLING_WEBHOOK_LEASE_MS),
    });

    await db.insert(clerkWebhookEvents).values({
      eventId,
      type: 'subscription.updated',
    });

    const getSubscription = vi.fn().mockResolvedValue(subscription());
    await expect(
      applyVerifiedClerkBillingEvent(billingEvent(), eventId, {
        clerkClient: {
          billing: { getUserBillingSubscription: getSubscription },
        },
        db,
        logger: logger(),
      }),
    ).resolves.toEqual({ status: 'duplicate' });

    expect(getSubscription).not.toHaveBeenCalled();
    expect(
      await db
        .select({ eventId: clerkWebhookEventClaims.eventId })
        .from(clerkWebhookEventClaims)
        .where(eq(clerkWebhookEventClaims.eventId, eventId)),
    ).toEqual([]);
  });

  it('applies a later Clerk snapshot after an earlier same-payer event commits', async () => {
    const payerUserId = buildTestAuthUserId('clerk-payer-serialize');
    await ensureUser({
      authUserId: payerUserId,
      email: buildTestEmail(payerUserId),
      subscriptionTier: 'starter',
    });
    const staleSubscription = subscription({
      payerId: payerUserId,
      status: 'past_due',
      subscriptionItems: [
        {
          ...subscription().subscriptionItems[0]!,
          status: 'past_due',
        },
      ],
    });

    await expect(
      applyVerifiedClerkBillingEvent(
        billingEvent(payerUserId),
        `evt_stale_${payerUserId}`,
        {
          clerkClient: {
            billing: {
              getUserBillingSubscription: vi
                .fn()
                .mockResolvedValue(staleSubscription),
            },
          },
          db,
          logger: logger(),
        },
      ),
    ).resolves.toEqual({
      status: 'inserted',
      result: 'updated',
    });
    await expect(currentTier(payerUserId)).resolves.toBe('starter');

    await expect(
      applyVerifiedClerkBillingEvent(
        billingEvent(payerUserId),
        `evt_latest_${payerUserId}`,
        {
          clerkClient: {
            billing: {
              getUserBillingSubscription: vi
                .fn()
                .mockResolvedValue(subscription({ payerId: payerUserId })),
            },
          },
          db,
          logger: logger(),
        },
      ),
    ).resolves.toEqual({
      status: 'inserted',
      result: 'updated',
    });
    await expect(currentTier(payerUserId)).resolves.toBe('pro');
  });

  it('allows different payers to refresh Clerk concurrently', async () => {
    const firstPayer = buildTestAuthUserId('clerk-payer-a');
    const secondPayer = buildTestAuthUserId('clerk-payer-b');
    await ensureUser({
      authUserId: firstPayer,
      email: buildTestEmail(firstPayer),
      subscriptionTier: 'starter',
    });
    await ensureUser({
      authUserId: secondPayer,
      email: buildTestEmail(secondPayer),
      subscriptionTier: 'starter',
    });
    const firstRefresh = createDeferredPromise<void>();
    const secondRefresh = createDeferredPromise<void>();
    const firstRelease = createDeferredPromise<BackendBillingSubscription>();
    const secondRelease = createDeferredPromise<BackendBillingSubscription>();
    const firstGet = vi.fn(async () => {
      firstRefresh.resolve();
      return firstRelease.promise;
    });
    const secondGet = vi.fn(async () => {
      secondRefresh.resolve();
      return secondRelease.promise;
    });

    const first = applyVerifiedClerkBillingEvent(
      billingEvent(firstPayer),
      `evt_${firstPayer}`,
      {
        clerkClient: { billing: { getUserBillingSubscription: firstGet } },
        db,
        logger: logger(),
      },
    );
    const second = applyVerifiedClerkBillingEvent(
      billingEvent(secondPayer),
      `evt_${secondPayer}`,
      {
        clerkClient: { billing: { getUserBillingSubscription: secondGet } },
        db,
        logger: logger(),
      },
    );

    await Promise.all([firstRefresh.promise, secondRefresh.promise]);
    firstRelease.resolve(subscription({ payerId: firstPayer }));
    secondRelease.resolve(subscription({ payerId: secondPayer }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'inserted', result: 'updated' },
      { status: 'inserted', result: 'updated' },
    ]);
    await expect(currentTier(firstPayer)).resolves.toBe('pro');
    await expect(currentTier(secondPayer)).resolves.toBe('pro');
  });

  it('applies reconciliation after a committed webhook for the same payer', async () => {
    const payerUserId = buildTestAuthUserId('clerk-payer-reconcile');
    await ensureUser({
      authUserId: payerUserId,
      email: buildTestEmail(payerUserId),
      subscriptionTier: 'starter',
    });

    await expect(
      applyVerifiedClerkBillingEvent(
        billingEvent(payerUserId),
        `evt_webhook_${payerUserId}`,
        {
          clerkClient: {
            billing: {
              getUserBillingSubscription: vi.fn().mockResolvedValue(
                subscription({
                  payerId: payerUserId,
                  status: 'past_due',
                  subscriptionItems: [
                    {
                      ...subscription().subscriptionItems[0]!,
                      status: 'past_due',
                    },
                  ],
                }),
              ),
            },
          },
          db,
          logger: logger(),
        },
      ),
    ).resolves.toEqual({
      status: 'inserted',
      result: 'updated',
    });
    await expect(currentTier(payerUserId)).resolves.toBe('starter');

    await expect(
      reconcileClerkBillingEntitlements({
        clerkClient: {
          billing: {
            getUserBillingSubscription: vi
              .fn()
              .mockResolvedValue(subscription({ payerId: payerUserId })),
          },
        },
        db,
        logger: logger(),
        limit: 1,
      }),
    ).resolves.toMatchObject({
      checked: 1,
      updated: 1,
      failed: 0,
    });
    await expect(currentTier(payerUserId)).resolves.toBe('pro');
  });

  it('does not write unlocked state when the payer lock times out', async () => {
    const payerUserId = buildTestAuthUserId('clerk-payer-lock-timeout');
    await ensureUser({
      authUserId: payerUserId,
      email: buildTestEmail(payerUserId),
      subscriptionTier: 'starter',
    });
    const secondGet = vi
      .fn()
      .mockResolvedValue(subscription({ payerId: payerUserId }));
    const secondEventId = `evt_timeout_${payerUserId}`;
    const lockHeld = createDeferredPromise<void>();
    const releaseHold = createDeferredPromise<void>();
    const holding = db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(
          ${sql.raw(String(CLERK_BILLING_PAYER_LOCK_NAMESPACE))},
          hashtext(${payerUserId})
        )`,
      );
      lockHeld.resolve();
      await releaseHold.promise;
    });
    await lockHeld.promise;

    try {
      await expect(
        applyVerifiedClerkBillingEvent(
          billingEvent(payerUserId),
          secondEventId,
          {
            clerkClient: {
              billing: { getUserBillingSubscription: secondGet },
            },
            db,
            logger: logger(),
            payerLockTimeoutMs: 250,
          },
        ),
      ).rejects.toSatisfy(isLockTimeoutError);

      expect(secondGet).toHaveBeenCalledTimes(1);
      await expect(currentTier(payerUserId)).resolves.toBe('starter');
      await expect(
        db
          .select({ eventId: clerkWebhookEvents.eventId })
          .from(clerkWebhookEvents)
          .where(eq(clerkWebhookEvents.eventId, secondEventId)),
      ).resolves.toEqual([]);
    } finally {
      releaseHold.resolve();
      await holding;
    }
  });

  it('times out a hung Clerk refresh without holding the payer lock', async () => {
    const payerUserId = buildTestAuthUserId('clerk-payer-network-timeout');
    await ensureUser({
      authUserId: payerUserId,
      email: buildTestEmail(payerUserId),
      subscriptionTier: 'starter',
    });
    const eventId = `evt_hung_${payerUserId}`;
    const hungGet = vi.fn(
      () => new Promise<BackendBillingSubscription>(() => undefined),
    );

    await expect(
      applyVerifiedClerkBillingEvent(billingEvent(payerUserId), eventId, {
        clerkClient: { billing: { getUserBillingSubscription: hungGet } },
        db,
        logger: logger(),
        payerNetworkTimeoutMs: 150,
      }),
    ).rejects.toBeInstanceOf(ClerkBillingRefreshTimeoutError);

    await expect(currentTier(payerUserId)).resolves.toBe('starter');
    await expect(
      db
        .select({ eventId: clerkWebhookEvents.eventId })
        .from(clerkWebhookEvents)
        .where(eq(clerkWebhookEvents.eventId, eventId)),
    ).resolves.toEqual([]);
    await expect(
      db
        .select({ eventId: clerkWebhookEventClaims.eventId })
        .from(clerkWebhookEventClaims)
        .where(eq(clerkWebhookEventClaims.eventId, eventId)),
    ).resolves.toEqual([]);

    await expect(
      applyVerifiedClerkBillingEvent(billingEvent(payerUserId), eventId, {
        clerkClient: {
          billing: {
            getUserBillingSubscription: vi
              .fn()
              .mockResolvedValue(subscription({ payerId: payerUserId })),
          },
        },
        db,
        logger: logger(),
      }),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });
    await expect(currentTier(payerUserId)).resolves.toBe('pro');
  });
});
