import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { ensureUser, truncateAll } from '@/../tests/helpers/db';
import { setTestUser } from '@/../tests/helpers/auth';
import { db } from '@/lib/db/service-role';
import { users } from '@/lib/db/schema';
import { POST } from '@/app/api/v1/stripe/create-checkout/route';
import * as stripeClient from '@/lib/stripe/client';

vi.mock('@/lib/stripe/client', () => ({
  getStripe: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('POST /api/v1/stripe/create-checkout', () => {
  beforeEach(async () => {
    await truncateAll();
    vi.clearAllMocks();
  });

  it('creates checkout session for new customer', async () => {
    const userId = await ensureUser({
      authUserId: 'user_new_checkout',
      email: 'new.checkout@example.com',
    });

    setTestUser('user_new_checkout');

    const createCustomer = vi.fn().mockResolvedValue({
      id: 'cus_new123',
    });
    const createCheckoutSession = vi.fn().mockResolvedValue({
      id: 'cs_test123',
      url: 'https://checkout.stripe.com/pay/cs_test123',
    });

    const mockStripe = {
      customers: {
        create: createCustomer,
      },
      checkout: {
        sessions: {
          create: createCheckoutSession,
        },
      },
    } as unknown as Stripe;

    vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

    const request = new Request(
      'http://localhost:3000/api/v1/stripe/create-checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          priceId: 'price_starter123',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.sessionUrl).toBe('https://checkout.stripe.com/pay/cs_test123');

    // Verify customer was created
    expect(createCustomer).toHaveBeenCalledWith({
      email: 'new.checkout@example.com',
      metadata: { userId },
    });

    // Verify checkout session was created
    expect(createCheckoutSession).toHaveBeenCalledWith({
      customer: 'cus_new123',
      line_items: [{ price: 'price_starter123', quantity: 1 }],
      mode: 'subscription',
      success_url: 'http://localhost:3000/success',
      cancel_url: 'http://localhost:3000/cancel',
    });

    // Verify customer ID was saved to DB
    const [user] = await db
      .select()
      .from(users)
      .where(sql`id = ${userId}`);
    expect(user?.stripeCustomerId).toBe('cus_new123');
  });

  it('reuses existing customer for checkout', async () => {
    const userId = await ensureUser({
      authUserId: 'user_existing_checkout',
      email: 'existing.checkout@example.com',
    });

    // Set existing customer ID
    await db
      .update(users)
      .set({ stripeCustomerId: 'cus_existing456' })
      .where(sql`id = ${userId}`);

    setTestUser('user_existing_checkout');

    const createCustomer = vi.fn(); // Should not be called
    const createCheckoutSession = vi.fn().mockResolvedValue({
      id: 'cs_test456',
      url: 'https://checkout.stripe.com/pay/cs_test456',
    });

    const mockStripe = {
      customers: {
        create: createCustomer,
      },
      checkout: {
        sessions: {
          create: createCheckoutSession,
        },
      },
    } as unknown as Stripe;

    vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

    const request = new Request(
      'http://localhost:3000/api/v1/stripe/create-checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          priceId: 'price_pro123',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.sessionUrl).toBe('https://checkout.stripe.com/pay/cs_test456');

    // Verify customer was NOT created
    expect(createCustomer).not.toHaveBeenCalled();

    // Verify existing customer was used
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_existing456',
      })
    );
  });

  it('uses default URLs when not provided', async () => {
    await ensureUser({
      authUserId: 'user_default_urls',
      email: 'default.urls@example.com',
    });

    setTestUser('user_default_urls');

    const createCustomer = vi.fn().mockResolvedValue({
      id: 'cus_default123',
    });
    const createCheckoutSession = vi.fn().mockResolvedValue({
      id: 'cs_default123',
      url: 'https://checkout.stripe.com/pay/cs_default123',
    });

    const mockStripe = {
      customers: {
        create: createCustomer,
      },
      checkout: {
        sessions: {
          create: createCheckoutSession,
        },
      },
    } as unknown as Stripe;

    vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

    const request = new Request(
      'http://localhost:3000/api/v1/stripe/create-checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          priceId: 'price_test123',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(200);

    // Verify default URLs were used
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url:
          'http://localhost:3000/settings/billing?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'http://localhost:3000/settings/billing',
      })
    );
  });

  it('returns 400 when priceId is missing', async () => {
    await ensureUser({
      authUserId: 'user_missing_price',
      email: 'missing.price@example.com',
    });

    setTestUser('user_missing_price');

    const request = new Request(
      'http://localhost:3000/api/v1/stripe/create-checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain('priceId is required');
  });

  it('returns 401 when user not authenticated', async () => {
    setTestUser(''); // No user

    const request = new Request(
      'http://localhost:3000/api/v1/stripe/create-checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: 'price_test123',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('returns 401 when user not found in database and auto-provision fails', async () => {
    // When DEV_AUTH_USER_ID is set but the user doesn't exist in DB, the auth
    // middleware attempts to auto-provision via auth.getSession(). If getSession()
    // returns no session (e.g. no cookies in test), ensureUserRecord throws
    // AuthError and the API returns 401.
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({ data: {} });

    setTestUser('user_does_not_exist');

    const request = new Request(
      'http://localhost:3000/api/v1/stripe/create-checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: 'price_test123',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('handles Stripe API errors gracefully', async () => {
    await ensureUser({
      authUserId: 'user_stripe_error',
      email: 'stripe.error@example.com',
    });

    setTestUser('user_stripe_error');

    const createCustomer = vi
      .fn()
      .mockRejectedValue(new Error('Stripe API error: Invalid request'));

    const mockStripe = {
      customers: {
        create: createCustomer,
      },
    } as unknown as Stripe;

    vi.mocked(stripeClient.getStripe).mockReturnValue(mockStripe);

    const request = new Request(
      'http://localhost:3000/api/v1/stripe/create-checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: 'price_test123',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(500);
  });
});
