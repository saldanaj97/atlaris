import type { BackendBillingSubscription } from '@/features/billing/clerk-billing/projection';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';
import type { db as serviceRoleDb } from '@supabase/service-role';

import {
  applyVerifiedClerkBillingEvent,
  ClerkBillingRefreshTimeoutError,
  reconcileClerkBillingEntitlements,
} from '@/features/billing/clerk-billing/reconciliation';
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

function makeBillingEventWithoutUserPayer(): WebhookEvent {
  return {
    type: 'subscription.updated',
    data: {
      id: 'sub_fixture',
      status: 'active',
      payer: { organization_id: 'org_fixture' },
      payer_id: 'org_fixture',
      items: [],
    },
  } as unknown as WebhookEvent;
}

function makeUserIdentityEvent(
  type: 'user.created' | 'user.updated',
): WebhookEvent {
  return {
    type,
    data: {
      id: 'user_missing',
      updated_at: new Date('2026-08-11T10:00:00.000Z').getTime(),
      primary_email_address_id: 'email_primary',
      email_addresses: [
        {
          id: 'email_primary',
          email_address: 'updated@example.com',
          verification: { status: 'verified' },
        },
      ],
    },
  } as unknown as WebhookEvent;
}

function makeUserCreatedEvent(): WebhookEvent {
  return makeUserIdentityEvent('user.created');
}

function makeUserUpdatedEvent(): WebhookEvent {
  return makeUserIdentityEvent('user.updated');
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
          plan_id: 'cplan_pro_fixture',
          plan: { id: 'cplan_pro_fixture', slug: 'pro_plan' },
          amount: { amount: 2_000 },
          period_end: new Date('2026-09-01T00:00:00.000Z').getTime(),
          is_free_trial: false,
        },
      ],
    },
  } as unknown as WebhookEvent;
}

function makePaidPaymentAttemptEvent(): WebhookEvent {
  return {
    ...makeFailedPaymentAttemptEvent(),
    type: 'paymentAttempt.updated',
    data: {
      ...makeFailedPaymentAttemptEvent().data,
      status: 'paid',
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
  claimInsertReturns?: unknown[];
  claimInsertReturnSequence?: unknown[][];
  eventInsertReturns?: unknown[];
  deleteReturning?: unknown[];
  selectResults?: unknown[][];
}) {
  const claimInsertReturnSequence = [
    ...(opts.claimInsertReturnSequence ?? [
      opts.claimInsertReturns ?? [{ claimToken: 'claim_fixture' }],
    ]),
  ];
  const eventInsertReturns = opts.eventInsertReturns ?? [
    { eventId: 'evt_fixture' },
  ];
  const deleteReturning = opts.deleteReturning ?? [{ eventId: 'evt_fixture' }];
  const selectResults = [...(opts.selectResults ?? [])];
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const execute = vi.fn().mockResolvedValue(undefined);
  const deleteWhere = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(deleteReturning),
    then: (resolve: (value: undefined) => unknown) => resolve(undefined),
  });
  const insertCallCount = { value: 0 };
  let transactionOpen = false;
  let db: ServiceRoleDb & {
    execute: typeof execute;
    isTransactionOpen: () => boolean;
    updateSet: typeof updateSet;
    updateWhere: typeof updateWhere;
  };

  const limitFromSelect = vi
    .fn()
    .mockImplementation(async () => selectResults.shift() ?? []);

  db = Object.assign(
    {
      insert: vi.fn().mockImplementation(() => {
        insertCallCount.value += 1;
        const isClaimInsert = claimInsertReturnSequence.length > 0;
        const returning = isClaimInsert
          ? vi.fn().mockResolvedValue(claimInsertReturnSequence.shift())
          : vi.fn().mockResolvedValue(eventInsertReturns);
        const values = vi.fn().mockReturnValue(
          isClaimInsert
            ? {
                onConflictDoUpdate: vi.fn().mockReturnValue({ returning }),
              }
            : {
                onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
              },
        );
        return { values };
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: limitFromSelect,
            orderBy: vi.fn().mockReturnValue({
              limit: limitFromSelect,
            }),
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: limitFromSelect,
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({ where: deleteWhere }),
      update: vi.fn().mockReturnValue({
        set: updateSet,
      }),
      execute,
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
      execute,
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

function makeClerkClient(subscription = makeSubscription()) {
  return {
    billing: {
      getUserBillingSubscription: vi.fn().mockResolvedValue(subscription),
    },
  };
}

describe('applyVerifiedClerkBillingEvent', () => {
  it('does not project duplicate webhook ids', async () => {
    const db = makeDb({
      claimInsertReturns: [],
      selectResults: [[{ eventId: 'evt_duplicate' }]],
    });
    const clerkClient = makeClerkClient();

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_duplicate', {
        clerkClient,
        db,
        logger: makeLogger(),
      }),
    ).resolves.toEqual({ status: 'duplicate' });

    expect(
      clerkClient.billing.getUserBillingSubscription,
    ).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns in-flight without refreshing an actively claimed webhook', async () => {
    const db = makeDb({
      claimInsertReturns: [],
      selectResults: [[], [], [{ retryAfterSeconds: 42 }]],
    });
    const clerkClient = makeClerkClient();

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_in_flight', {
        clerkClient,
        db,
        logger: makeLogger(),
      }),
    ).resolves.toEqual({ status: 'in_flight', retryAfterSeconds: 42 });

    expect(
      clerkClient.billing.getUserBillingSubscription,
    ).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('retries once when a competing claim disappears before it can be read', async () => {
    const db = makeDb({
      claimInsertReturnSequence: [[], [{ claimToken: 'claim_retry' }]],
      selectResults: [[], [], [], [], [makeLocalUser()]],
    });
    const clerkClient = makeClerkClient();

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_reclaimed', {
        clerkClient,
        db,
        logger: makeLogger(),
      }),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });

    expect(
      clerkClient.billing.getUserBillingSubscription,
    ).toHaveBeenCalledTimes(1);
  });

  it('completes billing events without a user payer without retrying forever', async () => {
    const db = makeDb({});
    const clerkClient = makeClerkClient();

    await expect(
      applyVerifiedClerkBillingEvent(
        makeBillingEventWithoutUserPayer(),
        'evt_no_payer',
        { clerkClient, db, logger: makeLogger() },
      ),
    ).resolves.toEqual({
      status: 'inserted',
      result: 'skipped_no_payer',
    });

    expect(
      clerkClient.billing.getUserBillingSubscription,
    ).not.toHaveBeenCalled();
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

  it('leaves missing local user.updated events retryable', async () => {
    const db = makeDb({ selectResults: [[], []] });

    await expect(
      applyVerifiedClerkBillingEvent(
        makeUserUpdatedEvent(),
        'evt_user_updated_missing',
        {
          db,
          logger: makeLogger(),
        },
      ),
    ).rejects.toThrow('No local user found for Clerk update event');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.delete).toHaveBeenCalledTimes(2);
  });

  it('acknowledges missing local user.created events', async () => {
    const db = makeDb({ selectResults: [[], []] });

    await expect(
      applyVerifiedClerkBillingEvent(
        makeUserCreatedEvent(),
        'evt_user_created_missing',
        {
          db,
          logger: makeLogger(),
        },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'skipped_no_user' });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it('does not complete the event when the Clerk refresh fails', async () => {
    const processingError = new Error('clerk unavailable');
    const db = makeDb({});
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

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it('times out a hung Clerk refresh without completing the webhook', async () => {
    const db = makeDb({});
    const clerkClient = {
      billing: {
        getUserBillingSubscription: vi.fn(
          () => new Promise<BackendBillingSubscription>(() => undefined),
        ),
      },
    };

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_hung_refresh', {
        clerkClient,
        db,
        logger: makeLogger(),
        payerNetworkTimeoutMs: 20,
      }),
    ).rejects.toBeInstanceOf(ClerkBillingRefreshTimeoutError);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it('keeps the completed ledger insert atomic with the projection', async () => {
    const projectionError = new Error('projection failed');
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });
    db.updateWhere.mockRejectedValueOnce(projectionError);

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_projection', {
        clerkClient: makeClerkClient(),
        db,
        logger: makeLogger(),
      }),
    ).rejects.toBe(projectionError);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('refreshes webhook writes from the current Clerk subscription after locking', async () => {
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });
    const clerkClient = makeClerkClient();
    clerkClient.billing.getUserBillingSubscription.mockImplementation(
      async () => {
        expect(db.isTransactionOpen()).toBe(true);
        expect(db.execute).toHaveBeenCalled();
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

  it('retains a failed attempt until Clerk explicitly reports recovery', async () => {
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });
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
        subscriptionStatus: 'past_due',
        subscriptionTier: 'starter',
      }),
    );
  });

  it('accepts a later paid attempt as explicit recovery', async () => {
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });

    await expect(
      applyVerifiedClerkBillingEvent(
        makePaidPaymentAttemptEvent(),
        'evt_paid_attempt',
        { clerkClient: makeClerkClient(), db, logger: makeLogger() },
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
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });
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

  it('preserves stored tier when Clerk returns an unknown plan slug', async () => {
    const logger = makeLogger();
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });
    const clerkClient = makeClerkClient(
      makeSubscription({
        subscriptionItems: [
          {
            ...makeSubscription().subscriptionItems[0]!,
            planId: 'cplan_unknown',
            plan: { id: 'cplan_unknown', slug: 'enterprise_plan' },
          },
        ],
      }),
    );

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_unknown_plan', {
        clerkClient,
        db,
        logger,
      }),
    ).resolves.toEqual({ status: 'inserted', result: 'ignored' });

    expect(db.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        planSlugs: ['enterprise_plan'],
        storedTier: 'starter',
      }),
      'Clerk Billing plan could not be mapped; preserving stored tier',
    );
  });
});

describe('reconcileClerkBillingEntitlements', () => {
  it('locks the payer before refreshing and applying Clerk state', async () => {
    const db = makeDb({
      selectResults: [[{ authUserId: 'user_missing' }], [makeLocalUser()]],
    });
    const clerkClient = makeClerkClient();
    clerkClient.billing.getUserBillingSubscription.mockImplementation(
      async () => {
        expect(db.isTransactionOpen()).toBe(true);
        expect(db.execute).toHaveBeenCalled();
        return makeSubscription();
      },
    );

    await expect(
      reconcileClerkBillingEntitlements({
        clerkClient,
        db,
        logger: makeLogger(),
      }),
    ).resolves.toEqual({
      checked: 1,
      updated: 1,
      skipped: 0,
      ignored: 0,
      failed: 0,
      nextCursor: null,
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionStatus: 'active',
        subscriptionTier: 'pro',
      }),
    );
  });

  it('leaves entitlements unchanged when the Clerk refresh fails', async () => {
    const processingError = new Error('clerk unavailable');
    const db = makeDb({
      selectResults: [[{ authUserId: 'user_missing' }]],
    });
    const clerkClient = makeClerkClient();
    clerkClient.billing.getUserBillingSubscription.mockRejectedValueOnce(
      processingError,
    );

    await expect(
      reconcileClerkBillingEntitlements({
        clerkClient,
        db,
        logger: makeLogger(),
      }),
    ).resolves.toEqual({
      checked: 1,
      updated: 0,
      skipped: 0,
      ignored: 0,
      failed: 1,
      nextCursor: null,
    });

    expect(db.update).not.toHaveBeenCalled();
  });
});
