import { z } from 'zod';
import type Stripe from 'stripe';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { AppError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
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

/**
 * Factory for the create-checkout POST handler. Accepts an optional Stripe
 * client for tests; production uses getStripe() when omitted.
 */
export function createCreateCheckoutHandler(stripeInstance?: Stripe) {
  const getStripeClient = () => stripeInstance ?? getStripe();

  return withErrorBoundary(
    withAuthAndRateLimit('billing', async ({ req, user }) => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new ValidationError('Invalid JSON in request body');
      }

      const parseResult = createCheckoutBodySchema.safeParse(body);
      if (!parseResult.success) {
        const firstError = parseResult.error.issues[0];
        throw new ValidationError(
          firstError?.message ?? 'Invalid request body'
        );
      }

      const { priceId, successUrl, cancelUrl } = parseResult.data;

      if (!isValidRedirectUrl(successUrl)) {
        throw new ValidationError(
          'successUrl must be a relative path or same-origin URL'
        );
      }

      if (!isValidRedirectUrl(cancelUrl)) {
        throw new ValidationError(
          'cancelUrl must be a relative path or same-origin URL'
        );
      }

      const customerId = await createCustomer(
        user.id,
        user.email,
        stripeInstance
      );

      const stripe = getStripeClient();
      let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
      try {
        session = await stripe.checkout.sessions.create({
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stripeType =
          typeof error === 'object' &&
          error !== null &&
          'type' in error &&
          typeof (error as { type?: unknown }).type === 'string'
            ? (error as { type: string }).type
            : undefined;
        const stripeCode =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof (error as { code?: unknown }).code === 'string'
            ? (error as { code: string }).code
            : undefined;

        logger.error(
          {
            userId: user.id,
            priceId,
            stripeErrorMessage: message,
            stripeType,
            stripeCode,
            error,
          },
          'Stripe checkout session creation failed'
        );

        const isClientError =
          stripeType === 'StripeInvalidRequestError' ||
          stripeCode === 'resource_missing';

        throw new AppError(
          isClientError
            ? 'Invalid checkout request. Please check the plan and try again.'
            : 'Unable to start checkout. Please try again later.',
          {
            status: isClientError ? 400 : 500,
            code: 'STRIPE_CHECKOUT_SESSION_CREATION_FAILED',
            details: stripeCode ? { stripeCode } : undefined,
          }
        );
      }

      if (!session.url) {
        throw new AppError('Failed to create checkout session', {
          status: 500,
          code: 'STRIPE_CHECKOUT_SESSION_CREATION_FAILED',
        });
      }

      return json({ sessionUrl: session.url });
    })
  );
}

// POST /api/v1/stripe/create-checkout
export const POST = createCreateCheckoutHandler();
