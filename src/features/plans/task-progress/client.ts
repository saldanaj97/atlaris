export type { PlanOverviewStats } from './types';
export {
  buildTaskStatusMap,
  deriveActiveModuleId,
  deriveCompletedModuleIds,
  deriveFirstUnlockedIncompleteLessonId,
  deriveLessonLocks,
  deriveLessonState,
  deriveModuleCompletionSummary,
  deriveModuleProgressState,
  derivePlanOverviewStats,
} from './visible-state';
