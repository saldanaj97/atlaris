import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { isValidRedirectUrl } from '@/app/api/v1/stripe/_shared/redirect';
import { getStripe } from '@/features/billing/client';
import {
  isLocalPriceId,
  tierFromLocalPriceId,
} from '@/features/billing/local-catalog';
import { handleStripeWebhookDedupeAndApply } from '@/features/billing/stripe-webhook-processor';
import { createCustomer } from '@/features/billing/subscriptions';
import type { PlainHandler } from '@/lib/api/auth';
import { withAuth } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { appEnv, localProductTestingEnv, stripeEnv } from '@/lib/config/env';
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
    if (!stripeEnv.localMode || !localProductTestingEnv.enabled) {
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

    const stripe = getStripe();
    const customerId = await createCustomer(user.id, user.email, stripe);

    const subscription = {
      id: `sub_local_${randomUUID()}`,
      object: 'subscription',
      customer: customerId,
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: priceId,
          },
        ],
      },
      current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
    } as unknown as Stripe.Subscription;

    const event = {
      id: `evt_local_${randomUUID()}`,
      object: 'event',
      type: 'customer.subscription.created',
      data: { object: subscription },
      livemode: false,
    } as Stripe.Event;

    await handleStripeWebhookDedupeAndApply(event, {
      stripe,
      logger,
      db,
      users,
    });

    return NextResponse.redirect(new URL(nextPath, appEnv.url));
  })
);
