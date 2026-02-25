import type { PlainHandler } from '@/lib/api/auth';
import { withErrorBoundary } from '@/lib/api/auth';
import { RateLimitError } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { appEnv, stripeEnv } from '@/lib/config/env';
import {
  attachRequestIdHeader,
  createRequestContext,
} from '@/lib/logging/request-context';
import Stripe from 'stripe';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Minimal shape required to safely log and handle dev-mode webhook events.
const devWebhookEventSchema = z.object({ type: z.string() });

// Startup validation: STRIPE_WEBHOOK_DEV_MODE must only be enabled in development/test
if (stripeEnv.webhookDevMode && !(appEnv.isDevelopment || appEnv.isTest)) {
  throw new Error(
    'STRIPE_WEBHOOK_DEV_MODE is enabled outside development/test. This is a misconfiguration.'
  );
}

/**
 * Factory for the webhook POST handler. Accepts an optional Stripe
 * client for tests (used when syncing subscription events); production uses getStripe() when omitted.
 */
export function createWebhookHandler(stripeInstance?: Stripe): PlainHandler {
  return withErrorBoundary(async (req: Request) => {
    const { requestId, logger } = createRequestContext(req, {
      route: 'stripe_webhook',
    });
    const respond = (body: BodyInit | null, init?: ResponseInit) =>
      attachRequestIdHeader(new Response(body, init), requestId);

    try {
      checkIpRateLimit(req, 'webhook');
    } catch (error) {
      if (error instanceof RateLimitError) {
        logger.warn(
          {
            event: 'stripe_webhook_rate_limited',
            requestId,
          },
          'Stripe webhook rate limited'
        );
        return respond('rate limited', { status: 429 });
      }
      throw error;
    }

    // Basic body size guard (avoid excessive payloads)
    const MAX_BYTES = 256 * 1024; // 256KB
    const contentLengthHeader = req.headers.get('content-length');
    if (contentLengthHeader !== null) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
        logger.warn(
          {
            contentLength,
            maxBytes: MAX_BYTES,
          },
          'Stripe webhook payload too large (content-length)'
        );
        return respond('payload too large', { status: 413 });
      }
    }

    const rawBody = await req.text();
    const bodySize = Buffer.byteLength(rawBody, 'utf8');
    const signature = req.headers.get('stripe-signature');
    const webhookSecret = stripeEnv.webhookSecret;
    const isProd = appEnv.isProduction;
    const isDevOrTest = appEnv.isDevelopment || appEnv.isTest;
    const allowDevPayloads = isDevOrTest && stripeEnv.webhookDevMode;

    if (bodySize > MAX_BYTES) {
      logger.warn(
        { bodySize, maxBytes: MAX_BYTES },
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
      let devParsed: unknown;
      try {
        devParsed = JSON.parse(rawBody);
      } catch {
        return respond('bad request', { status: 400 });
      }

      const devParseResult = devWebhookEventSchema.safeParse(devParsed);
      if (!devParseResult.success) {
        return respond('bad request', { status: 400 });
      }

      logger.info(
        { type: devParseResult.data.type },
        'Stripe webhook dev mode event received (noop)'
      );
      return respond('ok');
    }

    // Ignore mode-mismatched events (e.g., test events hitting prod)
    const expectLive = isProd;
    if (event.livemode !== expectLive) {
      logger.warn(
        {
          eventId: event.id,
          eventType: event.type,
          eventLivemode: event.livemode,
          expectLive,
        },
        'Stripe webhook livemode mismatch'
      );
      return respond('ok');
    }

    // Use service-role DB to bypass RLS for system-originated Stripe webhooks.
    // Stripe webhooks run without a user session, so request-scoped RLS clients cannot authorize these writes.
    const { db } = await import('@/lib/db/service-role');
    const { stripeWebhookEvents, users } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const [insertedEvent] = await db
      .insert(stripeWebhookEvents)
      .values({
        eventId: event.id,
        livemode: event.livemode,
        type: event.type,
      })
      .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
      .returning({ eventId: stripeWebhookEvents.eventId });

    if (!insertedEvent) {
      logger.info(
        { type: event.type, eventId: event.id },
        'Duplicate Stripe webhook event skipped'
      );
      return respond('ok');
    }

    try {
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
          const syncTimeoutMs = 10_000;
          const abortController = new AbortController();
          const timeout = setTimeout(() => {
            abortController.abort();
          }, syncTimeoutMs);
          try {
            await syncSubscriptionToDb(subscription, stripeInstance, {
              signal: abortController.signal,
              timeoutMs: syncTimeoutMs,
            });
          } finally {
            clearTimeout(timeout);
          }
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
          const updatedUsers = await db
            .update(users)
            .set({
              subscriptionTier: 'free',
              subscriptionStatus: 'canceled',
              stripeSubscriptionId: null,
              subscriptionPeriodEnd: null,
              updatedAt: new Date(),
            })
            .where(eq(users.stripeCustomerId, customerId))
            .returning({ userId: users.id });

          if (updatedUsers.length === 0) {
            logger.warn(
              {
                eventId: event.id,
                customerId,
                stripeSubscriptionId: subscription.id,
              },
              'No user mapping found for customer.subscription.deleted'
            );
          } else {
            logger.info('Stripe subscription deletion webhook processed');
          }
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
            const updatedUsers = await db
              .update(users)
              .set({
                subscriptionStatus: 'past_due',
                updatedAt: new Date(),
              })
              .where(eq(users.stripeCustomerId, customerId))
              .returning({ userId: users.id });

            if (updatedUsers.length === 0) {
              logger.warn(
                {
                  eventId: event.id,
                  customerId,
                  invoiceId: invoice.id,
                },
                'No user mapping found for invoice.payment_failed'
              );
            } else {
              logger.info(
                { customerId },
                'Stripe invoice.payment_failed webhook processed'
              );
            }
          } else {
            logger.warn(
              {
                eventId: event.id,
                invoiceId: invoice.id,
                invoiceCustomer: invoice.customer ?? null,
              },
              'No stripeCustomerId available for invoice.payment_failed'
            );
          }
          break;
        }

        default:
          logger.debug({ type: event.type }, 'Unhandled Stripe webhook event');
          break;
      }

      return respond('ok');
    } catch (error) {
      try {
        await db
          .delete(stripeWebhookEvents)
          .where(eq(stripeWebhookEvents.eventId, event.id));
      } catch (cleanupError) {
        logger.error(
          {
            eventType: event.type,
            eventId: event.id,
            cleanupError,
          },
          'Failed to rollback Stripe webhook event record after processing error'
        );
      }

      logger.error(
        {
          eventType: event.type,
          eventId: event.id,
          error,
        },
        'Stripe webhook processing failed; event record rolled back'
      );
      throw error;
    }
  });
}

export const POST = createWebhookHandler();
