import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import Stripe from 'stripe';

import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';
import { setTestUser } from '../../helpers/auth';
import { buildTestClerkUserId, buildTestEmail } from '../../helpers/testIds';
import {
  markUserAsSubscribed,
  buildStripeCustomerId,
  buildStripeSubscriptionId,
} from '../../helpers/subscription';
import { db } from '@/lib/db/service-role';
import { users } from '@/lib/db/schema';
import { POST as createPortalPOST } from '@/app/api/v1/stripe/create-portal/route';
import { POST as webhookPOST } from '@/app/api/v1/stripe/webhook/route';
import { GET as subscriptionGET } from '@/app/api/v1/user/subscription/route';
import * as stripeClient from '@/lib/stripe/client';

vi.mock('@/lib/stripe/client', () => ({
  getStripe: vi.fn(),
}));

async function createAuthTestUser() {
  const clerkUserId = buildTestClerkUserId('stripe-api');
  const email = buildTestEmail(clerkUserId);
  const userId = await ensureUser({ clerkUserId, email });
  setTestUser(clerkUserId);
  return userId;
}

describe('Stripe API Routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
    vi.clearAllMocks();
  });

  describe('POST /api/v1/stripe/create-portal', () => {
    it('creates portal session for existing customer', async () => {
      const userId = await createAuthTestUser();
      const stripeCustomerId = buildStripeCustomerId(userId, 'portal');
      await db
        .update(users)
        .set({ stripeCustomerId })
        .where(sql`id = ${userId}`);

      const mockStripe = {
        billingPortal: {
          sessions: {
            create: vi.fn().mockResolvedValue({
              url: 'https://billing.stripe.com/session_portal123',
            }),
          },
        },
      } as unknown as Stripe;

      vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

      const request = new Request(
        'http://localhost/api/v1/stripe/create-portal',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost',
          },
          body: JSON.stringify({
            returnUrl: 'http://localhost/settings',
          }),
        }
      );

      const response = await createPortalPOST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.portalUrl).toBe(
        'https://billing.stripe.com/session_portal123'
      );
    });

    it('returns 400 when no Stripe customer exists', async () => {
      await createAuthTestUser();

      const request = new Request(
        'http://localhost/api/v1/stripe/create-portal',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );

      const response = await createPortalPOST(request);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/stripe/webhook', () => {
    it('handles checkout.session.completed event', async () => {
      const event = {
        id: 'evt_test123',
        type: 'checkout.session.completed',
        livemode: false,
        data: {
          object: {
            id: 'cs_test123',
            customer: 'cus_test123',
          },
        },
      } as unknown as Stripe.Event;

      const request = new Request('http://localhost/api/v1/stripe/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'test_signature',
        },
        body: JSON.stringify(event),
      });

      const constructEventSpy = vi
        .spyOn(Stripe.webhooks, 'constructEvent')
        .mockReturnValue(event);

      // Set webhook secret
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';

      const response = await webhookPOST(request);

      expect(response.status).toBe(200);
      expect(constructEventSpy).toHaveBeenCalled();

      // Cleanup
      delete process.env.STRIPE_WEBHOOK_SECRET;
      constructEventSpy.mockRestore();
    });

    it('handles subscription.created event and syncs to DB', async () => {
      const userId = await createAuthTestUser();
      const { stripeCustomerId } = await markUserAsSubscribed(userId, {
        subscriptionTier: 'free',
        subscriptionStatus: 'canceled',
      });
      const expectedSubscriptionId = buildStripeSubscriptionId(
        userId,
        'webhook-created'
      );

      const event = {
        id: 'evt_sub_created',
        type: 'customer.subscription.created',
        livemode: false,
        data: {
          object: {
            id: expectedSubscriptionId,
            customer: stripeCustomerId,
            status: 'active',
            items: {
              data: [
                {
                  price: 'price_starter',
                },
              ],
            },
            current_period_end: 1735689600,
          },
        },
      } as unknown as Stripe.Event;

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

      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';

      const constructEventSpy = vi
        .spyOn(Stripe.webhooks, 'constructEvent')
        .mockReturnValue(event);

      const request = new Request('http://localhost/api/v1/stripe/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'test_signature',
        },
        body: JSON.stringify(event),
      });

      const response = await webhookPOST(request);

      expect(response.status).toBe(200);

      // Verify DB updated
      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);
      expect(user?.subscriptionTier).toBe('starter');
      expect(user?.subscriptionStatus).toBe('active');
      expect(user?.stripeCustomerId).toBe(stripeCustomerId);
      expect(user?.stripeSubscriptionId).toBe(expectedSubscriptionId);
      expect(user?.subscriptionPeriodEnd).toEqual(new Date(1735689600 * 1000));

      delete process.env.STRIPE_WEBHOOK_SECRET;
      constructEventSpy.mockRestore();
    });

    it('handles subscription.deleted event and downgrades to free', async () => {
      const userId = await createAuthTestUser();
      const { stripeCustomerId } = await markUserAsSubscribed(userId, {
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
      });
      const expectedSubscriptionId = buildStripeSubscriptionId(
        userId,
        'webhook-deleted'
      );

      const event = {
        id: 'evt_sub_deleted',
        type: 'customer.subscription.deleted',
        livemode: false,
        data: {
          object: {
            id: expectedSubscriptionId,
            customer: stripeCustomerId,
          },
        },
      } as unknown as Stripe.Event;

      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';

      const constructEventSpy = vi
        .spyOn(Stripe.webhooks, 'constructEvent')
        .mockReturnValue(event);

      const request = new Request('http://localhost/api/v1/stripe/webhook', {
        method: 'POST',
        headers: {
          'stripe-signature': 'test_signature',
        },
        body: JSON.stringify(event),
      });

      const response = await webhookPOST(request);

      expect(response.status).toBe(200);

      // Verify downgraded to free
      const [user] = await db
        .select()
        .from(users)
        .where(sql`id = ${userId}`);
      expect(user?.subscriptionTier).toBe('free');
      expect(user?.subscriptionStatus).toBe('canceled');
      expect(user?.stripeSubscriptionId).toBeNull();

      delete process.env.STRIPE_WEBHOOK_SECRET;
      constructEventSpy.mockRestore();
    });

    it('returns 400 when signature missing', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';

      const request = new Request('http://localhost/api/v1/stripe/webhook', {
        method: 'POST',
        body: JSON.stringify({ type: 'test' }),
      });

      const response = await webhookPOST(request);

      expect(response.status).toBe(400);

      delete process.env.STRIPE_WEBHOOK_SECRET;
    });
  });

  describe('GET /api/v1/user/subscription', () => {
    it('returns subscription and usage data', async () => {
      const userId = await createAuthTestUser();

      await db
        .update(users)
        .set({
          subscriptionTier: 'pro',
          subscriptionStatus: 'active',
          subscriptionPeriodEnd: new Date('2025-12-31'),
        })
        .where(sql`id = ${userId}`);

      const request = new Request('http://localhost/api/v1/user/subscription', {
        method: 'GET',
      });

      const response = await subscriptionGET(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.tier).toBe('pro');
      expect(body.status).toBe('active');
      expect(body.usage).toBeDefined();
      expect(body.usage.activePlans).toBeDefined();
      expect(body.usage.regenerations).toBeDefined();
      expect(body.usage.exports).toBeDefined();
    });

    it('returns 401 when not authenticated', async () => {
      setTestUser('');

      const request = new Request('http://localhost/api/v1/user/subscription', {
        method: 'GET',
      });

      const response = await subscriptionGET(request);

      expect(response.status).toBe(401);
    });
  });
});
