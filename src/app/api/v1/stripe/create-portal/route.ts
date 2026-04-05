import type Stripe from 'stripe';
import { z } from 'zod';
import {
  isValidRedirectUrl,
  resolveRedirectUrl,
} from '@/app/api/v1/stripe/_shared/redirect';
import { canOpenBillingPortalForUser } from '@/features/billing/portal-eligibility';
import { getCustomerPortalUrl } from '@/features/billing/subscriptions';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { AppError, extractErrorCode, ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';

const DEFAULT_BILLING_SETTINGS_PATH = '/settings/billing';

const createPortalBodySchema = z.object({
  returnUrl: z.string().optional(),
});

/**
 * Factory for the create-portal POST handler. Accepts an optional Stripe
 * client for tests; production uses getStripe() inside getCustomerPortalUrl when omitted.
 */
export function createCreatePortalHandler(stripeInstance?: Stripe) {
  return withErrorBoundary(
    withAuthAndRateLimit('billing', async ({ req, user }) => {
      logger.info(
        {
          userId: user.id,
          authUserId: user.authUserId,
          subscriptionTier: user.subscriptionTier,
        },
        'billing portal attempt'
      );

      if (!canOpenBillingPortalForUser(user)) {
        throw new ValidationError(
          'Billing portal is available after your first subscription checkout'
        );
      }

      let body: unknown = {};
      try {
        body = await req.json();
      } catch (err) {
        const contentType = req.headers.get('content-type') ?? '';
        const contentLength = req.headers.get('content-length');
        const hasBody =
          contentType.includes('application/json') ||
          (contentLength !== null && contentLength !== '0');

        if (err instanceof SyntaxError && hasBody) {
          throw new ValidationError('Malformed JSON body', undefined, {
            userId: user.id,
            parseError: err.message,
          });
        }
      }

      const parseResult = createPortalBodySchema.safeParse(body);
      if (!parseResult.success) {
        const rawReturnUrl =
          typeof body === 'object' &&
          body !== null &&
          'returnUrl' in body &&
          typeof (body as { returnUrl?: unknown }).returnUrl === 'string'
            ? (body as { returnUrl: string }).returnUrl
            : undefined;
        const firstError = parseResult.error.issues[0];
        throw new ValidationError(
          firstError?.message ?? 'Invalid request body',
          undefined,
          {
            userId: user.id,
            returnUrl: rawReturnUrl,
            validationMessage: firstError?.message,
          }
        );
      }

      const { returnUrl } = parseResult.data;

      if (!isValidRedirectUrl(returnUrl)) {
        throw new ValidationError(
          'returnUrl must be a relative path or same-origin URL',
          undefined,
          { userId: user.id, returnUrl }
        );
      }

      const resolvedReturnUrl = resolveRedirectUrl(
        returnUrl,
        DEFAULT_BILLING_SETTINGS_PATH
      );

      let portalUrl: string | null = null;
      try {
        portalUrl = await getCustomerPortalUrl(
          user.stripeCustomerId,
          resolvedReturnUrl,
          stripeInstance
        );
      } catch (error) {
        const stripeErrorCode = extractErrorCode(error);
        throw new AppError('Failed to create customer portal session', {
          status: 500,
          code: 'STRIPE_PORTAL_SESSION_CREATION_FAILED',
          cause: error,
          logMeta: {
            userId: user.id,
            stripeCustomerId: user.stripeCustomerId,
            resolvedReturnUrl,
            stripeErrorCode,
            stripeErrorMessage:
              error instanceof Error ? error.message : String(error),
          },
        });
      }

      if (!portalUrl) {
        throw new AppError('Failed to create customer portal session', {
          status: 500,
          code: 'STRIPE_PORTAL_SESSION_CREATION_FAILED',
          logMeta: {
            userId: user.id,
            stripeCustomerId: user.stripeCustomerId,
            resolvedReturnUrl,
          },
        });
      }

      return json({ portalUrl });
    })
  );
}

export const POST = createCreatePortalHandler();
