import type { learningPlans, taskProgress, tasks } from '@supabase/schema';
import type { InferSelectModel } from 'drizzle-orm';

type LearningPlanRow = InferSelectModel<typeof learningPlans>;
type TaskProgressRow = InferSelectModel<typeof taskProgress>;
type TaskRow = InferSelectModel<typeof tasks>;

export interface PlanAttemptsPlanMeta {
  id: string;
  topic: string;
  generationStatus: LearningPlanRow['generationStatus'];
}

export type PlanSummaryTaskRow = Pick<
  TaskRow,
  'id' | 'moduleId' | 'estimatedMinutes'
> & { planId: string };

export type PlanDetailTaskRow = Omit<
  TaskRow,
  'lessonContent' | 'lessonContentUpdatedAt'
>;

export type PlanProgressStatusRow = Pick<TaskProgressRow, 'taskId' | 'status'>;

/**
 * Field subset shared by lightweight plan list rows (API + read projection).
 * Canonical query-layer contract; re-exported from `@/shared/types/db.types`.
 */
export type LightweightPlanListRow = Pick<
  LearningPlanRow,
  | 'id'
  | 'topic'
  | 'skillLevel'
  | 'learningStyle'
  | 'visibility'
  | 'origin'
  | 'generationStatus'
  | 'createdAt'
  | 'updatedAt'
>;

export type LightweightModuleMetricsRow = {
  planId: string;
  totalTasks: number;
  completedTasks: number;
  totalMinutes: number;
  completedMinutes: number;
};
