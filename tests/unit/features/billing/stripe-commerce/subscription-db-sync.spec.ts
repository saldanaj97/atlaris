import type { StripeSubscriptionForSync } from '@/features/billing/stripe-commerce/subscription-db-sync';

import { syncSubscriptionToDb } from '@/features/billing/stripe-commerce/subscription-db-sync';
import { users } from '@supabase/schema';
import { makeDbClient } from '@tests/fixtures/db-mocks';
import { createId } from '@tests/fixtures/ids';
import { makeStripeMock } from '@tests/fixtures/stripe-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeSubscription(
  overrides: Partial<StripeSubscriptionForSync> = {},
): StripeSubscriptionForSync {
  return {
    id: createId('sub'),
    customer: createId('cus'),
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: 1_735_689_600,
    items: { data: [] },
    ...overrides,
  };
}

function buildDb(selectRows: Array<{ id: string; subscriptionTier: string }>) {
  const limit = vi.fn().mockResolvedValue(selectRows);
  const whereSelect = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where: whereSelect });
  const select = vi.fn().mockReturnValue({ from });

  const whereUpdate = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: whereUpdate });
  const update = vi.fn().mockReturnValue({ set });

  return {
    db: makeDbClient({ select, update }),
    spies: { select, from, whereSelect, limit, update, set, whereUpdate },
  };
}

describe('syncSubscriptionToDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('syncs the tier from the injected Stripe price metadata', async () => {
    const userId = createId('user');
    const priceId = createId('price');
    const { db, spies } = buildDb([{ id: userId, subscriptionTier: 'free' }]);
    const retrieve = vi.fn().mockResolvedValue({
      product: { metadata: { tier: 'pro' } },
    });
    const stripe = makeStripeMock({ prices: { retrieve } });

    await syncSubscriptionToDb(
      makeSubscription({
        id: 'sub_active',
        customer: 'cus_active',
        items: { data: [{ price: priceId }] },
        current_period_end: 1_735_689_600,
      }),
      { dbClient: db, stripe, timeoutMs: 2_500 },
    );

    expect(retrieve).toHaveBeenCalledWith(
      priceId,
      { expand: ['product'] },
      { timeout: 2_500 },
    );
    expect(spies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionTier: 'pro',
        stripeSubscriptionId: 'sub_active',
        subscriptionStatus: 'active',
        subscriptionPeriodEnd: new Date('2025-01-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    );
    expect(spies.update).toHaveBeenCalledWith(users);
  });

  it('keeps the existing paid tier when the subscription has no price item', async () => {
    const { db, spies } = buildDb([
      { id: createId('user'), subscriptionTier: 'starter' },
    ]);
    const stripe = makeStripeMock({});

    await syncSubscriptionToDb(makeSubscription(), { dbClient: db, stripe });

    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
    expect(spies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionTier: 'starter',
      }),
    );
  });

  it('throws without updating when Stripe cannot resolve the price tier', async () => {
    const { db, spies } = buildDb([
      { id: createId('user'), subscriptionTier: 'free' },
    ]);
    const retrieve = vi.fn().mockRejectedValue(new Error('stripe unavailable'));
    const stripe = makeStripeMock({ prices: { retrieve } });

    await expect(
      syncSubscriptionToDb(
        makeSubscription({ items: { data: [{ price: 'price_missing' }] } }),
        { dbClient: db, stripe },
      ),
    ).rejects.toThrow(
      'Unable to determine subscription tier for Stripe price price_missing',
    );

    expect(spies.update).not.toHaveBeenCalled();
  });
});
