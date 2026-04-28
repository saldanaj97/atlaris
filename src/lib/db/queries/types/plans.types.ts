import type { InferSelectModel } from 'drizzle-orm';

import type { learningPlans, taskProgress, tasks } from '@/lib/db/schema';

type LearningPlanRow = InferSelectModel<typeof learningPlans>;
type TaskProgressRow = InferSelectModel<typeof taskProgress>;
type TaskRow = InferSelectModel<typeof tasks>;

/** Plan metadata returned with generation attempts for display/context. */
export interface PlanAttemptsPlanMeta {
  id: string;
  topic: string;
  generationStatus: LearningPlanRow['generationStatus'];
}

/** Task row shape returned by plan summary queries (partial task + plan id). */
export type PlanSummaryTaskRow = Pick<
  TaskRow,
  'id' | 'moduleId' | 'estimatedMinutes'
> & { planId: string };

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
