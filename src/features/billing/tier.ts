import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { UserNotFoundError } from './errors';
import { isTrialing } from '@/shared/constants/tier-limits';
import { users } from '@supabase/schema';
import { eq } from 'drizzle-orm';

export type { DbClient };

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
