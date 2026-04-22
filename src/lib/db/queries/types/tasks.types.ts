import type { InferSelectModel } from 'drizzle-orm';
import type { getDb } from '@/lib/db/runtime';
import type { taskProgress, tasks } from '@/lib/db/schema';

export type DbTask = InferSelectModel<typeof tasks>;
export type DbTaskProgress = InferSelectModel<typeof taskProgress>;

export type TasksDbClient = ReturnType<typeof getDb>;

/** Transaction handle passed to `TasksDbClient.transaction` callbacks. */
export type TasksTransaction = Parameters<
	Parameters<TasksDbClient['transaction']>[0]
>[0];
