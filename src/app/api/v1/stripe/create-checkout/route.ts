import { z } from 'zod';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { json, jsonError } from '@/lib/api/response';
import { appEnv } from '@/lib/config/env';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getStripe } from '@/lib/stripe/client';
import { createCustomer } from '@/lib/stripe/subscriptions';

const createCheckoutBodySchema = z.object({
  priceId: z
    .string({ message: 'priceId is required' })
    .min(1, 'priceId is required'),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
});

function isValidRedirectUrl(url: string | undefined): boolean {
  if (!url) return true;

  if (url.startsWith('/')) return true;

  const baseUrl = appEnv.url;
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    return parsed.origin === base.origin;
  } catch {
    return false;
  }
}

function resolveRedirectUrl(
  url: string | undefined,
  defaultPath: string
): string {
  const baseUrl = appEnv.url;

  if (!url) {
    return `${baseUrl}${defaultPath}`;
  }

  if (url.startsWith('/')) {
    return `${baseUrl}${url}`;
  }

  return url;
}

// POST /api/v1/stripe/create-checkout
export const POST = withErrorBoundary(
  withAuthAndRateLimit('billing', async ({ req, userId: authUserId }) => {
    const stripe = getStripe();

    const user = await getUserByAuthId(authUserId);
    if (!user) {
      return jsonError('User not found', { status: 404 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError('Invalid JSON in request body', { status: 400 });
    }

    const parseResult = createCheckoutBodySchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return jsonError(firstError?.message ?? 'Invalid request body', {
        status: 400,
      });
    }

    const { priceId, successUrl, cancelUrl } = parseResult.data;

    if (!isValidRedirectUrl(successUrl)) {
      return jsonError(
        'successUrl must be a relative path or same-origin URL',
        {
          status: 400,
        }
      );
    }

    if (!isValidRedirectUrl(cancelUrl)) {
      return jsonError('cancelUrl must be a relative path or same-origin URL', {
        status: 400,
      });
    }

    const customerId = await createCustomer(user.id, user.email);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: resolveRedirectUrl(
        successUrl,
        '/settings/billing?session_id={CHECKOUT_SESSION_ID}'
      ),
      cancel_url: resolveRedirectUrl(cancelUrl, '/settings/billing'),
    });

    if (!session.url) {
      return jsonError('Failed to create checkout session', { status: 500 });
    }

    return json({ sessionUrl: session.url });
  })
);
