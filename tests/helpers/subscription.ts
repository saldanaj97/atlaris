import { db } from '@/lib/db/service-role';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Mark a user as subscribed with unique Stripe IDs.
 * Generates unique Stripe customer and subscription IDs based on the user ID
 * to avoid unique constraint violations in tests.
 *
 * @param userId - The user ID to mark as subscribed
 * @param tier - The subscription tier (default: 'starter')
 * @param status - The subscription status (default: 'active')
 */
export async function markUserAsSubscribed(
  userId: string,
  tier: 'free' | 'starter' | 'pro' = 'starter',
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' = 'active'
) {
  // Generate unique IDs based on the user ID to avoid collisions
  const stripeCustomerId = `cus_${userId}`;
  const stripeSubscriptionId = `sub_${userId}`;

  await db
    .update(users)
    .set({
      stripeCustomerId,
      stripeSubscriptionId,
      subscriptionTier: tier,
      subscriptionStatus: status,
    })
    .where(eq(users.id, userId));
}
