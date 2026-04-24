export {
	applyTaskProgressUpdates,
	TASK_PROGRESS_MAX_BATCH,
	validateTaskProgressBatchInput,
} from './boundary';
export type {
	ApplyTaskProgressUpdatesInput,
	ModuleCompletionSummary,
	PlanDetailsCardStats,
	PlanModuleTimelineStatus,
	PlanOverviewStats,
	TaskProgressUpdate,
	TaskProgressUpdateResult,
	TaskProgressVisibleState,
} from './types';
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
