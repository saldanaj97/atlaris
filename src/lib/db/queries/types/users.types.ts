import type { getDb } from '@supabase/runtime';
import type { users } from '@supabase/schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

/** Full user row from the `users` table. */
export type DbUser = InferSelectModel<typeof users>;

/** Inferred insert type for the `users` table (use for create operations). */
type DbUserInsert = InferInsertModel<typeof users>;

/** Input data for createUser (authUserId, email, optional name). */
export type CreateUserData = Pick<
  DbUserInsert,
  'authUserId' | 'email' | 'name'
>;

/** RLS-enforced database client for user queries. */
export type UsersDbClient = ReturnType<typeof getDb>;
