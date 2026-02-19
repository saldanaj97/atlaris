import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type Stripe from 'stripe';

import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';
import {
  markUserAsSubscribed,
  buildStripeCustomerId,
  buildStripeSubscriptionId,
} from '../../helpers/subscription';
import { db } from '@/lib/db/service-role';
import { users } from '@/lib/db/schema';
import {
  createCustomer,
  getSubscriptionTier,
  syncSubscriptionToDb,
  cancelSubscription,
  getCustomerPortalUrl,
} from '@/lib/stripe/subscriptions';

async function createUniqueUser() {
  const authUserId = buildTestAuthUserId('stripe-subscriptions');
  const email = buildTestEmail(authUserId);
  return ensureUser({ authUserId, email });
}

describe('Subscription Management', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
    vi.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('creates new Stripe customer and stores ID', async () => {
      const userId = await createUniqueUser();
      const expectedCustomerId = buildStripeCustomerId(userId, 'create');

      const createStripeCustomer = vi.fn().mockResolvedValue({
        id: expectedCustomerId,
      });

      const mockStripe = {
        customers: {
          create: createStripeCustomer,
        },
      } as unknown as Stripe;

      const customerId = await createCustomer(
        userId,
        'create.customer@example.com',
        mockStripe
      );

      expect(customerId).toBe(expectedCustomerId);
      expect(createStripeCustomer).toHaveBeenCalledWith({
        email: 'create.customer@example.com',
        metadata: { userId },
      });

      // Verify DB updated
      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);
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

      const mockStripe = {
        customers: {
          create: createStripeCustomer,
        },
      } as unknown as Stripe;

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

  describe('syncSubscriptionToDb', () => {
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

      const mockSubscription = {
        id: expectedSubscriptionId,
        customer: stripeCustomerId,
        status: 'active',
        items: {
          data: [
            {
              price: {
                id: 'price_starter',
                product: {
                  metadata: {
                    tier: 'starter',
                  },
                },
              },
            },
          ],
        },
        current_period_end: 1735689600, // 2025-01-01 00:00:00 UTC
      } as unknown as Stripe.Subscription;

      const mockStripe = {
        prices: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'price_starter',
            product: {
              metadata: { tier: 'starter' },
            },
          }),
        },
      } as unknown as Stripe;

      await syncSubscriptionToDb(mockSubscription, mockStripe);

      // Verify DB updated
      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);

      expect(user?.subscriptionTier).toBe('starter');
      expect(user?.subscriptionStatus).toBe('active');
      expect(user?.stripeSubscriptionId).toBe(expectedSubscriptionId);
      expect(user?.subscriptionPeriodEnd).toEqual(new Date(1735689600 * 1000));
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

      const mockSubscription = {
        id: expectedSubscriptionId,
        customer: stripeCustomerId,
        status: 'canceled',
        items: {
          data: [
            {
              price: {
                id: 'price_pro',
                product: {
                  metadata: {
                    tier: 'pro',
                  },
                },
              },
            },
          ],
        },
        current_period_end: 1735689600,
      } as unknown as Stripe.Subscription;

      const mockStripe = {
        prices: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'price_pro',
            product: {
              metadata: { tier: 'pro' },
            },
          }),
        },
      } as unknown as Stripe;

      await syncSubscriptionToDb(mockSubscription, mockStripe);

      // Verify DB updated
      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);

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

      const mockSubscription = {
        id: expectedSubscriptionId,
        customer: stripeCustomerId,
        status: 'past_due',
        items: {
          data: [
            {
              price: {
                id: 'price_starter',
                product: {
                  metadata: {
                    tier: 'starter',
                  },
                },
              },
            },
          ],
        },
        current_period_end: 1735689600,
      } as unknown as Stripe.Subscription;

      const mockStripe = {
        prices: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'price_starter',
            product: {
              metadata: { tier: 'starter' },
            },
          }),
        },
      } as unknown as Stripe;

      await syncSubscriptionToDb(mockSubscription, mockStripe);

      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);

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

      const mockSubscription = {
        id: expectedSubscriptionId,
        customer: stripeCustomerId,
        status: 'active',
        items: {
          data: [
            {
              price: {
                id: 'price_no_metadata',
                product: {
                  metadata: {}, // No tier metadata
                },
              },
            },
          ],
        },
        current_period_end: 1735689600,
      } as unknown as Stripe.Subscription;

      const mockStripe = {
        prices: {
          retrieve: vi.fn().mockResolvedValue({
            id: 'price_no_metadata',
            product: {
              metadata: {},
            },
          }),
        },
      } as unknown as Stripe;

      await syncSubscriptionToDb(mockSubscription, mockStripe);

      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);

      expect(user?.subscriptionTier).toBe('free');
      expect(user?.stripeSubscriptionId).toBe(expectedSubscriptionId);
    });

    it('does not crash if user not found for customer ID', async () => {
      const mockSubscription = {
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
      } as unknown as Stripe.Subscription;

      const mockStripe = {
        prices: {
          retrieve: vi.fn(),
        },
      } as unknown as Stripe;

      // Should log error but not throw
      await expect(
        syncSubscriptionToDb(mockSubscription, mockStripe)
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

      const mockStripe = {
        subscriptions: {
          update: updateSubscription,
        },
      } as unknown as Stripe;

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

      const mockStripe = {
        billingPortal: {
          sessions: {
            create: createPortalSession,
          },
        },
      } as unknown as Stripe;

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
