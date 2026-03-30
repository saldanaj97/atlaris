import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { syncSubscriptionToDb } from '@/features/billing/subscriptions';
import { stripeWebhookEvents } from '@/lib/db/schema';
import type { createLogger } from '@/lib/logging/logger';

type Logger = ReturnType<typeof createLogger>;

export type StripeWebhookSideEffectDeps = {
  stripe?: Stripe;
  logger: Logger;
  db: typeof import('@/lib/db/service-role').db;
  users: typeof import('@/lib/db/schema').users;
};

/**
 * Applies a verified Stripe event after idempotency insert succeeded.
 * Used by the production webhook route and local billing completion flow.
 */
export async function applyStripeWebhookEvent(
  event: Stripe.Event,
  deps: StripeWebhookSideEffectDeps
): Promise<void> {
  const { stripe: stripeInstance, logger, db, users } = deps;

  const updateUsersByStripeCustomerId = async (
    customerId: string,
    set: {
      subscriptionTier?: 'free';
      subscriptionStatus?: 'canceled' | 'past_due';
      stripeSubscriptionId?: null;
      subscriptionPeriodEnd?: null;
      cancelAtPeriodEnd?: boolean;
      updatedAt: Date;
    }
  ) =>
    db
      .update(users)
      .set(set)
      .where(eq(users.stripeCustomerId, customerId))
      .returning({ userId: users.id });

  switch (event.type) {
    case 'checkout.session.completed': {
      logger.info('Stripe checkout.session.completed webhook processed');
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
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
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;

      const updatedUsers = await updateUsersByStripeCustomerId(customerId, {
        subscriptionTier: 'free',
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        subscriptionPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      });

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
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === 'string'
          ? invoice.customer
          : invoice.customer?.id;

      if (customerId) {
        const updatedUsers = await updateUsersByStripeCustomerId(customerId, {
          subscriptionStatus: 'past_due',
          updatedAt: new Date(),
        });

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
}

/**
 * Idempotent insert + apply + rollback on failure (matches production webhook route).
 */
export async function handleStripeWebhookDedupeAndApply(
  event: Stripe.Event,
  deps: StripeWebhookSideEffectDeps
): Promise<'inserted' | 'duplicate'> {
  const [insertedRow] = await deps.db
    .insert(stripeWebhookEvents)
    .values({
      eventId: event.id,
      livemode: event.livemode,
      type: event.type,
    })
    .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
    .returning({ eventId: stripeWebhookEvents.eventId });

  if (!insertedRow) {
    deps.logger.info(
      { type: event.type, eventId: event.id },
      'Duplicate Stripe webhook event skipped'
    );
    return 'duplicate';
  }

  try {
    await applyStripeWebhookEvent(event, deps);
  } catch (error) {
    try {
      await deps.db
        .delete(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.eventId, event.id));
    } catch (cleanupError) {
      deps.logger.error(
        {
          eventType: event.type,
          eventId: event.id,
          cleanupError,
        },
        'Failed to rollback Stripe webhook event record after processing error'
      );
    }

    deps.logger.error(
      {
        eventType: event.type,
        eventId: event.id,
        error,
      },
      'Stripe webhook processing failed; event record rolled back'
    );
    throw error;
  }

  return 'inserted';
}
