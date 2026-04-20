import type Stripe from 'stripe';
import { z } from 'zod';
import type { StripeCommerceBoundary } from '@/features/billing/stripe-commerce';
import {
  createStripeCommerceBoundary,
  getStripeCommerceBoundary,
} from '@/features/billing/stripe-commerce/factory';
import { LiveStripeGateway } from '@/features/billing/stripe-commerce/live-gateway';
import type { PlainHandler } from '@/lib/api/auth';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { json } from '@/lib/api/response';
import { getFirstZodIssueMessage } from '@/lib/api/zod-issue';

const createCheckoutBodySchema = z
  .object({
    priceId: z
      .string({ message: 'priceId is required' })
      .min(1, 'priceId is required'),
    successUrl: z.string().optional(),
    cancelUrl: z.string().optional(),
  })
  .strict();

export type CreateCheckoutHandlerDeps = {
  boundary?: StripeCommerceBoundary;
  /** @deprecated Prefer `boundary`; builds a boundary with this Stripe client for tests */
  stripe?: Stripe;
};

/**
 * Factory for the create-checkout POST handler.
 */
export function createCreateCheckoutHandler(
  deps: CreateCheckoutHandlerDeps = {}
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
        throw new ValidationError(
          getFirstZodIssueMessage(parseResult.error) ?? 'Invalid request body'
        );
      }

      const { priceId, successUrl, cancelUrl } = parseResult.data;

      const boundary =
        deps.boundary ??
        (deps.stripe
          ? createStripeCommerceBoundary({
              gateway: new LiveStripeGateway(deps.stripe),
            })
          : getStripeCommerceBoundary());

      const { sessionUrl } = await boundary.beginCheckout({
        actor: { userId: user.id, email: user.email },
        priceId,
        successUrl,
        cancelUrl,
      });

      return json({ sessionUrl });
    })
  );
}

export const POST = createCreateCheckoutHandler();
