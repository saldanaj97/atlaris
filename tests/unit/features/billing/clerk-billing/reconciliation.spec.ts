import type { BackendBillingSubscription } from '@/features/billing/clerk-billing/projection';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';
import type { db as serviceRoleDb } from '@supabase/service-role';

import {
  applyVerifiedClerkBillingEvent,
  ClerkBillingRefreshTimeoutError,
  reconcileClerkBillingEntitlements,
} from '@/features/billing/clerk-billing/reconciliation';
import { createLogger } from '@/lib/logging/logger';
import { ClerkAPIResponseError } from '@clerk/nextjs/errors';
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

function clerkApiError(status: number, code: string) {
  return new ClerkAPIResponseError('Clerk API error', {
    data: [{ code, message: code, long_message: code }],
    status,
  });
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
  const updateReturning = vi
    .fn()
    .mockResolvedValue([{ id: 'user_row_fixture' }]);
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
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
    updateReturning: typeof updateReturning;
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
      updateReturning,
      updateWhere,
    },
  );

  return db;
}

function makeLocalUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_row_fixture',
    authUserId: 'user_missing',
    clerkBillingUpdatedAt: null,
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
    updatedAt: new Date('2026-08-01T00:00:00.000Z').getTime(),
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
    users: {
      getUser: vi.fn().mockResolvedValue({ id: 'user_missing' }),
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

    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a billing event once Clerk confirms the payer was deleted', async () => {
    const db = makeDb({});
    const clerkClient = makeClerkClient();
    clerkClient.billing.getUserBillingSubscription.mockRejectedValueOnce(
      clerkApiError(404, 'resource_not_found'),
    );
    clerkClient.users.getUser.mockRejectedValueOnce(
      clerkApiError(404, 'resource_not_found'),
    );
    const logger = makeLogger();

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_payer_deleted', {
        clerkClient,
        db,
        logger,
      }),
    ).resolves.toEqual({
      status: 'inserted',
      result: 'skipped_payer_deleted',
    });

    expect(clerkClient.users.getUser).toHaveBeenCalledWith('user_missing');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_payer_deleted',
        payerUserId: 'user_missing',
      }),
      'Clerk Billing payer not found in Clerk; acknowledged without projection',
    );
  });

  it.each([
    ['a Clerk 500', () => clerkApiError(500, 'internal_clerk_error')],
    ['a Clerk 429', () => clerkApiError(429, 'too_many_requests')],
    ['a Clerk 404 for another resource', () => clerkApiError(404, 'not_found')],
    ['a network failure', () => new TypeError('fetch failed')],
  ])('leaves %s on refresh retryable', async (_label, makeError) => {
    const error = makeError();
    const db = makeDb({});
    const clerkClient = makeClerkClient();
    clerkClient.billing.getUserBillingSubscription.mockRejectedValueOnce(error);

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_retryable', {
        clerkClient,
        db,
        logger: makeLogger(),
      }),
    ).rejects.toBe(error);

    expect(clerkClient.users.getUser).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the Clerk user still exists',
      (getUser: ReturnType<typeof vi.fn>) =>
        getUser.mockResolvedValueOnce({ id: 'user_missing' }),
    ],
    [
      'the user lookup returns a Clerk 500',
      (getUser: ReturnType<typeof vi.fn>) =>
        getUser.mockRejectedValueOnce(
          clerkApiError(500, 'internal_clerk_error'),
        ),
    ],
    [
      'the user lookup hits a network failure',
      (getUser: ReturnType<typeof vi.fn>) =>
        getUser.mockRejectedValueOnce(new TypeError('fetch failed')),
    ],
    [
      'the user lookup hangs past the timeout',
      (getUser: ReturnType<typeof vi.fn>) =>
        getUser.mockReturnValueOnce(new Promise(() => undefined)),
    ],
  ])(
    'retries a billing 404 with the original error when %s',
    async (_label, arrangeLookup) => {
      const refreshError = clerkApiError(404, 'resource_not_found');
      const db = makeDb({});
      const clerkClient = makeClerkClient();
      clerkClient.billing.getUserBillingSubscription.mockRejectedValueOnce(
        refreshError,
      );
      arrangeLookup(clerkClient.users.getUser);

      await expect(
        applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_retryable', {
          clerkClient,
          db,
          logger: makeLogger(),
          payerNetworkTimeoutMs: 20,
        }),
      ).rejects.toBe(refreshError);

      expect(clerkClient.users.getUser).toHaveBeenCalledWith('user_missing');
      expect(db.transaction).not.toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.update).not.toHaveBeenCalled();
    },
  );

  it('times out a hung Clerk refresh without completing the webhook', async () => {
    const db = makeDb({});
    const clerkClient = {
      billing: {
        getUserBillingSubscription: vi.fn(
          () => new Promise<BackendBillingSubscription>(() => undefined),
        ),
      },
      users: { getUser: vi.fn() },
    };

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_hung_refresh', {
        clerkClient,
        db,
        logger: makeLogger(),
        payerNetworkTimeoutMs: 20,
      }),
    ).rejects.toBeInstanceOf(ClerkBillingRefreshTimeoutError);

    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it('keeps the completed ledger insert atomic with the projection', async () => {
    const projectionError = new Error('projection failed');
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });
    db.updateReturning.mockRejectedValueOnce(projectionError);

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

  it('refreshes Clerk outside the transaction, then applies under the payer lock', async () => {
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });
    const clerkClient = makeClerkClient();
    clerkClient.billing.getUserBillingSubscription.mockImplementation(
      async () => {
        expect(db.isTransactionOpen()).toBe(false);
        expect(db.execute).not.toHaveBeenCalled();
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
    expect(db.execute).toHaveBeenCalled();
    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionStatus: 'active',
        subscriptionTier: 'pro',
      }),
    );
  });

  it('keeps a newer webhook snapshot when the Clerk refresh lags', async () => {
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });
    const webhookUpdatedAt = new Date('2026-08-01T00:01:00.000Z');
    const clerkClient = makeClerkClient(
      makeSubscription({
        updatedAt: new Date('2026-08-01T00:00:00.000Z').getTime(),
        subscriptionItems: [
          {
            ...makeSubscription().subscriptionItems[0]!,
            id: 'item_stale_starter',
            planId: 'cplan_starter_fixture',
            plan: {
              id: 'cplan_starter_fixture',
              slug: 'starter_plan',
            },
          },
        ],
      }),
    );

    await expect(
      applyVerifiedClerkBillingEvent(
        {
          ...makeBillingEvent(),
          data: {
            ...makeBillingEvent().data,
            updated_at: webhookUpdatedAt.getTime(),
            items: [
              {
                id: 'item_webhook_pro',
                status: 'active',
                plan_id: 'cplan_pro_fixture',
                plan: { id: 'cplan_pro_fixture', slug: 'pro_plan' },
                amount: { amount: 2_000 },
                period_end: new Date('2026-09-01T00:00:00.000Z').getTime(),
              },
            ],
          },
        } as unknown as WebhookEvent,
        'evt_newer_webhook',
        { clerkClient, db, logger: makeLogger() },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });

    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
      }),
    );
  });

  it('overlays a newer item webhook onto the refreshed multi-item snapshot', async () => {
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });
    const webhookUpdatedAt = new Date('2026-08-01T00:01:00.000Z');
    const proItem = makeSubscription().subscriptionItems[0]!;
    const clerkClient = makeClerkClient(
      makeSubscription({
        updatedAt: new Date('2026-08-01T00:00:00.000Z').getTime(),
        subscriptionItems: [
          proItem,
          {
            ...proItem,
            id: 'item_stale_starter',
            status: 'active',
            planId: 'cplan_starter_fixture',
            plan: {
              id: 'cplan_starter_fixture',
              slug: 'starter_plan',
            },
          },
        ],
      }),
    );

    await expect(
      applyVerifiedClerkBillingEvent(
        {
          type: 'subscriptionItem.canceled',
          data: {
            id: proItem.id,
            status: 'canceled',
            updated_at: webhookUpdatedAt.getTime(),
            payer: { user_id: 'user_missing' },
            plan_id: 'cplan_pro_fixture',
            plan: { id: 'cplan_pro_fixture', slug: 'pro_plan' },
            amount: { amount: 2_000 },
            period_end: new Date('2026-09-01T00:00:00.000Z').getTime(),
            canceled_at: webhookUpdatedAt.getTime(),
          },
        } as unknown as WebhookEvent,
        'evt_newer_item_webhook',
        { clerkClient, db, logger: makeLogger() },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'updated' });

    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkBillingUpdatedAt: webhookUpdatedAt,
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
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

    expect(db.updateSet).toHaveBeenCalledWith({
      clerkBillingUpdatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        planSlugs: ['enterprise_plan'],
        storedTier: 'starter',
      }),
      'Clerk Billing plan could not be mapped; preserving stored tier',
    );
  });

  it('preserves stored tier when an unknown item is mixed with active Free', async () => {
    const db = makeDb({ selectResults: [[], [makeLocalUser()]] });
    const baseItem = makeSubscription().subscriptionItems[0]!;
    const clerkClient = makeClerkClient(
      makeSubscription({
        subscriptionItems: [
          {
            ...baseItem,
            id: 'item_unknown_active',
            planId: 'cplan_unknown',
            plan: { id: 'cplan_unknown', slug: 'enterprise_plan' },
          },
          {
            ...baseItem,
            id: 'item_free_active',
            planId: 'cplan_free',
            plan: { id: 'cplan_free', slug: 'free_user' },
          },
        ],
      }),
    );

    await expect(
      applyVerifiedClerkBillingEvent(
        makeBillingEvent(),
        'evt_unknown_free_plan',
        { clerkClient, db, logger: makeLogger() },
      ),
    ).resolves.toEqual({ status: 'inserted', result: 'ignored' });

    expect(db.updateSet).toHaveBeenCalledWith({
      clerkBillingUpdatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
  });
});

describe('reconcileClerkBillingEntitlements', () => {
  it('refreshes Clerk outside the transaction, then applies under the payer lock', async () => {
    const db = makeDb({
      selectResults: [[{ authUserId: 'user_missing' }], [makeLocalUser()]],
    });
    const clerkClient = makeClerkClient();
    clerkClient.billing.getUserBillingSubscription.mockImplementation(
      async () => {
        expect(db.isTransactionOpen()).toBe(false);
        expect(db.execute).not.toHaveBeenCalled();
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
    expect(db.execute).toHaveBeenCalled();
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

    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

/**
 * Regression coverage for the staging report "paid for Starter but still shows
 * Free". Event shapes and timestamps come from the real Clerk deliveries: a
 * sign-up `subscription.created` carrying only the Free item, then a
 * `subscriptionItem.active` for Starter. Each case replays events one at a
 * time, carrying the stored user row forward, so ordering and the
 * `clerkBillingUpdatedAt` staleness guard are exercised the way production
 * sees them. The SQL-level `lt(clerkBillingUpdatedAt, ...)` guard mirrors the
 * in-code `<=` check, so this harness does not model it separately.
 */
describe('Starter upgrade ordering (staging regression)', () => {
  const STAGING_USER_ID = 'user_3Ly0zOrW5kwtP6VWB4WCs0XNfrZ';
  const FREE_CREATED_AT = 1794411261932;
  const STARTER_ACTIVE_AT = 1794411451954;
  const STARTER_PERIOD_END = 1797003450965;

  const FREE_PLAN = {
    id: 'cplan_35fIWJtRxMfzbpbxpiOWCTjKWdQ',
    slug: 'free_user',
  };
  const STARTER_PLAN = {
    id: 'cplan_3G8pAq7nNr5wGtYQJA19VnnYNKA',
    slug: 'starter_plan',
  };

  function freeWebhookItem() {
    return {
      id: 'csub_item_3Ly0zOE4quhCBl3aoXoGXxyQ1cc',
      status: 'active',
      is_free_trial: false,
      period_end: null,
      plan_id: FREE_PLAN.id,
      plan: { ...FREE_PLAN, amount: 0 },
      updated_at: FREE_CREATED_AT,
    };
  }

  function subscriptionEvent(
    type: 'subscription.created' | 'subscription.updated',
    updatedAt: number,
  ): WebhookEvent {
    return {
      type,
      data: {
        id: 'csub_3Ly0zQT0Sifgrnh0eSD4DKjMT3l',
        status: 'active',
        payer: { user_id: STAGING_USER_ID },
        payer_id: 'cpayer_3Ly0zNtFul0UzJk0pkKVUooh4tD',
        updated_at: updatedAt,
        items: [freeWebhookItem()],
      },
    } as unknown as WebhookEvent;
  }

  function starterItemActiveEvent(): WebhookEvent {
    return {
      type: 'subscriptionItem.active',
      data: {
        id: 'csub_item_3Ly1N4yAQK6zM0n4wHIGhRa3TJ6',
        status: 'active',
        is_free_trial: false,
        payer: { user_id: STAGING_USER_ID },
        period_end: STARTER_PERIOD_END,
        plan_id: STARTER_PLAN.id,
        plan: { ...STARTER_PLAN, amount: 2500 },
        subscription_id: 'csub_3Ly0zQT0Sifgrnh0eSD4DKjMT3l',
        updated_at: STARTER_ACTIVE_AT,
      },
    } as unknown as WebhookEvent;
  }

  function freeBackendItem() {
    return {
      id: 'csub_item_3Ly0zOE4quhCBl3aoXoGXxyQ1cc',
      status: 'active' as const,
      planId: FREE_PLAN.id,
      plan: FREE_PLAN,
      amount: { amount: 0 },
      periodEnd: null,
      isFreeTrial: false,
    };
  }

  function starterBackendItem() {
    return {
      id: 'csub_item_3Ly1N4yAQK6zM0n4wHIGhRa3TJ6',
      status: 'active' as const,
      planId: STARTER_PLAN.id,
      plan: STARTER_PLAN,
      amount: { amount: 2500 },
      periodEnd: STARTER_PERIOD_END,
      isFreeTrial: false,
    };
  }

  function freeOnlySnapshot(updatedAt: number): BackendBillingSubscription {
    return makeSubscription({
      payerId: STAGING_USER_ID,
      updatedAt,
      subscriptionItems: [freeBackendItem()],
    });
  }

  function starterSnapshot(updatedAt: number): BackendBillingSubscription {
    return makeSubscription({
      payerId: STAGING_USER_ID,
      updatedAt,
      subscriptionItems: [starterBackendItem()],
    });
  }

  type Delivery = {
    event: WebhookEvent;
    eventId: string;
    /** What `getUserBillingSubscription` returns while this event is processed. */
    clerkRefetch: BackendBillingSubscription;
  };

  /** Replays deliveries in order, persisting each `update().set()` onto the user row. */
  async function replay(
    deliveries: Delivery[],
    initialUser: Record<string, unknown> = {},
  ) {
    let user = makeLocalUser({
      authUserId: STAGING_USER_ID,
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: null,
      clerkBillingUpdatedAt: null,
      ...initialUser,
    });
    const results: unknown[] = [];

    for (const delivery of deliveries) {
      const db = makeDb({ selectResults: [[], [user]] });
      results.push(
        await applyVerifiedClerkBillingEvent(delivery.event, delivery.eventId, {
          clerkClient: makeClerkClient(delivery.clerkRefetch),
          db,
          logger: makeLogger(),
        }),
      );
      const written = db.updateSet.mock.calls.at(-1)?.[0];
      if (written) {
        user = { ...user, ...written };
      }
    }

    return { user, results };
  }

  function expectUserOnStarter(user: ReturnType<typeof makeLocalUser>) {
    expect(user).toMatchObject({
      subscriptionTier: 'starter',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: new Date(STARTER_PERIOD_END),
    });
  }

  it('moves Free to Starter when the sign-up subscription.created is followed by subscriptionItem.active', async () => {
    const { user } = await replay([
      {
        event: subscriptionEvent('subscription.created', FREE_CREATED_AT),
        eventId: 'evt_sub_created',
        clerkRefetch: freeOnlySnapshot(FREE_CREATED_AT),
      },
      {
        event: starterItemActiveEvent(),
        eventId: 'evt_item_active',
        clerkRefetch: starterSnapshot(STARTER_ACTIVE_AT),
      },
    ]);

    expectUserOnStarter(user);
  });

  it('moves Free to Starter when a free-only subscription.updated with an equal updated_at lands just before the Starter item event', async () => {
    const { user } = await replay([
      {
        event: subscriptionEvent('subscription.created', FREE_CREATED_AT),
        eventId: 'evt_sub_created',
        clerkRefetch: freeOnlySnapshot(FREE_CREATED_AT),
      },
      {
        event: subscriptionEvent('subscription.updated', STARTER_ACTIVE_AT),
        eventId: 'evt_sub_updated_equal',
        clerkRefetch: freeOnlySnapshot(STARTER_ACTIVE_AT),
      },
      {
        event: starterItemActiveEvent(),
        eventId: 'evt_item_active',
        clerkRefetch: starterSnapshot(STARTER_ACTIVE_AT),
      },
    ]);

    expectUserOnStarter(user);
  });

  it('moves Free to Starter when a free-only subscription.updated with a newer updated_at lands just before the Starter item event', async () => {
    const { user } = await replay([
      {
        event: subscriptionEvent('subscription.created', FREE_CREATED_AT),
        eventId: 'evt_sub_created',
        clerkRefetch: freeOnlySnapshot(FREE_CREATED_AT),
      },
      {
        event: subscriptionEvent(
          'subscription.updated',
          STARTER_ACTIVE_AT + 1_000,
        ),
        eventId: 'evt_sub_updated_newer',
        clerkRefetch: freeOnlySnapshot(STARTER_ACTIVE_AT + 1_000),
      },
      {
        event: starterItemActiveEvent(),
        eventId: 'evt_item_active',
        clerkRefetch: starterSnapshot(STARTER_ACTIVE_AT),
      },
    ]);

    expectUserOnStarter(user);
  });

  it('keeps the Starter item when the Clerk re-fetch is stale and older than the item event', async () => {
    const { user } = await replay([
      {
        event: subscriptionEvent('subscription.created', FREE_CREATED_AT),
        eventId: 'evt_sub_created',
        clerkRefetch: freeOnlySnapshot(FREE_CREATED_AT),
      },
      {
        event: starterItemActiveEvent(),
        eventId: 'evt_item_active',
        clerkRefetch: freeOnlySnapshot(STARTER_ACTIVE_AT - 1_000),
      },
    ]);

    expectUserOnStarter(user);
  });

  it('keeps the Starter item when the Clerk re-fetch returns free-only data with the same updated_at', async () => {
    const { user } = await replay([
      {
        event: subscriptionEvent('subscription.created', FREE_CREATED_AT),
        eventId: 'evt_sub_created',
        clerkRefetch: freeOnlySnapshot(FREE_CREATED_AT),
      },
      {
        event: starterItemActiveEvent(),
        eventId: 'evt_item_active',
        clerkRefetch: freeOnlySnapshot(STARTER_ACTIVE_AT),
      },
    ]);

    expectUserOnStarter(user);
  });

  it('keeps the Starter item when the Clerk re-fetch returns free-only data with a newer updated_at', async () => {
    const { user } = await replay([
      {
        event: subscriptionEvent('subscription.created', FREE_CREATED_AT),
        eventId: 'evt_sub_created',
        clerkRefetch: freeOnlySnapshot(FREE_CREATED_AT),
      },
      {
        event: starterItemActiveEvent(),
        eventId: 'evt_item_active',
        clerkRefetch: freeOnlySnapshot(STARTER_ACTIVE_AT + 1_000),
      },
    ]);

    expectUserOnStarter(user);
  });
  describe('active paid item rule: only an explicit ended or canceled item downgrades', () => {
    const PRO_PLAN = { id: 'cplan_pro_fixture', slug: 'pro_plan' };

    function paidItemEvent(args: {
      type: string;
      plan: { id: string; slug: string };
      itemId: string;
      status: string;
      updatedAt: number;
      periodEnd: number;
    }): WebhookEvent {
      return {
        type: args.type,
        data: {
          id: args.itemId,
          status: args.status,
          is_free_trial: false,
          payer: { user_id: STAGING_USER_ID },
          period_end: args.periodEnd,
          plan_id: args.plan.id,
          plan: { ...args.plan, amount: 2500 },
          updated_at: args.updatedAt,
        },
      } as unknown as WebhookEvent;
    }

    const paidUser = (
      tier: 'starter' | 'pro',
      clerkBillingUpdatedAt: number,
    ) => ({
      subscriptionTier: tier,
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: new Date(STARTER_PERIOD_END),
      clerkBillingUpdatedAt: new Date(clerkBillingUpdatedAt),
    });

    it('downgrades a Starter user when the Starter item is explicitly ended', async () => {
      const { user } = await replay(
        [
          {
            event: paidItemEvent({
              type: 'subscriptionItem.ended',
              plan: STARTER_PLAN,
              itemId: 'csub_item_3Ly1N4yAQK6zM0n4wHIGhRa3TJ6',
              status: 'ended',
              updatedAt: STARTER_ACTIVE_AT + 5_000,
              periodEnd: STARTER_ACTIVE_AT - 1_000,
            }),
            eventId: 'evt_item_ended',
            clerkRefetch: freeOnlySnapshot(STARTER_ACTIVE_AT + 5_000),
          },
        ],
        paidUser('starter', STARTER_ACTIVE_AT),
      );

      expect(user.subscriptionTier).toBe('free');
    });

    it('downgrades to canceled when the ended item is newer than a lagging Clerk re-fetch', async () => {
      const { user } = await replay(
        [
          {
            event: paidItemEvent({
              type: 'subscriptionItem.ended',
              plan: STARTER_PLAN,
              itemId: 'csub_item_3Ly1N4yAQK6zM0n4wHIGhRa3TJ6',
              status: 'ended',
              updatedAt: STARTER_ACTIVE_AT + 5_000,
              periodEnd: STARTER_ACTIVE_AT - 1_000,
            }),
            eventId: 'evt_item_ended',
            clerkRefetch: starterSnapshot(STARTER_ACTIVE_AT),
          },
        ],
        paidUser('starter', STARTER_ACTIVE_AT),
      );

      expect(user).toMatchObject({
        subscriptionTier: 'free',
        subscriptionStatus: 'canceled',
      });
    });

    it('still applies a genuine Pro to Starter change', async () => {
      const { user } = await replay(
        [
          {
            event: starterItemActiveEvent(),
            eventId: 'evt_item_active',
            clerkRefetch: starterSnapshot(STARTER_ACTIVE_AT),
          },
        ],
        paidUser('pro', STARTER_ACTIVE_AT - 10_000),
      );

      expectUserOnStarter(user);
    });

    it('still applies a genuine Starter to Pro change', async () => {
      const { user } = await replay(
        [
          {
            event: paidItemEvent({
              type: 'subscriptionItem.active',
              plan: PRO_PLAN,
              itemId: 'item_pro',
              status: 'active',
              updatedAt: STARTER_ACTIVE_AT + 5_000,
              periodEnd: STARTER_PERIOD_END,
            }),
            eventId: 'evt_item_pro_active',
            clerkRefetch: makeSubscription({
              payerId: STAGING_USER_ID,
              updatedAt: STARTER_ACTIVE_AT + 5_000,
            }),
          },
        ],
        paidUser('starter', STARTER_ACTIVE_AT),
      );

      expect(user).toMatchObject({
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
      });
    });

    it('ignores a late Starter event for a user who already downgraded to canceled Free', async () => {
      const { user, results } = await replay(
        [
          {
            event: starterItemActiveEvent(),
            eventId: 'evt_late_item_active',
            clerkRefetch: starterSnapshot(STARTER_ACTIVE_AT),
          },
        ],
        {
          subscriptionTier: 'free',
          subscriptionStatus: 'canceled',
          subscriptionPeriodEnd: null,
          clerkBillingUpdatedAt: new Date(STARTER_ACTIVE_AT + 5_000),
        },
      );

      expect(results).toEqual([{ status: 'inserted', result: 'ignored' }]);
      expect(user).toMatchObject({
        subscriptionTier: 'free',
        subscriptionStatus: 'canceled',
      });
    });

    it('ignores a late Starter event for a user who already moved to Pro', async () => {
      const { user, results } = await replay(
        [
          {
            event: starterItemActiveEvent(),
            eventId: 'evt_late_item_active',
            clerkRefetch: starterSnapshot(STARTER_ACTIVE_AT),
          },
        ],
        paidUser('pro', STARTER_ACTIVE_AT + 5_000),
      );

      expect(results).toEqual([{ status: 'inserted', result: 'ignored' }]);
      expect(user.subscriptionTier).toBe('pro');
    });
  });
});
