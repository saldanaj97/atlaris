import type Stripe from 'stripe';
import { z } from 'zod';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { AppError, extractErrorCode, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import { getCustomerPortalUrl } from '@/features/billing/subscriptions';

const DEFAULT_BILLING_SETTINGS_PATH = '/settings/billing';

const createPortalBodySchema = z.object({
  returnUrl: z.string().optional(),
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

      if (!user.stripeCustomerId) {
        throw new ValidationError('No Stripe customer found for user');
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
