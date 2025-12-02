import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type DbUser = InferSelectModel<typeof users>;

export async function getUserByClerkId(
  clerkUserId: string
): Promise<DbUser | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));
  return result[0];
}

export async function createUser(userData: {
  clerkUserId: string;
  email: string;
  name?: string;
}): Promise<DbUser | undefined> {
  const db = getDb();
  const result = await db.insert(users).values(userData).returning();
  return result[0];
}
