import type Stripe from 'stripe';

import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import { getStripe } from '@/lib/stripe/client';
import { getUsageSummary } from '@/lib/stripe/usage';

const CANCEL_AT_PERIOD_END_SAFE_DEFAULT = false;

async function getCancelAtPeriodEnd(
  stripeSubscriptionId: string | null,
  stripeInstance?: Stripe
): Promise<boolean> {
  if (!stripeSubscriptionId) {
    return CANCEL_AT_PERIOD_END_SAFE_DEFAULT;
  }

  try {
    const stripe = stripeInstance ?? getStripe();
    const subscription =
      await stripe.subscriptions.retrieve(stripeSubscriptionId);

    if (subscription.cancel_at_period_end) {
      return true;
    }

    if (typeof subscription.cancel_at === 'number') {
      return subscription.cancel_at * 1000 > Date.now();
    }

    return false;
  } catch (error) {
    logger.warn(
      {
        stripeSubscriptionId,
        error,
      },
      'Failed to resolve cancelAtPeriodEnd from Stripe; using safe default'
    );

    return CANCEL_AT_PERIOD_END_SAFE_DEFAULT;
  }
}

/**
 * Factory for the subscription GET handler. Accepts an optional Stripe
 * client for tests; production uses getStripe() when omitted.
 */
export function createSubscriptionGetHandler(stripeInstance?: Stripe) {
  return withErrorBoundary(
    withAuthAndRateLimit('read', async ({ user }) => {
      const db = getDb();
      const usagePromise = getUsageSummary(user.id, db);
      const cancelAtPeriodEndPromise = getCancelAtPeriodEnd(
        user.stripeSubscriptionId,
        stripeInstance
      );
      const [usage, cancelAtPeriodEnd] = await Promise.all([
        usagePromise,
        cancelAtPeriodEndPromise,
      ]);

      // Build response
      const response = {
        tier: user.subscriptionTier,
        status: user.subscriptionStatus,
        periodEnd: user.subscriptionPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd,
        usage: {
          activePlans: usage.activePlans,
          regenerations: usage.regenerations,
          exports: usage.exports,
        },
      };

      return json(response);
    })
  );
}

// GET /api/v1/user/subscription
export const GET = createSubscriptionGetHandler();
