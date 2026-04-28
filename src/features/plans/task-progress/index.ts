export {
  applyTaskProgressUpdates,
  TASK_PROGRESS_MAX_BATCH,
  validateTaskProgressBatchInput,
} from './boundary';
export type { PlanDetailsCardStats, PlanOverviewStats } from './types';
export {
  buildTaskStatusMap,
  deriveActiveModuleId,
  deriveCompletedModuleIds,
  deriveFirstUnlockedIncompleteLessonId,
  deriveLessonLocks,
  deriveLessonState,
  deriveModuleCompletionSummary,
  deriveModuleProgressState,
  derivePlanDetailsCardStats,
  derivePlanOverviewStats,
} from './visible-state';
