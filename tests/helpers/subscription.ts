import { eq } from 'drizzle-orm';

import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

export type SubscriptionTier = 'free' | 'starter' | 'pro';
type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

interface MarkUserAsSubscribedOptions {
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionPeriodEnd?: Date | null;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export async function markUserAsSubscribed(
  userId: string,
  options: MarkUserAsSubscribedOptions = {}
): Promise<{
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}> {
  const suffix = userId.replace(/-/g, '');
  const stripeCustomerId =
    options.stripeCustomerId ??
    `cus_${suffix}-${Math.random().toString(36).slice(2, 8)}`;
  const stripeSubscriptionId =
    options.stripeSubscriptionId ??
    `sub_${suffix}-${Math.random().toString(36).slice(2, 8)}`;

  await db
    .update(users)
    .set({
      stripeCustomerId,
      stripeSubscriptionId,
      subscriptionTier: options.subscriptionTier ?? 'starter',
      subscriptionStatus: options.subscriptionStatus ?? 'active',
      ...(options.subscriptionPeriodEnd !== undefined && {
        subscriptionPeriodEnd: options.subscriptionPeriodEnd,
      }),
    })
    .where(eq(users.id, userId));

  return { stripeCustomerId, stripeSubscriptionId };
}

function normalizeTag(tag: string) {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeUserId(userId: string) {
  return userId.replace(/-/g, '').slice(0, 10);
}

export function buildStripeCustomerId(userId: string, tag: string) {
  return `cus_${normalizeTag(tag)}-${normalizeUserId(userId)}`;
}

export function buildStripeSubscriptionId(userId: string, tag: string) {
  return `sub_${normalizeTag(tag)}-${normalizeUserId(userId)}`;
}
