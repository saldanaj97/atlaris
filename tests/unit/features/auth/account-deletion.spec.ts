import type { BackendBillingSubscription } from '@/features/billing/clerk-billing/projection';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const projection = vi.hoisted(() => ({
  applyClerkUserProjectionSource: vi.fn(),
}));

vi.mock('@/features/auth/clerk-user-projection', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/auth/clerk-user-projection')
  >()),
  applyClerkUserProjectionSource: projection.applyClerkUserProjectionSource,
}));

const { deleteAccount } = await import('@/features/auth/account-deletion');

const AUTH_USER_ID = 'user_delete_fixture';
const NOW = new Date('2026-10-16T12:00:00.000Z');

function subscription(
  items: { id: string; slug: string; status: string }[],
): BackendBillingSubscription {
  return {
    status: 'active',
    payerId: AUTH_USER_ID,
    updatedAt: NOW.getTime(),
    subscriptionItems: items.map((item) => ({
      id: item.id,
      status: item.status as never,
      planId: `cplan_${item.slug}`,
      plan: { id: `cplan_${item.slug}`, slug: item.slug },
      amount: { amount: item.slug === 'free_user' ? 0 : 2000 },
      periodEnd: NOW.getTime() + 86_400_000,
      isFreeTrial: false,
    })),
  };
}

function setup(subscriptions: (BackendBillingSubscription | Error)[]) {
  const getUserBillingSubscription = vi.fn();
  for (const next of subscriptions) {
    if (next instanceof Error) {
      getUserBillingSubscription.mockRejectedValueOnce(next);
    } else {
      getUserBillingSubscription.mockResolvedValueOnce(next);
    }
  }
  const clerkClient = {
    billing: {
      getUserBillingSubscription,
      cancelSubscriptionItem: vi.fn().mockResolvedValue({}),
    },
    users: { deleteUser: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    transaction: vi.fn((run: (tx: unknown) => unknown) => run('tx')),
  };
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const run = () =>
    deleteAccount({
      authUserId: AUTH_USER_ID,
      clerkClient,
      db: db as never,
      logger,
      now: NOW,
    });
  return { clerkClient, db, run };
}

describe('deleteAccount', () => {
  beforeEach(() => {
    projection.applyClerkUserProjectionSource.mockReset();
    projection.applyClerkUserProjectionSource.mockResolvedValue('updated');
  });

  it('ends paid items before deleting the Clerk user and erasing local data', async () => {
    const { clerkClient, run } = setup([
      subscription([
        { id: 'item_pro', slug: 'pro_plan', status: 'active' },
        { id: 'item_free', slug: 'free_user', status: 'upcoming' },
      ]),
      subscription([
        { id: 'item_pro', slug: 'pro_plan', status: 'ended' },
        { id: 'item_free', slug: 'free_user', status: 'active' },
      ]),
    ]);

    await expect(run()).resolves.toEqual({ status: 'deleted' });

    expect(clerkClient.billing.cancelSubscriptionItem).toHaveBeenCalledTimes(1);
    expect(clerkClient.billing.cancelSubscriptionItem).toHaveBeenCalledWith(
      'item_pro',
      { endNow: true },
    );
    expect(clerkClient.users.deleteUser).toHaveBeenCalledWith(AUTH_USER_ID);
    expect(
      clerkClient.billing.cancelSubscriptionItem.mock.invocationCallOrder[0],
    ).toBeLessThan(clerkClient.users.deleteUser.mock.invocationCallOrder[0]!);
    expect(projection.applyClerkUserProjectionSource).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'account_deletion', kind: 'deleted' }),
      expect.objectContaining({ db: 'tx' }),
    );
  });

  it('keeps the account when a paid item is still active after cancel', async () => {
    const stillActive = subscription([
      { id: 'item_starter', slug: 'starter_plan', status: 'active' },
    ]);
    const { clerkClient, run } = setup([stillActive, stillActive]);

    await expect(run()).resolves.toEqual({ status: 'billing_cancel_failed' });
    expect(clerkClient.users.deleteUser).not.toHaveBeenCalled();
    expect(projection.applyClerkUserProjectionSource).not.toHaveBeenCalled();
  });

  it('deletes a free account without canceling or re-fetching billing', async () => {
    const { clerkClient, run } = setup([
      subscription([{ id: 'item_free', slug: 'free_user', status: 'active' }]),
    ]);

    await expect(run()).resolves.toEqual({ status: 'deleted' });
    expect(clerkClient.billing.cancelSubscriptionItem).not.toHaveBeenCalled();
    expect(
      clerkClient.billing.getUserBillingSubscription,
    ).toHaveBeenCalledTimes(1);
    expect(clerkClient.users.deleteUser).toHaveBeenCalledWith(AUTH_USER_ID);
  });

  it('treats a missing Clerk subscription as nothing to cancel', async () => {
    const { clerkClient, run } = setup([
      Object.assign(new Error('not found'), { status: 404 }),
    ]);

    await expect(run()).resolves.toEqual({ status: 'deleted' });
    expect(clerkClient.billing.cancelSubscriptionItem).not.toHaveBeenCalled();
    expect(clerkClient.users.deleteUser).toHaveBeenCalled();
  });

  it('cancels every renewing paid item and skips ended ones', async () => {
    const { clerkClient, run } = setup([
      subscription([
        { id: 'item_starter', slug: 'starter_plan', status: 'active' },
        { id: 'item_pro_next', slug: 'pro_plan', status: 'upcoming' },
        { id: 'item_pro_due', slug: 'pro_plan', status: 'past_due' },
        { id: 'item_pro_old', slug: 'pro_plan', status: 'ended' },
        { id: 'item_starter_old', slug: 'starter_plan', status: 'canceled' },
        { id: 'item_free', slug: 'free_user', status: 'active' },
      ]),
      subscription([
        { id: 'item_starter', slug: 'starter_plan', status: 'ended' },
        { id: 'item_pro_next', slug: 'pro_plan', status: 'canceled' },
        { id: 'item_pro_due', slug: 'pro_plan', status: 'ended' },
      ]),
    ]);

    await expect(run()).resolves.toEqual({ status: 'deleted' });

    expect(
      clerkClient.billing.cancelSubscriptionItem.mock.calls.map(
        ([itemId, params]) => [itemId, params],
      ),
    ).toEqual([
      ['item_starter', { endNow: true }],
      ['item_pro_next', { endNow: true }],
      ['item_pro_due', { endNow: true }],
    ]);
  });

  it('does not delete the Clerk user when a cancel call fails', async () => {
    const { clerkClient, run } = setup([
      subscription([{ id: 'item_pro', slug: 'pro_plan', status: 'active' }]),
    ]);
    clerkClient.billing.cancelSubscriptionItem.mockRejectedValue(
      new Error('cancel failed'),
    );

    await expect(run()).rejects.toThrow('cancel failed');
    expect(clerkClient.users.deleteUser).not.toHaveBeenCalled();
    expect(projection.applyClerkUserProjectionSource).not.toHaveBeenCalled();
  });

  it('still erases locally when the Clerk user is already gone', async () => {
    const { clerkClient, run } = setup([
      subscription([{ id: 'item_free', slug: 'free_user', status: 'active' }]),
    ]);
    clerkClient.users.deleteUser.mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 }),
    );

    await expect(run()).resolves.toEqual({ status: 'deleted' });
    expect(projection.applyClerkUserProjectionSource).toHaveBeenCalledTimes(1);
  });

  it('rethrows other Clerk delete failures without erasing locally', async () => {
    const { clerkClient, run } = setup([
      subscription([{ id: 'item_free', slug: 'free_user', status: 'active' }]),
    ]);
    clerkClient.users.deleteUser.mockRejectedValue(
      Object.assign(new Error('clerk down'), { status: 500 }),
    );

    await expect(run()).rejects.toThrow('clerk down');
    expect(projection.applyClerkUserProjectionSource).not.toHaveBeenCalled();
  });

  it('stops before deleting when the billing lookup fails', async () => {
    const { clerkClient, run } = setup([
      Object.assign(new Error('unavailable'), { status: 503 }),
    ]);

    await expect(run()).rejects.toThrow('unavailable');
    expect(clerkClient.users.deleteUser).not.toHaveBeenCalled();
  });
});
