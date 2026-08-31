import type { DbClient } from '@/lib/db/types';
import type { users } from '@supabase/schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

/** Full user row from the `users` table. */
export type DbUser = InferSelectModel<typeof users>;

export type ActorUser = Omit<
  DbUser,
  'analyticsTimezone' | 'preferredAiModel'
> & {
  analyticsTimezone: string;
  preferredAiModel: string | null;
  preferredRegenerationAiModel: string | null;
  preferredLessonAiModel: string | null;
};

/** Inferred insert type for the `users` table (use for create operations). */
type DbUserInsert = InferInsertModel<typeof users>;

/** Input data for createUser (authUserId, email, optional name). */
export type CreateUserData = Pick<
  DbUserInsert,
  'authUserId' | 'email' | 'name' | 'clerkUserUpdatedAt'
>;

/** Database client for user queries. */
export type UsersDbClient = DbClient;
