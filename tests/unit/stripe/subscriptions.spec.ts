import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { ensureUser, truncateAll } from '@/../tests/helpers/db';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import {
  createCustomer,
  getSubscriptionTier,
  syncSubscriptionToDb,
  cancelSubscription,
  getCustomerPortalUrl,
} from '@/lib/stripe/subscriptions';
import * as stripeClient from '@/lib/stripe/client';

// Mock Stripe client
vi.mock('@/lib/stripe/client', () => ({
  getStripe: vi.fn(),
}));

describe('Subscription Management', () => {
  beforeEach(async () => {
    await truncateAll();
    vi.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('creates new Stripe customer and stores ID', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_create_customer',
        email: 'create.customer@example.com',
      });

      const mockStripe = {
        customers: {
          create: vi.fn().mockResolvedValue({
            id: 'cus_test123',
          }),
        },
      } as unknown as Stripe;

      vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

      const customerId = await createCustomer(
        userId,
        'create.customer@example.com'
      );

      expect(customerId).toBe('cus_test123');
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'create.customer@example.com',
        metadata: { userId },
      });

      // Verify DB updated
      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);
      expect(user?.stripeCustomerId).toBe('cus_test123');
    });

    it('returns existing customer ID if already set', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_existing_customer',
        email: 'existing.customer@example.com',
      });

      // Set existing customer ID
      await db
        .update(users)
        .set({ stripeCustomerId: 'cus_existing456' })
        .where(sql`id = ${userId}`);

      const mockStripe = {
        customers: {
          create: vi.fn(), // Should not be called
        },
      } as unknown as Stripe;

      vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

      const customerId = await createCustomer(
        userId,
        'existing.customer@example.com'
      );

      expect(customerId).toBe('cus_existing456');
      expect(mockStripe.customers.create).not.toHaveBeenCalled();
    });
  });

  describe('getSubscriptionTier', () => {
    it('returns subscription info for user', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_get_tier',
        email: 'get.tier@example.com',
      });

      // Set subscription data
      const periodEnd = new Date('2025-12-31');
      await db
        .update(users)
        .set({
          subscriptionTier: 'pro',
          subscriptionStatus: 'active',
          subscriptionPeriodEnd: periodEnd,
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_123',
        })
        .where(sql`id = ${userId}`);

      const tier = await getSubscriptionTier(userId);

      expect(tier).toEqual({
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
        subscriptionPeriodEnd: periodEnd,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
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
      const userId = await ensureUser({
        clerkUserId: 'user_sync_starter',
        email: 'sync.starter@example.com',
      });

      // Set customer ID
      await db
        .update(users)
        .set({ stripeCustomerId: 'cus_sync123' })
        .where(sql`id = ${userId}`);

      const mockSubscription = {
        id: 'sub_test789',
        customer: 'cus_sync123',
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

      vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

      await syncSubscriptionToDb(mockSubscription);

      // Verify DB updated
      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);

      expect(user?.subscriptionTier).toBe('starter');
      expect(user?.subscriptionStatus).toBe('active');
      expect(user?.stripeSubscriptionId).toBe('sub_test789');
      expect(user?.subscriptionPeriodEnd).toEqual(new Date(1735689600 * 1000));
    });

    it('syncs canceled subscription to DB', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_sync_canceled',
        email: 'sync.canceled@example.com',
      });

      // Set customer ID
      await db
        .update(users)
        .set({ stripeCustomerId: 'cus_canceled123' })
        .where(sql`id = ${userId}`);

      const mockSubscription = {
        id: 'sub_canceled789',
        customer: 'cus_canceled123',
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

      vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

      await syncSubscriptionToDb(mockSubscription);

      // Verify DB updated
      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);

      expect(user?.subscriptionTier).toBe('pro');
      expect(user?.subscriptionStatus).toBe('canceled');
    });

    it('maps past_due status correctly', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_sync_past_due',
        email: 'sync.past_due@example.com',
      });

      await db
        .update(users)
        .set({ stripeCustomerId: 'cus_past_due123' })
        .where(sql`id = ${userId}`);

      const mockSubscription = {
        id: 'sub_past_due789',
        customer: 'cus_past_due123',
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

      vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

      await syncSubscriptionToDb(mockSubscription);

      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);

      expect(user?.subscriptionStatus).toBe('past_due');
    });

    it('defaults to free tier when no tier metadata', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_sync_no_tier',
        email: 'sync.no_tier@example.com',
      });

      await db
        .update(users)
        .set({ stripeCustomerId: 'cus_no_tier123' })
        .where(sql`id = ${userId}`);

      const mockSubscription = {
        id: 'sub_no_tier789',
        customer: 'cus_no_tier123',
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

      vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

      await syncSubscriptionToDb(mockSubscription);

      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);

      expect(user?.subscriptionTier).toBe('free');
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

      vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

      // Should log error but not throw
      await expect(
        syncSubscriptionToDb(mockSubscription)
      ).resolves.toBeUndefined();
    });
  });

  describe('cancelSubscription', () => {
    it('cancels subscription at period end', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_cancel_sub',
        email: 'cancel.sub@example.com',
      });

      // Set subscription ID
      await db
        .update(users)
        .set({ stripeSubscriptionId: 'sub_to_cancel' })
        .where(sql`id = ${userId}`);

      const mockStripe = {
        subscriptions: {
          update: vi.fn().mockResolvedValue({
            id: 'sub_to_cancel',
            cancel_at_period_end: true,
          }),
        },
      } as unknown as Stripe;

      vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

      await cancelSubscription(userId);

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_to_cancel',
        {
          cancel_at_period_end: true,
        }
      );
    });

    it('throws error if no active subscription', async () => {
      const userId = await ensureUser({
        clerkUserId: 'user_no_sub',
        email: 'no.sub@example.com',
      });

      await expect(cancelSubscription(userId)).rejects.toThrow(
        'No active subscription found'
      );
    });
  });

  describe('getCustomerPortalUrl', () => {
    it('creates portal session and returns URL', async () => {
      const mockStripe = {
        billingPortal: {
          sessions: {
            create: vi.fn().mockResolvedValue({
              url: 'https://billing.stripe.com/session_abc123',
            }),
          },
        },
      } as unknown as Stripe;

      vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

      const url = await getCustomerPortalUrl(
        'cus_123',
        'https://example.com/settings'
      );

      expect(url).toBe('https://billing.stripe.com/session_abc123');
      expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'https://example.com/settings',
      });
    });
  });
});
