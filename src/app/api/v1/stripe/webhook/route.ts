import { withErrorBoundary } from '@/lib/api/auth';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorBoundary(async (req: Request) => {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  // Basic body size guard (avoid excessive payloads)
  const MAX_BYTES = 512 * 1024; // 512KB
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BYTES) {
    return new Response('payload too large', { status: 413 });
  }

  // In production, a webhook secret must be configured.
  if (!webhookSecret) {
    if (isProd) {
      return new Response('webhook misconfigured', { status: 500 });
    }
    // In non-production, accept payloads to unblock local dev
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      const type =
        parsed && typeof parsed === 'object' && 'type' in parsed
          ? (parsed as { type?: string }).type
          : undefined;
      switch (type) {
        case 'checkout.session.completed':
        case 'invoice.payment_succeeded':
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
        default:
          break;
      }
      return new Response('ok');
    } catch {
      return new Response('bad request', { status: 400 });
    }
  }

  if (!signature) {
    return new Response('missing signature', { status: 400 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return new Response('server misconfigured', { status: 500 });
  }

  // Stripe SDK types are not fully recognized by ESLint's type checker
  const stripe = new Stripe(secretKey, {
    apiVersion: '2025-09-30.clover',
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return new Response('signature verification failed', { status: 400 });
  }

  // Ignore mode-mismatched events (e.g., test events hitting prod)
  const expectLive = isProd;
  if (event.livemode !== expectLive) {
    return new Response('ok');
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      // Subscription is automatically handled by subscription.created event
      console.log('Checkout session completed:', session.id);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const { syncSubscriptionToDb } = await import(
        '@/lib/stripe/subscriptions'
      );
      await syncSubscriptionToDb(subscription);
      console.log('Subscription synced:', subscription.id);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;

      // Downgrade user to free tier
      const { eq } = await import('drizzle-orm');
      const { db } = await import('@/lib/db/drizzle');
      const { users } = await import('@/lib/db/schema');

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

      console.log('Subscription deleted, user downgraded:', customerId);
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
        const { eq } = await import('drizzle-orm');
        const { db } = await import('@/lib/db/drizzle');
        const { users } = await import('@/lib/db/schema');

        await db
          .update(users)
          .set({
            subscriptionStatus: 'past_due',
            updatedAt: new Date(),
          })
          .where(eq(users.stripeCustomerId, customerId));

        console.log('Payment failed, marked as past_due:', customerId);
      }
      break;
    }

    default:
      console.log('Unhandled event type:', event.type);
      break;
  }

  return new Response('ok');
});
