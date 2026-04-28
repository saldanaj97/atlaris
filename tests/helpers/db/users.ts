import { eq } from 'drizzle-orm';

import { users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

export async function ensureUser({
  authUserId,
  email,
  name,
  subscriptionTier,
}: {
  authUserId: string;
  email: string;
  name?: string;
  subscriptionTier?: 'free' | 'starter' | 'pro';
}): Promise<string> {
  // Try to find existing user first
  const existing = await db.query.users.findFirst({
    where: (fields, operators) => operators.eq(fields.authUserId, authUserId),
  });

  if (existing) {
    // If tier is specified and different from existing, update it
    if (subscriptionTier && existing.subscriptionTier !== subscriptionTier) {
      await db
        .update(users)
        .set({ subscriptionTier })
        .where(eq(users.id, existing.id));
    }
    return existing.id;
  }

  // User doesn't exist, create it
  const [inserted] = await db
    .insert(users)
    .values({
      authUserId,
      email,
      name: name ?? email,
      ...(subscriptionTier && { subscriptionTier }),
    })
    .returning({ id: users.id });

  if (!inserted?.id) {
    throw new Error(`Failed to create user for ${authUserId}`);
  }

  return inserted.id;
}
