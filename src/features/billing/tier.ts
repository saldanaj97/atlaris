import { eq } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import { UserNotFoundError } from './errors';

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
