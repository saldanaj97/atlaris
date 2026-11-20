import type { DbClient } from '@/lib/db/types';
import type { ProgressStatus } from '@/shared/types/db.types';
import type {
  learningActivityEvents,
  taskProgress,
  tasks,
} from '@supabase/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type DbTask = InferSelectModel<typeof tasks>;
export type DbTaskProgress = InferSelectModel<typeof taskProgress>;
export type DbLearningActivityEvent = InferSelectModel<
  typeof learningActivityEvents
>;

export type RecentLearningActivityRow = {
  id: string;
  planId: string;
  planTopic: string;
  taskTitle: string;
  status: ProgressStatus;
  taskEstimatedMinutes: number;
  occurredAt: Date;
};

export type TasksDbClient = DbClient;
