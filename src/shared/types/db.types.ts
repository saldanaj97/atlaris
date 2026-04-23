import type { InferSelectModel } from 'drizzle-orm';
import type { GenerationAttemptRecord } from '@/lib/db/queries/types/attempts.types';
import type {
	Module,
	ModuleWithTasks,
} from '@/lib/db/queries/types/modules.types';

type DbEnumsModule = typeof import('@/lib/db/enums');
type DbSchemaModule = typeof import('@/lib/db/schema');

export type SkillLevel = DbEnumsModule['skillLevel']['enumValues'][number];
export type LearningStyle =
	DbEnumsModule['learningStyle']['enumValues'][number];
export type ResourceType = DbEnumsModule['resourceType']['enumValues'][number];
export type ProgressStatus =
	DbEnumsModule['progressStatus']['enumValues'][number];
export type GenerationStatus =
	DbEnumsModule['generationStatus']['enumValues'][number];

export type LearningPlan = InferSelectModel<DbSchemaModule['learningPlans']>;

// Canonical row shapes live in lib/db/queries/types; re-export here so existing
// callers that already pull from @/shared/types/db.types keep working.
export type {
	Module,
	Task,
	TaskProgress,
} from '@/lib/db/queries/types/modules.types';

/**
 * Canonical name for the generation_attempts row; aliased here so existing
 * callers that import from `@/shared/types/db.types` continue to work.
 * Prefer `GenerationAttemptRecord` from `@/lib/db/queries/types/attempts.types`
 * in new code.
 */
export type GenerationAttempt = GenerationAttemptRecord;

export type LearningPlanWithModules = LearningPlan & {
	modules: ModuleWithTasks[];
};

export type ProgressMetrics = {
	completion: number;
	completedTasks: number;
	totalTasks: number;
	totalMinutes: number;
	completedMinutes: number;
	completedModules: number;
};

/**
 * Summary view of a plan with computed progress metrics.
 *
 * `attemptsCount` is populated only when the originating query includes generation
 * attempt metrics. Callers must handle `undefined` for lightweight paths that skip
 * those extra reads to avoid additional query cost.
 */
export type PlanSummary = ProgressMetrics & {
	plan: LearningPlan;
	modules: Module[];
	attemptsCount?: number;
};

/**
 * Field subset shared by lightweight plan list rows (API + read projection).
 * Exported so summary builders use the same shape the API contract assumes.
 */
export type LightweightPlanListRow = Pick<
	LearningPlan,
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

/** Lightweight plan summary for API list views. */
export type LightweightPlanSummary = LightweightPlanListRow &
	ProgressMetrics & {
		moduleCount: number;
	};

export type LearningPlanDetail = Omit<ProgressMetrics, 'completion'> & {
	plan: LearningPlanWithModules;
	latestAttempt: GenerationAttempt | null;
	attemptsCount: number;
};
