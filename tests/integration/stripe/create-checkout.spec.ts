import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { ensureUser, truncateAll } from '@/../tests/helpers/db';
import { setTestUser } from '@/../tests/helpers/auth';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { POST } from '@/app/api/v1/stripe/create-checkout/route';
import * as stripeClient from '@/lib/stripe/client';

vi.mock('@/lib/stripe/client', () => ({
  getStripe: vi.fn(),
}));

describe('POST /api/v1/stripe/create-checkout', () => {
  beforeEach(async () => {
    await truncateAll();
    vi.clearAllMocks();
  });

  it('creates checkout session for new customer', async () => {
    const userId = await ensureUser({
      clerkUserId: 'user_new_checkout',
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
      'http://localhost/api/v1/stripe/create-checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
        },
        body: JSON.stringify({
          priceId: 'price_starter123',
          successUrl: 'http://localhost/success',
          cancelUrl: 'http://localhost/cancel',
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
      success_url: 'http://localhost/success',
      cancel_url: 'http://localhost/cancel',
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
      clerkUserId: 'user_existing_checkout',
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
      'http://localhost/api/v1/stripe/create-checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
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
      clerkUserId: 'user_default_urls',
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
      'http://localhost/api/v1/stripe/create-checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
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
          'http://localhost/settings/billing?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'http://localhost/settings/billing',
      })
    );
  });

  it('returns 400 when priceId is missing', async () => {
    await ensureUser({
      clerkUserId: 'user_missing_price',
      email: 'missing.price@example.com',
    });

    setTestUser('user_missing_price');

    const request = new Request(
      'http://localhost/api/v1/stripe/create-checkout',
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
    expect(body.error).toContain('priceId');
  });

  it('returns 401 when user not authenticated', async () => {
    setTestUser(''); // No user

    const request = new Request(
      'http://localhost/api/v1/stripe/create-checkout',
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

  it('returns 404 when user not found in database', async () => {
    setTestUser('user_does_not_exist');

    const request = new Request(
      'http://localhost/api/v1/stripe/create-checkout',
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

    expect(response.status).toBe(404);
  });

  it('handles Stripe API errors gracefully', async () => {
    await ensureUser({
      clerkUserId: 'user_stripe_error',
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
      'http://localhost/api/v1/stripe/create-checkout',
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
