import { eq } from 'drizzle-orm';
import type { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';

import { UserNotFoundError } from './errors';
import type { SubscriptionTier } from './tier-limits.types';

// Type for DB client (compatible with both runtime and service-role clients)
export type DbClient = ReturnType<typeof getDb>;

/**
 * Resolve user's subscription tier from database
 */
export async function resolveUserTier(
  userId: string,
  dbClient: DbClient
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

// Internal alias for backward compatibility
export const getUserTier = resolveUserTier;
