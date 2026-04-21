import {
  makeStripeInvoice,
  makeStripeMock,
  makeStripeSubscription,
} from '@tests/fixtures/stripe-mocks';
import { sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPaymentFailed,
  applySubscriptionDeleted,
  applySubscriptionSync,
  type TransitionDeps,
} from '@/features/billing/account-transitions';
import {
  cancelSubscription,
  createCustomer,
  getCustomerPortalUrl,
  getSubscriptionTier,
} from '@/features/billing/subscriptions';
import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { createLogger } from '@/lib/logging/logger';
import { ensureUser } from '../../helpers/db';
import {
  buildStripeCustomerId,
  buildStripeSubscriptionId,
  markUserAsSubscribed,
} from '../../helpers/subscription';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

async function createUniqueUser() {
  const authUserId = buildTestAuthUserId('stripe-subscriptions');
  const email = buildTestEmail(authUserId);
  return ensureUser({ authUserId, email });
}

function makeTransitionDeps(stripe?: Stripe): TransitionDeps {
  const logger = Object.assign(createLogger({ test: 'subscriptions.spec' }), {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  });

  return {
    stripe,
    logger,
    db,
    users,
  };
}

describe('Subscription Management', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('creates new Stripe customer and stores ID', async () => {
      const userId = await createUniqueUser();
      const expectedCustomerId = buildStripeCustomerId(userId, 'create');

      const createStripeCustomer = vi.fn().mockResolvedValue({
        id: expectedCustomerId,
      });

      const mockStripe = makeStripeMock({
        customers: {
          create: createStripeCustomer,
        },
      });

      const customerId = await createCustomer(
        userId,
        'create.customer@example.com',
        mockStripe
      );

      expect(customerId).toBe(expectedCustomerId);
      expect(createStripeCustomer).toHaveBeenCalledWith(
        {
          email: 'create.customer@example.com',
          metadata: { userId },
        },
        {
          timeout: 10_000,
        }
      );

      // Verify DB updated
      const [user] = await db.select().from(users).where(sql`id = ${userId}`);
      expect(user?.stripeCustomerId).toBe(expectedCustomerId);
    });

    it('returns existing customer ID if already set', async () => {
      const userId = await createUniqueUser();
      const existingCustomerId = buildStripeCustomerId(userId, 'existing');

      // Set existing customer ID
      await db
        .update(users)
        .set({ stripeCustomerId: existingCustomerId })
        .where(sql`id = ${userId}`);

      const createStripeCustomer = vi.fn(); // Should not be called

      const mockStripe = makeStripeMock({
        customers: {
          create: createStripeCustomer,
        },
      });

      const customerId = await createCustomer(
        userId,
        'existing.customer@example.com',
        mockStripe
      );

      expect(customerId).toBe(existingCustomerId);
      expect(createStripeCustomer).not.toHaveBeenCalled();
    });
  });

  describe('getSubscriptionTier', () => {
    it('returns subscription info for user', async () => {
      const userId = await createUniqueUser();
      // Set subscription data
      const periodEnd = new Date('2025-12-31');
      const { stripeCustomerId, stripeSubscriptionId } =
        await markUserAsSubscribed(userId, {
          subscriptionTier: 'pro',
          subscriptionStatus: 'active',
          subscriptionPeriodEnd: periodEnd,
        });

      const tier = await getSubscriptionTier(userId);

      expect(tier).toEqual({
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
        subscriptionPeriodEnd: periodEnd,
        stripeCustomerId,
        stripeSubscriptionId,
      });
    });

    it('throws error if user not found', async () => {
      await expect(
        getSubscriptionTier('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('User not found');
    });
  });

  describe('applySubscriptionSync', () => {
    it('syncs active subscription with starter tier to DB', async () => {
      const userId = await createUniqueUser();
      const { stripeCustomerId } = await markUserAsSubscribed(userId, {
        subscriptionTier: 'free',
        subscriptionStatus: 'canceled',
      });

      const expectedSubscriptionId = buildStripeSubscriptionId(
        userId,
        'sync-starter'
      );

      const mockSubscription = makeStripeSubscription({
        id: expectedSubscriptionId,
        customer: stripeCustomerId,
        status: 'active',
        cancel_at_period_end: true,
        items: {
          data: [
            {
              price: {
                id: 'price_starter',
              } as Stripe.Price,
            },
          ],
        },
        current_period_end: 1735689600, // 2025-01-01 00:00:00 UTC
      });

      const mockStripe = makeStripeMock({
        prices: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'price_starter',
            product: {
              metadata: { tier: 'starter' },
            },
          }),
        },
      });

      await applySubscriptionSync(
        mockSubscription,
        makeTransitionDeps(mockStripe)
      );

      // Verify DB updated
      const [user] = await db.select().from(users).where(sql`id = ${userId}`);

      expect(user?.subscriptionTier).toBe('starter');
      expect(user?.subscriptionStatus).toBe('active');
      expect(user?.stripeSubscriptionId).toBe(expectedSubscriptionId);
      expect(user?.subscriptionPeriodEnd).toEqual(new Date(1735689600 * 1000));
      expect(user?.cancelAtPeriodEnd).toBe(true);
    });

    it('syncs canceled subscription to DB', async () => {
      const userId = await createUniqueUser();
      const { stripeCustomerId } = await markUserAsSubscribed(userId, {
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
      });

      const expectedSubscriptionId = buildStripeSubscriptionId(
        userId,
        'sync-canceled'
      );

      const mockSubscription = makeStripeSubscription({
        id: expectedSubscriptionId,
        customer: stripeCustomerId,
        status: 'canceled',
        items: {
          data: [
            {
              price: {
                id: 'price_pro',
              } as Stripe.Price,
            },
          ],
        },
        current_period_end: 1735689600,
      });

      const mockStripe = makeStripeMock({
        prices: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'price_pro',
            product: {
              metadata: { tier: 'pro' },
            },
          }),
        },
      });

      await applySubscriptionSync(
        mockSubscription,
        makeTransitionDeps(mockStripe)
      );

      // Verify DB updated
      const [user] = await db.select().from(users).where(sql`id = ${userId}`);

      expect(user?.subscriptionTier).toBe('pro');
      expect(user?.subscriptionStatus).toBe('canceled');
      expect(user?.stripeSubscriptionId).toBe(expectedSubscriptionId);
    });

    it('maps past_due status correctly', async () => {
      const userId = await createUniqueUser();
      const { stripeCustomerId } = await markUserAsSubscribed(userId, {
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
      });

      const expectedSubscriptionId = buildStripeSubscriptionId(
        userId,
        'past-due'
      );

      const mockSubscription = makeStripeSubscription({
        id: expectedSubscriptionId,
        customer: stripeCustomerId,
        status: 'past_due',
        items: {
          data: [
            {
              price: {
                id: 'price_starter',
              } as Stripe.Price,
            },
          ],
        },
        current_period_end: 1735689600,
      });

      const mockStripe = makeStripeMock({
        prices: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'price_starter',
            product: {
              metadata: { tier: 'starter' },
            },
          }),
        },
      });

      await applySubscriptionSync(
        mockSubscription,
        makeTransitionDeps(mockStripe)
      );

      const [user] = await db.select().from(users).where(sql`id = ${userId}`);

      expect(user?.subscriptionStatus).toBe('past_due');
      expect(user?.stripeSubscriptionId).toBe(expectedSubscriptionId);
    });

    it('defaults to free tier when no tier metadata', async () => {
      const userId = await createUniqueUser();
      const { stripeCustomerId } = await markUserAsSubscribed(userId, {
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
      });

      const expectedSubscriptionId = buildStripeSubscriptionId(
        userId,
        'no-tier'
      );

      const mockSubscription = makeStripeSubscription({
        id: expectedSubscriptionId,
        customer: stripeCustomerId,
        status: 'active',
        items: {
          data: [
            {
              price: {
                id: 'price_no_metadata',
              } as Stripe.Price,
            },
          ],
        },
        current_period_end: 1735689600,
      });

      const mockStripe = makeStripeMock({
        prices: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'price_no_metadata',
            product: {
              metadata: {},
            },
          }),
        },
      });

      await applySubscriptionSync(
        mockSubscription,
        makeTransitionDeps(mockStripe)
      );

      const [user] = await db.select().from(users).where(sql`id = ${userId}`);

      expect(user?.subscriptionTier).toBe('free');
      expect(user?.stripeSubscriptionId).toBe(expectedSubscriptionId);
    });

    it('does not crash if user not found for customer ID', async () => {
      const mockSubscription = makeStripeSubscription({
        id: 'sub_no_user',
        customer: 'cus_nonexistent',
        status: 'active',
        items: {
          data: [
            {
              price: {
                id: 'price_test',
              },
            },
          ],
        },
      });

      const mockStripe = makeStripeMock({
        prices: {
          retrieve: vi.fn(),
        },
      });

      // Should log error but not throw
      await expect(
        applySubscriptionSync(mockSubscription, makeTransitionDeps(mockStripe))
      ).resolves.toBeUndefined();
    });

    it('throws when Stripe price lookup fails so the webhook can retry', async () => {
      const userId = await createUniqueUser();
      const { stripeCustomerId } = await markUserAsSubscribed(userId, {
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
      });

      const originalPeriodEnd = new Date('2026-01-01T00:00:00.000Z');
      await db
        .update(users)
        .set({
          subscriptionPeriodEnd: originalPeriodEnd,
          stripeSubscriptionId: buildStripeSubscriptionId(userId, 'original'),
        })
        .where(sql`id = ${userId}`);

      const mockSubscription = makeStripeSubscription({
        id: buildStripeSubscriptionId(userId, 'price-lookup-failure'),
        customer: stripeCustomerId,
        status: 'active',
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: {
                id: 'price_unreachable',
              },
            },
          ],
        },
        current_period_end: 1735689600,
      });

      const mockStripe = makeStripeMock({
        prices: {
          retrieve: vi
            .fn()
            .mockRejectedValue(new Error('Stripe price lookup failed')),
        },
      });

      await expect(
        applySubscriptionSync(mockSubscription, makeTransitionDeps(mockStripe))
      ).rejects.toThrow(
        'Unable to determine subscription tier for Stripe price price_unreachable'
      );

      const [user] = await db.select().from(users).where(sql`id = ${userId}`);
      expect(user?.subscriptionTier).toBe('starter');
      expect(user?.stripeSubscriptionId).toBe(
        buildStripeSubscriptionId(userId, 'original')
      );
      expect(user?.subscriptionPeriodEnd).toEqual(originalPeriodEnd);
    });
  });

  describe('extracted transition handlers', () => {
    it('applySubscriptionDeleted downgrades the mapped user to free', async () => {
      const userId = await createUniqueUser();
      const { stripeCustomerId, stripeSubscriptionId } =
        await markUserAsSubscribed(userId, {
          subscriptionTier: 'pro',
          subscriptionStatus: 'active',
          subscriptionPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
        });

      const subscription = makeStripeSubscription({
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
      });

      await applySubscriptionDeleted(subscription, makeTransitionDeps());

      const [user] = await db.select().from(users).where(sql`id = ${userId}`);

      expect(user?.subscriptionTier).toBe('free');
      expect(user?.subscriptionStatus).toBe('canceled');
      expect(user?.stripeSubscriptionId).toBeNull();
      expect(user?.subscriptionPeriodEnd).toBeNull();
      expect(user?.cancelAtPeriodEnd).toBe(false);
    });

    it('applySubscriptionDeleted clears stripeSubscriptionId when retaining entitlements', async () => {
      const userId = await createUniqueUser();
      const retainedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const currentPeriodEnd = Math.floor(retainedUntil.getTime() / 1000);
      const { stripeCustomerId, stripeSubscriptionId } =
        await markUserAsSubscribed(userId, {
          subscriptionTier: 'pro',
          subscriptionStatus: 'active',
          subscriptionPeriodEnd: retainedUntil,
        });

      const subscription = makeStripeSubscription({
        id: stripeSubscriptionId,
        customer: stripeCustomerId,
        cancel_at_period_end: true,
        current_period_end: currentPeriodEnd,
      });

      await applySubscriptionDeleted(subscription, makeTransitionDeps());

      const [user] = await db.select().from(users).where(sql`id = ${userId}`);

      expect(user?.subscriptionTier).toBe('pro');
      expect(user?.subscriptionStatus).toBe('canceled');
      expect(user?.stripeSubscriptionId).toBeNull();
      expect(user?.subscriptionPeriodEnd).toEqual(
        new Date(currentPeriodEnd * 1000)
      );
      expect(user?.cancelAtPeriodEnd).toBe(true);
    });

    it('applyPaymentFailed marks the mapped user as past_due', async () => {
      const userId = await createUniqueUser();
      const { stripeCustomerId } = await markUserAsSubscribed(userId, {
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
      });

      const invoice = makeStripeInvoice({
        id: 'in_payment_failed',
        customer: stripeCustomerId,
      });

      await applyPaymentFailed(invoice, makeTransitionDeps());

      const [user] = await db.select().from(users).where(sql`id = ${userId}`);

      expect(user?.subscriptionStatus).toBe('past_due');
      expect(user?.subscriptionTier).toBe('starter');
    });

    it('applyPaymentFailed marks subscribed free-tier users as past_due', async () => {
      const userId = await createUniqueUser();
      const { stripeCustomerId } = await markUserAsSubscribed(userId, {
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
      });

      const invoice = makeStripeInvoice({
        id: 'in_payment_failed_free_tier',
        customer: stripeCustomerId,
      });

      await applyPaymentFailed(invoice, makeTransitionDeps());

      const [user] = await db.select().from(users).where(sql`id = ${userId}`);

      expect(user?.subscriptionStatus).toBe('past_due');
      expect(user?.subscriptionTier).toBe('free');
      expect(user?.stripeSubscriptionId).not.toBeNull();
    });

    it('applySubscriptionDeleted resolves when no mapped user exists', async () => {
      const subscription = makeStripeSubscription({
        id: 'sub_no_user',
        customer: 'cus_nonexistent',
      });

      await expect(
        applySubscriptionDeleted(subscription, makeTransitionDeps())
      ).resolves.toBeUndefined();
    });

    it('applyPaymentFailed resolves when no mapped user exists', async () => {
      const invoice = makeStripeInvoice({
        id: 'in_no_user',
        customer: 'cus_nonexistent',
      });

      await expect(
        applyPaymentFailed(invoice, makeTransitionDeps())
      ).resolves.toBeUndefined();
    });
  });

  describe('cancelSubscription', () => {
    it('cancels subscription at period end', async () => {
      const userId = await createUniqueUser();
      const { stripeSubscriptionId } = await markUserAsSubscribed(userId, {
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
      });

      const updateSubscription = vi.fn().mockResolvedValue({
        id: stripeSubscriptionId,
        cancel_at_period_end: true,
      });

      const mockStripe = makeStripeMock({
        subscriptions: {
          update: updateSubscription,
        },
      });

      await cancelSubscription(userId, mockStripe);

      expect(updateSubscription).toHaveBeenCalledWith(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    });

    it('throws error if no active subscription', async () => {
      const userId = await createUniqueUser();

      await expect(cancelSubscription(userId)).rejects.toThrow(
        'No active subscription found'
      );
    });
  });

  describe('getCustomerPortalUrl', () => {
    it('creates portal session and returns URL', async () => {
      const createPortalSession = vi.fn().mockResolvedValue({
        url: 'https://billing.stripe.com/session_abc123',
      });

      const mockStripe = makeStripeMock({
        billingPortal: {
          sessions: {
            create: createPortalSession,
          },
        },
      });

      const testCustomerId = buildStripeCustomerId('portal-customer', 'portal');
      const url = await getCustomerPortalUrl(
        testCustomerId,
        'https://example.com/settings',
        mockStripe
      );

      expect(url).toBe('https://billing.stripe.com/session_abc123');
      expect(createPortalSession).toHaveBeenCalledWith({
        customer: testCustomerId,
        return_url: 'https://example.com/settings',
      });
    });
  });
});
