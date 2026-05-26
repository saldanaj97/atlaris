import type { getDb } from '@supabase/runtime';
import type { taskProgress, tasks } from '@supabase/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type DbTask = InferSelectModel<typeof tasks>;
export type DbTaskProgress = InferSelectModel<typeof taskProgress>;

export type TasksDbClient = ReturnType<typeof getDb>;
