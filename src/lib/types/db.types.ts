import type {
  ModuleWithTasks,
  TaskResourceWithResource,
} from '@/lib/db/queries/types/modules.types';
import type { InferSelectModel } from 'drizzle-orm';

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
export type PlanGeneration = InferSelectModel<
  DbSchemaModule['planGenerations']
>;
export type GenerationAttempt = InferSelectModel<
  DbSchemaModule['generationAttempts']
>;

export type TaskWithResources = Task & {
  resources: TaskResourceWithResource[];
};

export type LearningPlanWithModules = LearningPlan & {
  modules: ModuleWithTasks[];
};

export type PlanSummary = {
  plan: LearningPlan;
  completion: number;
  completedTasks: number;
  totalTasks: number;
  totalMinutes: number;
  completedMinutes: number;
  modules: Module[];
  completedModules: number;
};

export type LearningPlanDetail = {
  plan: LearningPlanWithModules;
  totalTasks: number;
  completedTasks: number;
  latestAttempt: GenerationAttempt | null;
  attemptsCount: number;
};
