import { makeStripeMock } from '@tests/fixtures/stripe-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStripeCommerceBoundary } from '@/features/billing/stripe-commerce/factory';
import type { StripeGateway } from '@/features/billing/stripe-commerce/gateway';
import { LiveStripeGateway } from '@/features/billing/stripe-commerce/live-gateway';
import { ValidationError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import { db as serviceRoleDb } from '@/lib/db/service-role';
import { logger } from '@/lib/logging/logger';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

describe('StripeCommerceBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('beginCheckout rejects unknown price ids before calling Stripe', async () => {
    vi.stubEnv(
      'STRIPE_STARTER_MONTHLY_PRICE_ID',
      'price_starter_monthly_approved'
    );
    vi.stubEnv('STRIPE_PRO_MONTHLY_PRICE_ID', 'price_pro_monthly_approved');
    vi.stubEnv(
      'STRIPE_STARTER_YEARLY_PRICE_ID',
      'price_starter_yearly_approved'
    );
    vi.stubEnv('STRIPE_PRO_YEARLY_PRICE_ID', 'price_pro_yearly_approved');

    const authUserId = buildTestAuthUserId('commerce-boundary-price');
    const email = buildTestEmail(authUserId);
    const userId = await ensureUser({ authUserId, email });
    setTestUser(authUserId);

    const mockStripe = makeStripeMock({
      customers: {
        create: vi.fn().mockResolvedValue({ id: 'cus_x' }),
      },
      checkout: {
        sessions: {
          create: vi.fn(),
        },
      },
    });

    const boundary = createStripeCommerceBoundary({
      gateway: new LiveStripeGateway(mockStripe),
      localMode: false,
      getDb,
      serviceRoleDb,
      users,
      webhookSecret: null,
      webhookDevMode: true,
      isProduction: false,
      isDevOrTest: true,
    });

    await expect(
      boundary.beginCheckout({
        actor: { userId, email },
        priceId: 'price_not_in_catalog',
      })
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('acceptWebhook returns 400 when signature is missing and secret is configured', async () => {
    const boundary = createStripeCommerceBoundary({
      gateway: new LiveStripeGateway(makeStripeMock({})),
      webhookSecret: 'whsec_test',
      webhookDevMode: false,
      isProduction: false,
      isDevOrTest: true,
    });

    const res = await boundary.acceptWebhook({
      rawBody: '{}',
      signatureHeader: null,
      contentLength: 2,
      logger,
    });

    expect(res.status).toBe(400);
    expect(res.body).toBe('missing signature');
  });

  it('openPortal uses the injected gateway portal session method', async () => {
    const createBillingPortalSession = vi.fn().mockResolvedValue({
      url: 'https://example.test/portal',
    });
    const rawStripe = makeStripeMock({
      billingPortal: {
        sessions: {
          create: vi
            .fn()
            .mockRejectedValue(new Error('raw Stripe should not run')),
        },
      },
    });
    const gateway: StripeGateway = {
      getStripeClient: () => rawStripe,
      createCheckoutSession: vi.fn().mockResolvedValue({ url: null }),
      createBillingPortalSession,
      constructWebhookEvent: vi.fn(() => {
        throw new Error('not used');
      }),
      retrieveSubscription: vi.fn(async () => {
        throw new Error('not used');
      }),
    };

    const boundary = createStripeCommerceBoundary({
      gateway,
      webhookSecret: null,
      webhookDevMode: true,
      isProduction: false,
      isDevOrTest: true,
    });

    await expect(
      boundary.openPortal({
        actor: {
          userId: 'user_portal',
          stripeCustomerId: 'cus_portal',
          subscriptionStatus: 'active',
        },
        returnUrl: '/settings/billing',
      })
    ).resolves.toEqual({
      portalUrl: 'https://example.test/portal',
    });

    expect(createBillingPortalSession).toHaveBeenCalledWith({
      customerId: 'cus_portal',
      returnUrl: 'http://localhost:3000/settings/billing',
    });
  });
});
