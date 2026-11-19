import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { UserNotFoundError } from './errors';
import { isTrialing } from '@/shared/constants/tier-limits';
import { users } from '@supabase/schema';
import { eq } from 'drizzle-orm';

export type { DbClient };

/**
 * Resolve user's subscription tier from database
 */
export async function resolveUserTier(
  userId: string,
  dbClient: DbClient,
): Promise<SubscriptionTier> {
  const [user] = await dbClient
    .select({ subscriptionTier: users.subscriptionTier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new UserNotFoundError(userId);
  }

  return user.subscriptionTier;
}

/** True while the user's paid plan is in its free trial. */
export async function resolveUserTrialing(
  userId: string,
  dbClient: DbClient,
): Promise<boolean> {
  const [user] = await dbClient
    .select({
      subscriptionTier: users.subscriptionTier,
      subscriptionStatus: users.subscriptionStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new UserNotFoundError(userId);
  }

  return isTrialing(user);
}
