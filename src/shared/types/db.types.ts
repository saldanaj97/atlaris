import type { InferSelectModel } from 'drizzle-orm';
import type {
  ModuleWithTasks,
  TaskResourceWithResource,
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

export type User = InferSelectModel<DbSchemaModule['users']>;
export type LearningPlan = InferSelectModel<DbSchemaModule['learningPlans']>;
export type Module = InferSelectModel<DbSchemaModule['modules']>;
export type Task = InferSelectModel<DbSchemaModule['tasks']>;
export type TaskResource = InferSelectModel<DbSchemaModule['taskResources']>;
export type TaskProgress = InferSelectModel<DbSchemaModule['taskProgress']>;
export type GenerationAttempt = InferSelectModel<
  DbSchemaModule['generationAttempts']
>;

export type TaskWithResources = Task & {
  resources: TaskResourceWithResource[];
};

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

export type PlanSummary = ProgressMetrics & {
  plan: LearningPlan;
  modules: Module[];
};

type LightweightPlanListFields = Pick<
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
export type LightweightPlanSummary = LightweightPlanListFields &
  ProgressMetrics & {
    moduleCount: number;
  };

export type LearningPlanDetail = Pick<
  ProgressMetrics,
  | 'completedTasks'
  | 'totalTasks'
  | 'totalMinutes'
  | 'completedMinutes'
  | 'completedModules'
> & {
  plan: LearningPlanWithModules;
  latestAttempt: GenerationAttempt | null;
  attemptsCount: number;
};
