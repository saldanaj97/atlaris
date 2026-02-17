import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { getDb } from '@/lib/db/runtime';
import type { users } from '@/lib/db/schema';

/** Full user row from the `users` table. */
export type DbUser = InferSelectModel<typeof users>;

/** Inferred insert type for the `users` table (use for create operations). */
export type DbUserInsert = InferInsertModel<typeof users>;

/** Input data for createUser (authUserId, email, optional name). */
export type CreateUserData = Pick<
  DbUserInsert,
  'authUserId' | 'email' | 'name'
>;

/** RLS-enforced database client for user queries. */
export type UsersDbClient = ReturnType<typeof getDb>;

/** Result of a user deletion operation. */
export type DeleteUserResult =
  | { deleted: true; userId: string }
  | { deleted: false; userId?: string; reason?: string };
