import type { BackendBillingSubscription } from '@/features/billing/clerk-billing/projection';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';
import type { db as serviceRoleDb } from '@supabase/service-role';

import { applyVerifiedClerkBillingEvent } from '@/features/billing/clerk-billing/reconciliation';
import { createLogger } from '@/lib/logging/logger';
import { describe, expect, it, vi } from 'vitest';

type ServiceRoleDb = typeof serviceRoleDb;

function makeBillingEvent(): WebhookEvent {
  return {
    type: 'subscription.updated',
    data: {
      id: 'sub_fixture',
      status: 'active',
      payer: { user_id: 'user_missing' },
      payer_id: 'user_missing',
      items: [],
    },
  } as unknown as WebhookEvent;
}

function makeFailedPaymentAttemptEvent(): WebhookEvent {
  return {
    type: 'paymentAttempt.failed',
    data: {
      id: 'attempt_fixture',
      status: 'failed',
      payer: { user_id: 'user_missing' },
      subscription_items: [
        {
          id: 'item_pro',
          status: 'active',
          plan_id: 'cplan_3G8pCUUMkJeYVKqZuAanPo0c1Lb',
          plan: null,
          amount: { amount: 2_000 },
          period_end: new Date('2026-09-01T00:00:00.000Z').getTime(),
          is_free_trial: false,
        },
      ],
    },
  } as unknown as WebhookEvent;
}

function makeLogger() {
  return Object.assign(createLogger({ test: 'clerk-reconciliation.spec' }), {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  });
}

function makeDb(opts: {
  insertReturns?: unknown[];
  selectReturns?: unknown[];
}) {
  const insertReturns = opts.insertReturns ?? [{ eventId: 'evt_fixture' }];
  const selectReturns = opts.selectReturns ?? [];
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  let transactionOpen = false;
  let db: ServiceRoleDb & {
    isTransactionOpen: () => boolean;
    updateSet: typeof updateSet;
    updateWhere: typeof updateWhere;
  };

  db = Object.assign(
    {
      insert: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue(insertReturns),
        values: vi.fn().mockReturnThis(),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(selectReturns),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: updateSet,
      }),
      transaction: vi.fn(async <T>(callback: (tx: ServiceRoleDb) => T) => {
        transactionOpen = true;
        try {
          return await callback(db);
        } finally {
          transactionOpen = false;
        }
      }),
    } as unknown as ServiceRoleDb,
    {
      isTransactionOpen: () => transactionOpen,
      updateSet,
      updateWhere,
    },
  );

  return db;
}

function makeLocalUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_row_fixture',
    authUserId: 'user_missing',
    subscriptionTier: 'starter',
    subscriptionStatus: 'active',
    subscriptionPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

function makeSubscription(
  overrides: Partial<BackendBillingSubscription> = {},
): BackendBillingSubscription {
  return {
    payerId: 'user_missing',
    status: 'active',
    subscriptionItems: [
      {
        id: 'item_pro',
        status: 'active',
        planId: 'cplan_3G8pCUUMkJeYVKqZuAanPo0c1Lb',
        plan: null,
        amount: { amount: 2_000 },
        periodEnd: new Date('2026-09-01T00:00:00.000Z').getTime(),
        isFreeTrial: false,
      },
    ],
    ...overrides,
  };
}

function makeClerkClient(subscription = makeSubscription()) {
  return {
    billing: {
      getUserBillingSubscription: vi.fn().mockResolvedValue(subscription),
    },
  };
}

describe('applyVerifiedClerkBillingEvent', () => {
  it('does not project duplicate webhook ids', async () => {
    const db = makeDb({ insertReturns: [] });
    const clerkClient = makeClerkClient();

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_duplicate', {
        clerkClient,
        db,
        logger: makeLogger(),
      }),
    ).resolves.toEqual({ status: 'duplicate' });

    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('leaves missing local users retryable', async () => {
    const db = makeDb({});
    const clerkClient = makeClerkClient();

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_missing_user', {
        clerkClient,
        db,
        logger: makeLogger(),
      }),
    ).rejects.toThrow('No local user found for Clerk Billing payer');

    expect(clerkClient.billing.getUserBillingSubscription).toHaveBeenCalledWith(
      'user_missing',
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not claim the event when the Clerk refresh fails', async () => {
    const processingError = new Error('clerk unavailable');
    const db = makeDb({
      selectReturns: [makeLocalUser()],
    });
    const clerkClient = makeClerkClient();
    clerkClient.billing.getUserBillingSubscription.mockRejectedValueOnce(
      processingError,
    );

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_retryable', {
        clerkClient,
        db,
        logger: makeLogger(),
      }),
    ).rejects.toBe(processingError);

    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('claims the event in the same transaction as the projection', async () => {
    const projectionError = new Error('projection failed');
    const db = makeDb({ selectReturns: [makeLocalUser()] });
    db.updateWhere.mockRejectedValueOnce(projectionError);

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_projection', {
        clerkClient: makeClerkClient(),
        db,
        logger: makeLogger(),
      }),
    ).rejects.toBe(projectionError);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('refreshes webhook writes from the current Clerk subscription', async () => {
    const db = makeDb({ selectReturns: [makeLocalUser()] });
    const clerkClient = makeClerkClient();
    clerkClient.billing.getUserBillingSubscription.mockImplementation(
      async () => {
        expect(db.isTransactionOpen()).toBe(false);
        return makeSubscription();
      },
    );

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_current', {
        clerkClient,
        db,
        logger: makeLogger(),
      }),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });

    expect(clerkClient.billing.getUserBillingSubscription).toHaveBeenCalledWith(
      'user_missing',
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionStatus: 'active',
        subscriptionTier: 'pro',
      }),
    );
  });

  it('trusts a recovered active subscription after a failed payment attempt', async () => {
    const db = makeDb({ selectReturns: [makeLocalUser()] });
    const clerkClient = makeClerkClient();

    await expect(
      applyVerifiedClerkBillingEvent(
        makeFailedPaymentAttemptEvent(),
        'evt_failed_attempt',
        {
          clerkClient,
          db,
          logger: makeLogger(),
        },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });

    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionStatus: 'active',
        subscriptionTier: 'pro',
      }),
    );
  });

  it('keeps a failed payment attempt when Clerk still reports past due', async () => {
    const db = makeDb({ selectReturns: [makeLocalUser()] });
    const clerkClient = makeClerkClient(
      makeSubscription({
        status: 'past_due',
        subscriptionItems: [
          {
            ...makeSubscription().subscriptionItems[0]!,
            status: 'past_due',
          },
        ],
      }),
    );

    await expect(
      applyVerifiedClerkBillingEvent(
        makeFailedPaymentAttemptEvent(),
        'evt_failed_attempt_past_due',
        { clerkClient, db, logger: makeLogger() },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });

    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionStatus: 'past_due',
        subscriptionTier: 'starter',
      }),
    );
  });
});
