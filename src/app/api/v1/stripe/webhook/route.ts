import { withErrorBoundary } from '@/lib/api/auth';
import { appEnv, stripeEnv } from '@/lib/config/env';
import {
  attachRequestIdHeader,
  createRequestContext,
} from '@/lib/logging/request-context';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorBoundary(async (req: Request) => {
  const { requestId, logger } = createRequestContext(req, {
    route: 'stripe_webhook',
  });
  const respond = (body: BodyInit | null, init?: ResponseInit) =>
    attachRequestIdHeader(new Response(body, init), requestId);

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = stripeEnv.webhookSecret;
  const isProd = appEnv.isProduction;
  const allowDevPayloads = !isProd && stripeEnv.webhookDevMode;

  // Basic body size guard (avoid excessive payloads)
  const MAX_BYTES = 256 * 1024; // 256KB
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BYTES) {
    logger.warn(
      { size: Buffer.byteLength(rawBody, 'utf8') },
      'Stripe webhook payload too large'
    );
    return respond('payload too large', { status: 413 });
  }

  // If a webhook secret is configured, verify the signature using our Stripe client
  let event: Stripe.Event;
  if (webhookSecret) {
    if (!signature) {
      logger.warn('Stripe webhook missing signature');
      return respond('missing signature', { status: 400 });
    }

    try {
      event = Stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
        300
      );
    } catch (error) {
      logger.error(
        {
          error,
        },
        'Stripe webhook signature verification failed'
      );
      return respond('signature verification failed', { status: 400 });
    }
  } else {
    // In non-production without secret, accept JSON payloads (dev convenience)
    if (!allowDevPayloads) {
      logger.error(
        'Stripe webhook misconfigured: missing secret outside development'
      );
      return respond('webhook misconfigured', { status: 500 });
    }
    try {
      event = JSON.parse(rawBody) as Stripe.Event;
    } catch {
      return respond('bad request', { status: 400 });
    }

    const eventType =
      event && typeof event === 'object' && 'type' in event
        ? ((event as { type?: string }).type ?? 'unknown')
        : 'unknown';
    logger.info(
      {
        type: eventType,
      },
      'Stripe webhook dev mode event received (noop)'
    );
    return respond('ok');
  }

  // Ignore mode-mismatched events (e.g., test events hitting prod)
  const expectLive = isProd;
  if (event.livemode !== expectLive) {
    return respond('ok');
  }

  const { db } = await import('@/lib/db/drizzle');
  const { stripeWebhookEvents, users } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const alreadyProcessed = await db
    .select({ eventId: stripeWebhookEvents.eventId })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, event.id))
    .limit(1);

  if (alreadyProcessed.length > 0) {
    logger.info(
      { type: event.type, eventId: event.id },
      'Duplicate Stripe webhook event skipped'
    );
    return respond('ok');
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      // Subscription is automatically handled by subscription.created event
      logger.info('Stripe checkout.session.completed webhook processed');
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const { syncSubscriptionToDb } = await import(
        '@/lib/stripe/subscriptions'
      );
      await syncSubscriptionToDb(subscription);
      logger.info(
        {
          type: event.type,
        },
        'Stripe subscription sync webhook processed'
      );
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;

      // Downgrade user to free tier
      await db
        .update(users)
        .set({
          subscriptionTier: 'free',
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
          subscriptionPeriodEnd: null,
          updatedAt: new Date(),
        })
        .where(eq(users.stripeCustomerId, customerId));

      logger.info('Stripe subscription deletion webhook processed');
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const customerId =
        typeof invoice.customer === 'string'
          ? invoice.customer
          : invoice.customer?.id;

      if (customerId) {
        // Mark subscription as past_due
        await db
          .update(users)
          .set({
            subscriptionStatus: 'past_due',
            updatedAt: new Date(),
          })
          .where(eq(users.stripeCustomerId, customerId));

        logger.info(
          { customerId },
          'Stripe invoice.payment_failed webhook processed'
        );
      }
      break;
    }

    default:
      logger.warn({ type: event.type }, 'Unhandled Stripe webhook event');
      break;
  }

  await db
    .insert(stripeWebhookEvents)
    .values({
      eventId: event.id,
      livemode: event.livemode,
      type: event.type,
    })
    .onConflictDoNothing({ target: stripeWebhookEvents.eventId });

  return respond('ok');
});
