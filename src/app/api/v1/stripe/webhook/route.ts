import { withErrorBoundary } from '@/lib/api/auth';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorBoundary(async (req: Request) => {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  const allowDevPayloads =
    !isProd && process.env.STRIPE_WEBHOOK_DEV_MODE === '1';

  // Basic body size guard (avoid excessive payloads)
  const MAX_BYTES = 256 * 1024; // 256KB
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BYTES) {
    return new Response('payload too large', { status: 413 });
  }

  // If a webhook secret is configured, verify the signature using our Stripe client
  let event: Stripe.Event;
  if (webhookSecret) {
    if (!signature) {
      return new Response('missing signature', { status: 400 });
    }

    try {
      event = Stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
        300
      );
    } catch (error) {
      console.error('Stripe webhook signature verification failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return new Response('signature verification failed', { status: 400 });
    }
  } else {
    // In non-production without secret, accept JSON payloads (dev convenience)
    if (!allowDevPayloads) {
      return new Response('webhook misconfigured', { status: 500 });
    }
    try {
      event = JSON.parse(rawBody) as Stripe.Event;
    } catch {
      return new Response('bad request', { status: 400 });
    }

    const eventType =
      event && typeof event === 'object' && 'type' in event
        ? ((event as { type?: string }).type ?? 'unknown')
        : 'unknown';
    console.log('Stripe webhook dev mode event received (noop)', {
      type: eventType,
    });
    return new Response('ok');
  }

  // Ignore mode-mismatched events (e.g., test events hitting prod)
  const expectLive = isProd;
  if (event.livemode !== expectLive) {
    return new Response('ok');
  }

  const { db } = await import('@/lib/db/drizzle');
  const { stripeWebhookEvents, users } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const inserted = await db
    .insert(stripeWebhookEvents)
    .values({
      eventId: event.id,
      livemode: event.livemode,
      type: event.type,
    })
    .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
    .returning({ eventId: stripeWebhookEvents.eventId });

  if (inserted.length === 0) {
    console.log('Duplicate Stripe webhook event skipped', { type: event.type });
    return new Response('ok');
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      // Subscription is automatically handled by subscription.created event
      console.log('Stripe checkout.session.completed webhook processed');
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const { syncSubscriptionToDb } = await import(
        '@/lib/stripe/subscriptions'
      );
      await syncSubscriptionToDb(subscription);
      console.log('Stripe subscription sync webhook processed', {
        type: event.type,
      });
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

      console.log('Stripe subscription deletion webhook processed');
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

        console.log('Stripe invoice.payment_failed webhook processed');
      }
      break;
    }

    default:
      console.log('Unhandled Stripe webhook event', { type: event.type });
      break;
  }

  return new Response('ok');
});
