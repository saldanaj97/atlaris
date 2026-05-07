import { isValidRedirectUrl } from '@/app/api/v1/stripe/_shared/redirect';
import {
  isLocalPriceId,
  tierFromLocalPriceId,
} from '@/features/billing/local-catalog';
import {
  executeLocalSubscriptionReplay,
  isLocalStripeCompletionRouteEnabled,
} from '@/features/billing/stripe-commerce/factory';
import type { PlainHandler } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { requestBoundary } from '@/lib/api/request-boundary';
import { appEnv } from '@/lib/config/env';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Finishes local Stripe checkout by applying a synthetic subscription.created
 * event through the same webhook dedupe + processor path as production.
 */
export const GET: PlainHandler = requestBoundary.route(
  async ({ req, actor }) => {
    if (!isLocalStripeCompletionRouteEnabled()) {
      return new NextResponse('Not found', { status: 404 });
    }

    const url = new URL(req.url);
    const priceId = url.searchParams.get('price_id');
    const nextPath = url.searchParams.get('next') ?? '/settings/billing';

    if (!priceId || !isLocalPriceId(priceId)) {
      throw new ValidationError(
        'Invalid or missing price_id for local checkout',
      );
    }

    if (!tierFromLocalPriceId(priceId)) {
      throw new ValidationError('Unknown local price id');
    }

    if (!isValidRedirectUrl(nextPath)) {
      throw new ValidationError('Invalid redirect target');
    }

    await executeLocalSubscriptionReplay({
      user: { id: actor.id, email: actor.email },
      priceId,
    });

    return NextResponse.redirect(new URL(nextPath, appEnv.url));
  },
);
