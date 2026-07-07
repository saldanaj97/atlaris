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

function makeLogger() {
  return Object.assign(createLogger({ test: 'clerk-reconciliation.spec' }), {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  });
}

function makeDb(opts: {
  deleteRejects?: unknown;
  insertReturns?: unknown[];
  selectReturns?: unknown[];
}) {
  const insertReturns = opts.insertReturns ?? [{ eventId: 'evt_fixture' }];
  const selectReturns = opts.selectReturns ?? [];
  const deleteWhere =
    opts.deleteRejects === undefined
      ? vi.fn().mockResolvedValue(undefined)
      : vi.fn().mockRejectedValue(opts.deleteRejects);
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  let db: ServiceRoleDb & {
    deleteWhere: typeof deleteWhere;
    updateSet: typeof updateSet;
    updateWhere: typeof updateWhere;
  };

  db = Object.assign(
    {
      delete: vi.fn().mockReturnValue({
        where: deleteWhere,
      }),
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
      transaction: vi.fn(<T>(callback: (tx: ServiceRoleDb) => T) =>
        callback(db),
      ),
    } as unknown as ServiceRoleDb,
    {
      deleteWhere,
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
  it('short-circuits duplicate webhook ids without dispatching', async () => {
    const db = makeDb({ insertReturns: [] });

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_duplicate', {
        db,
        logger: makeLogger(),
      }),
    ).resolves.toEqual({ status: 'duplicate' });

    expect(db.select).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('acks missing local users without retrying the webhook', async () => {
    const db = makeDb({});

    await expect(
      applyVerifiedClerkBillingEvent(makeBillingEvent(), 'evt_missing_user', {
        db,
        logger: makeLogger(),
      }),
    ).resolves.toEqual({ status: 'inserted', result: 'skipped' });

    expect(db.delete).not.toHaveBeenCalled();
  });

  it('rolls back event idempotency when webhook processing fails', async () => {
    const processingError = new Error('clerk unavailable');
    const db = makeDb({
      deleteRejects: new Error('delete failed'),
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

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('refreshes webhook writes from the current Clerk subscription', async () => {
    const db = makeDb({ selectReturns: [makeLocalUser()] });
    const clerkClient = makeClerkClient();

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
    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionStatus: 'active',
        subscriptionTier: 'pro',
      }),
    );
  });
});
