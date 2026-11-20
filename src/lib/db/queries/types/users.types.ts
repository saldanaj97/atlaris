import type { DbClient } from '@/lib/db/types';
import type { users } from '@supabase/schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

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

type DbUserInsert = InferInsertModel<typeof users>;

export type CreateUserData = Pick<
  DbUserInsert,
  'authUserId' | 'email' | 'name' | 'clerkUserUpdatedAt'
>;

export type UsersDbClient = DbClient;
