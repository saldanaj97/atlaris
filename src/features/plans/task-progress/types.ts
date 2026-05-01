import type {
  DbTaskProgress,
  TasksDbClient,
} from '@/lib/db/queries/types/tasks.types';
import type { ProgressStatus } from '@/shared/types/db.types';

/**
 * Module timeline / gating status derived for UI gating.
 * `locked` means previous modules are not complete enough for normal navigation.
 */
export type PlanModuleTimelineStatus = 'completed' | 'active' | 'locked';

/**
 * Write request for a single task progress change.
 * Used by server actions and the task-progress boundary before DB persistence.
 *
 * @property taskId Task row to update.
 * @property status Next progress status to persist.
 */
export type TaskProgressUpdate = { taskId: string; status: ProgressStatus };

/**
 * Boundary input for applying a batch of task progress writes.
 * Used internally after request authentication; values are validated before DB access.
 *
 * @property userId Authenticated app user who owns the plan/tasks.
 * @property planId Plan scope for ownership checks and path revalidation.
 * @property moduleId Optional narrower module scope for module-detail updates.
 * @property updates User-requested progress changes, deduped with last write winning.
 * @property dbClient Request-scoped or transactional DB client.
 * @property now Optional timestamp override for deterministic tests.
 */
export interface ApplyTaskProgressUpdatesInput {
  userId: string;
  planId: string;
  moduleId?: string;
  updates: TaskProgressUpdate[];
  dbClient: TasksDbClient;
  now?: Date;
}

/**
 * Minimal post-write UI state returned by the write boundary.
 * This is not a full read projection; `appliedByTaskId` only reflects persisted writes.
 *
 * @property appliedByTaskId Applied status keyed by task id for optimistic UI reconciliation.
 */
export interface TaskProgressVisibleState {
  appliedByTaskId: Record<string, ProgressStatus>;
}

/**
 * Result of applying task progress updates.
 * Used by server actions to revalidate paths and surface the write snapshot.
 *
 * @property progress DB rows returned from the upsert.
 * @property revalidatePaths App routes that should be invalidated after the write.
 * @property visibleState Minimal applied-state payload for UI reconciliation.
 */
export interface TaskProgressUpdateResult {
  progress: DbTaskProgress[];
  revalidatePaths: string[];
  visibleState: TaskProgressVisibleState;
}

/**
 * Shared completion numbers computed from effective task status.
 * Values are derived after applying in-memory overrides; `estimatedWeeks` rounds up from total minutes and weekly hours.
 *
 * @property completedTasks Number of tasks whose effective status is completed.
 * @property totalTasks Total tasks in the current projection.
 * @property totalMinutes Sum of estimated task minutes.
 * @property completionPercentage Rounded percent complete from completedTasks / totalTasks.
 * @property estimatedWeeks Rounded-up duration estimate, or null when weekly hours are unavailable.
 */
type BaseCompletionStats = {
  totalTasks: number;
  completedTasks: number;
  totalMinutes: number;
  completionPercentage: number;
  estimatedWeeks: number | null;
};

/**
 * Module-header stats computed from a module detail projection.
 * Used by the module detail UI; it does not include plan-level schedule metadata.
 *
 * @property completionPercent Rounded percent complete from completedTasks / totalTasks.
 */
export type ModuleCompletionSummary = Omit<
  BaseCompletionStats,
  'completionPercentage' | 'estimatedWeeks'
> & {
  completionPercent: number;
};

/**
 * Plan overview-header stats derived for the full plan page.
 * Tags come from display metadata such as skill level, weekly hours, and module count.
 * `estimatedCompletionDate` is a localized display label, not a parseable API date.
 *
 * @property completedModules Number of modules where every task is complete.
 * @property totalModules Total modules in the plan projection.
 * @property estimatedCompletionDate Localized display label for today plus estimatedWeeks, or null.
 * @property tags Display chips sourced from plan metadata and module count.
 */
export type PlanOverviewStats = BaseCompletionStats & {
  completedModules: number;
  totalModules: number;
  estimatedCompletionDate: string | null;
  tags: string[];
};

/**
 * Plan details-card stats derived for compact card UI.
 * Use this when module counts, tags, and estimated completion label are not needed.
 */
export type PlanDetailsCardStats = BaseCompletionStats;
