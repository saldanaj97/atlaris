import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db/runtime';
import { db as serviceDb } from '@/lib/db/service-role';
import { users } from '@/lib/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type DbUser = InferSelectModel<typeof users>;

export async function getUserByAuthId(
  authUserId: string
): Promise<DbUser | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.authUserId, authUserId));
  return result[0];
}

export async function createUser(userData: {
  authUserId: string;
  email: string;
  name?: string;
}): Promise<DbUser | undefined> {
  const db = getDb();
  const result = await db.insert(users).values(userData).returning();
  return result[0];
}

export async function deleteUserByAuthId(
  authUserId: string
): Promise<{ deleted: boolean; userId?: string }> {
  const result = await serviceDb
    .delete(users)
    .where(eq(users.authUserId, authUserId))
    .returning({ id: users.id });

  if (result.length === 0) {
    return { deleted: false };
  }

  return { deleted: true, userId: result[0].id };
}

// TODO: [OPENROUTER-MIGRATION] Add function when preferredAiModel column exists:
// export async function updateUserModelPreference(
//   userId: string,
//   modelId: string
// ): Promise<void> {
//   const db = getDb();
//   await db
//     .update(users)
//     .set({ preferredAiModel: modelId })
//     .where(eq(users.id, userId));
// }

// TODO: [OPENROUTER-MIGRATION] Add function to get user's preferred model:
// export async function getUserPreferredModel(userId: string): Promise<string | null> {
//   const db = getDb();
//   const user = await db
//     .select({ preferredAiModel: users.preferredAiModel })
//     .from(users)
//     .where(eq(users.id, userId));
//   return user[0]?.preferredAiModel ?? null;
// }
