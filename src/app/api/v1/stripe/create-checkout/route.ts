import Stripe from 'stripe';
import { z } from 'zod';
import {
  isValidRedirectUrl,
  resolveRedirectUrl,
} from '@/app/api/v1/stripe/_shared/redirect';
import { getStripe } from '@/features/billing/client';
import { isLocalPriceId } from '@/features/billing/local-catalog';
import { isAllowedCheckoutPriceId } from '@/features/billing/price-catalog';
import { createCustomer } from '@/features/billing/subscriptions';
import type { PlainHandler } from '@/lib/api/auth';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { AppError, ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { json } from '@/lib/api/response';
import { stripeEnv } from '@/lib/config/env';

const createCheckoutBodySchema = z
  .object({
    priceId: z
      .string({ message: 'priceId is required' })
      .min(1, 'priceId is required'),
    successUrl: z.string().optional(),
    cancelUrl: z.string().optional(),
  })
  .strict();

/**
 * Factory for the create-checkout POST handler. Accepts an optional Stripe
 * client for tests; production uses getStripe() when omitted.
 */
export function createCreateCheckoutHandler(
  stripeInstance?: Stripe
): PlainHandler {
  return withErrorBoundary(
    withAuthAndRateLimit('billing', async ({ req, user }) => {
      const body = await parseJsonBody(req, {
        mode: 'required',
        onMalformedJson: () =>
          new ValidationError('Invalid JSON in request body'),
      });

      const parseResult = createCheckoutBodySchema.safeParse(body);
      if (!parseResult.success) {
        const firstError = parseResult.error.issues[0];
        throw new ValidationError(
          firstError?.message ?? 'Invalid request body'
        );
      }

      const { priceId, successUrl, cancelUrl } = parseResult.data;

      if (stripeEnv.localMode && !isLocalPriceId(priceId)) {
        throw new ValidationError(
          'priceId must be a canonical local catalog id when STRIPE_LOCAL_MODE is enabled'
        );
      }

      if (!stripeEnv.localMode && !isAllowedCheckoutPriceId(priceId)) {
        throw new ValidationError(
          'priceId must match an approved billing plan'
        );
      }

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

      const stripe = stripeInstance ?? getStripe();
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
          error instanceof Stripe.errors.StripeError ? error.type : undefined;
        const stripeCode =
          error instanceof Stripe.errors.StripeError ? error.code : undefined;

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
            cause: error,
            logMeta: {
              userId: user.id,
              priceId,
              stripeErrorMessage: message,
              stripeType,
              stripeCode,
            },
          }
        );
      }

      if (!session.url) {
        throw new AppError('Failed to create checkout session', {
          status: 500,
          code: 'STRIPE_CHECKOUT_SESSION_CREATION_FAILED',
          logMeta: { userId: user.id },
        });
      }

      return json({ sessionUrl: session.url });
    })
  );
}

export const POST = createCreateCheckoutHandler();
