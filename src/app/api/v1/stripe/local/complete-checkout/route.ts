import { NextResponse } from 'next/server';
import { isValidRedirectUrl } from '@/app/api/v1/stripe/_shared/redirect';
import {
  isLocalPriceId,
  tierFromLocalPriceId,
} from '@/features/billing/local-catalog';
import {
  getBillingStripeClient,
  isLocalStripeCompletionRouteEnabled,
} from '@/features/billing/stripe-commerce/factory';
import { LiveStripeGateway } from '@/features/billing/stripe-commerce/live-gateway';
import { replayLocalSubscriptionCreated } from '@/features/billing/stripe-commerce/local-checkout-replay';
import type { PlainHandler } from '@/lib/api/auth';
import { withAuth } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { appEnv } from '@/lib/config/env';
import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { logger } from '@/lib/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Finishes local Stripe checkout by applying a synthetic subscription.created
 * event through the same webhook dedupe + processor path as production.
 */
export const GET: PlainHandler = withErrorBoundary(
  withAuth(async ({ req, user }) => {
    if (!isLocalStripeCompletionRouteEnabled()) {
      return new NextResponse('Not found', { status: 404 });
    }

    const url = new URL(req.url);
    const priceId = url.searchParams.get('price_id');
    const nextPath = url.searchParams.get('next') ?? '/settings/billing';

    if (!priceId || !isLocalPriceId(priceId)) {
      throw new ValidationError(
        'Invalid or missing price_id for local checkout'
      );
    }

    if (!tierFromLocalPriceId(priceId)) {
      throw new ValidationError('Unknown local price id');
    }

    if (!isValidRedirectUrl(nextPath)) {
      throw new ValidationError('Invalid redirect target');
    }

    const gateway = new LiveStripeGateway(getBillingStripeClient());

    await replayLocalSubscriptionCreated({
      user: { id: user.id, email: user.email },
      priceId,
      gateway,
      serviceRoleDb: db,
      users,
      logger,
    });

    return NextResponse.redirect(new URL(nextPath, appEnv.url));
  })
);
